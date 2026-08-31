begin;

alter table public.events
  add column is_historical boolean not null default false,
  add constraint events_historical_closed check (not is_historical or status = 'closed');

grant select (is_historical) on public.events to authenticated;

-- Read-only access is intentionally excluded from the accountability log.
delete from public.audit_logs
where action in ('qr_viewed', 'event_pin_viewed');

create or replace function public.create_historical_event(
  p_name text,
  p_description text,
  p_venue text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_attendance_mode text,
  p_department_ids uuid[],
  p_year_levels smallint[],
  p_attendance jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_late_at timestamptz;
  v_attendance_count integer;
  v_expected_count integer;
begin
  if not public.current_user_enabled() or not public.is_system_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 200 then
    raise exception 'Enter a valid event name' using errcode = '22023';
  end if;
  if p_start_at is null or p_end_at is null or p_start_at > p_end_at then
    raise exception 'Enter a valid event schedule' using errcode = '22023';
  end if;
  if p_end_at > now() then
    raise exception 'A completed event must end in the past' using errcode = '22023';
  end if;
  if p_attendance_mode not in ('check_in_only', 'check_in_out') then
    raise exception 'Invalid attendance mode' using errcode = '22023';
  end if;
  if coalesce(array_length(p_department_ids, 1), 0) = 0 then
    raise exception 'Select at least one department' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_department_ids) department_id
    where department_id is null or not exists (
      select 1 from public.departments d
      where d.id = department_id and d.deleted_at is null
    )
  ) then
    raise exception 'Invalid department selection' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_year_levels, '{}'::smallint[])) year_level
    where year_level not between 1 and 4
  ) then
    raise exception 'Invalid year level' using errcode = '22023';
  end if;
  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array'
    or jsonb_array_length(p_attendance) = 0
    or jsonb_array_length(p_attendance) > 5000 then
    raise exception 'Select between 1 and 5000 attendees' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_attendance) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(item->>'status', '') not in ('present', 'late')
  ) then
    raise exception 'Invalid attendance entry' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_attendance) entry(student_id uuid, status text)
    group by entry.student_id
    having count(*) > 1
  ) then
    raise exception 'A student can only be recorded once' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_attendance) entry(student_id uuid, status text)
    left join public.students s on s.id = entry.student_id
    where s.id is null or not s.is_active or s.deleted_at is not null
      or not (s.department_id = any(p_department_ids))
      or (coalesce(array_length(p_year_levels, 1), 0) > 0 and not (s.year_level = any(p_year_levels)))
  ) then
    raise exception 'An attendee is outside the selected active audience' using errcode = '22023';
  end if;

  v_late_at := least(p_start_at + interval '15 minutes', p_end_at);
  perform set_config('app.audit_actor_id', v_actor::text, true);

  insert into public.events (
    name, description, venue, start_at, end_at, check_in_opens_at, late_after,
    check_in_closes_at, attendance_mode, check_out_opens_at, check_out_closes_at,
    pin_hash, status, created_by, is_historical
  ) values (
    btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_venue), ''),
    p_start_at, p_end_at, p_start_at, v_late_at, p_end_at,
    p_attendance_mode,
    case when p_attendance_mode = 'check_in_out' then p_end_at else null end,
    case when p_attendance_mode = 'check_in_out' then p_end_at else null end,
    extensions.crypt(encode(extensions.gen_random_bytes(18), 'hex'), extensions.gen_salt('bf', 10)),
    'closed', v_actor, true
  ) returning id into v_event_id;

  insert into public.event_departments(event_id, department_id)
  select v_event_id, department_id
  from (select distinct unnest(p_department_ids) as department_id) selected;

  insert into public.event_year_levels(event_id, year_level)
  select v_event_id, year_level
  from (select distinct unnest(coalesce(p_year_levels, '{}'::smallint[])) as year_level) selected;

  insert into public.event_assignments(event_id, user_id, assigned_by)
  values (v_event_id, v_actor, v_actor);

  insert into public.attendance (
    event_id, student_id, check_in_at, check_in_status, check_in_method, check_in_by,
    check_out_at, check_out_method, check_out_by
  )
  select
    v_event_id,
    entry.student_id,
    case when entry.status = 'late' then v_late_at else p_start_at end,
    entry.status,
    'manual',
    v_actor,
    case when p_attendance_mode = 'check_in_out' then p_end_at else null end,
    case when p_attendance_mode = 'check_in_out' then 'manual' else null end,
    case when p_attendance_mode = 'check_in_out' then v_actor else null end
  from jsonb_to_recordset(p_attendance) entry(student_id uuid, status text);

  get diagnostics v_attendance_count = row_count;
  select count(*) into v_expected_count
  from public.students s
  where s.is_active and s.deleted_at is null
    and s.department_id = any(p_department_ids)
    and (coalesce(array_length(p_year_levels, 1), 0) = 0 or s.year_level = any(p_year_levels));

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'historical_attendance_recorded',
    'event',
    v_event_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'attendance_count', v_attendance_count,
      'absent_count', greatest(v_expected_count - v_attendance_count, 0)
    )
  );

  return jsonb_build_object(
    'eventId', v_event_id,
    'attendanceCount', v_attendance_count,
    'expectedCount', v_expected_count
  );
end;
$$;

create or replace function public.delete_audit_logs(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.current_user_enabled() or not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 500 then
    raise exception 'Select between 1 and 500 activity records' using errcode = '22023';
  end if;

  delete from public.audit_logs
  where id = any(p_ids);
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.audit_logs(actor_user_id, action, entity_type, metadata)
    values (
      auth.uid(),
      'audit_logs_deleted',
      'audit_log',
      jsonb_build_object('deleted_count', v_deleted)
    );
  end if;
  return v_deleted;
end;
$$;

revoke all on function public.create_historical_event(text, text, text, timestamptz, timestamptz, text, uuid[], smallint[], jsonb) from public, anon, authenticated;
revoke all on function public.delete_audit_logs(uuid[]) from public, anon, authenticated;
grant execute on function public.create_historical_event(text, text, text, timestamptz, timestamptz, text, uuid[], smallint[], jsonb) to authenticated;
grant execute on function public.delete_audit_logs(uuid[]) to authenticated;

commit;
