begin;

create or replace function public.get_event_attendance_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected bigint;
  v_checked_in bigint;
  v_present bigint;
  v_late bigint;
  v_checked_out bigint;
begin
  if not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.events where id = p_event_id and deleted_at is null
  ) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  select count(*) into v_expected
  from public.get_event_expected_students(p_event_id);

  select
    count(*),
    count(*) filter (where a.check_in_status = 'present'),
    count(*) filter (where a.check_in_status = 'late'),
    count(*) filter (where a.check_out_at is not null)
  into v_checked_in, v_present, v_late, v_checked_out
  from public.attendance a
  where a.event_id = p_event_id;

  return jsonb_build_object(
    'expected', v_expected,
    'checkedIn', v_checked_in,
    'remaining', greatest(v_expected - v_checked_in, 0),
    'present', v_present,
    'late', v_late,
    'checkedOut', v_checked_out
  );
end;
$$;

create or replace function public.search_event_students(
  p_event_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table (
  student_id uuid,
  student_number text,
  full_name text,
  year_level smallint,
  department_code text,
  check_in_at timestamptz,
  check_in_status text,
  check_out_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if length(v_query) < 2 then
    return;
  end if;

  return query
  select
    s.id,
    s.student_number,
    s.full_name,
    s.year_level,
    d.code,
    a.check_in_at,
    a.check_in_status,
    a.check_out_at
  from public.students s
  join public.departments d on d.id = s.department_id
  left join public.attendance a
    on a.event_id = p_event_id and a.student_id = s.id
  where s.is_active
    and s.deleted_at is null
    and d.deleted_at is null
    and exists (
      select 1 from public.event_departments ed
      where ed.event_id = p_event_id and ed.department_id = s.department_id
    )
    and (
      not exists (select 1 from public.event_year_levels yl where yl.event_id = p_event_id)
      or exists (
        select 1 from public.event_year_levels yl
        where yl.event_id = p_event_id and yl.year_level = s.year_level
      )
    )
    and (
      position(v_query in lower(s.student_number)) > 0
      or position(v_query in lower(s.full_name)) > 0
    )
  order by
    case
      when lower(s.student_number) = v_query then 0
      when lower(s.student_number) like v_query || '%' then 1
      when lower(s.full_name) like v_query || '%' then 2
      else 3
    end,
    s.full_name
  limit v_limit;
end;
$$;

revoke all on function public.get_event_attendance_summary(uuid) from public, anon, authenticated;
revoke all on function public.search_event_students(uuid, text, integer) from public, anon, authenticated;

grant execute on function public.get_event_attendance_summary(uuid) to authenticated;
grant execute on function public.search_event_students(uuid, text, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'attendance'
    ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end;
$$;

commit;
