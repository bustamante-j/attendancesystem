begin;

alter table public.attendance
  add column remarks text,
  add constraint attendance_remarks_length check (remarks is null or length(remarks) <= 500);

alter table public.events
  add column attendance_finalized_at timestamptz,
  add column attendance_finalized_by uuid references public.profiles(id) on delete restrict,
  add constraint events_attendance_finalization_consistent check (
    (attendance_finalized_at is null and attendance_finalized_by is null)
    or (attendance_finalized_at is not null and attendance_finalized_by is not null)
  );

create index events_attendance_finalized_by_idx on public.events (attendance_finalized_by)
where attendance_finalized_by is not null;

create table public.event_guest_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  full_name text not null,
  reference_number text,
  affiliation text,
  attendance_status text not null,
  recorded_at timestamptz not null,
  remarks text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guest_name_valid check (btrim(full_name) <> '' and length(full_name) <= 200),
  constraint event_guest_reference_length check (reference_number is null or length(reference_number) <= 80),
  constraint event_guest_affiliation_length check (affiliation is null or length(affiliation) <= 200),
  constraint event_guest_status_valid check (attendance_status in ('present', 'late')),
  constraint event_guest_remarks_length check (remarks is null or length(remarks) <= 500)
);

create index event_guest_attendance_event_id_idx
  on public.event_guest_attendance (event_id, full_name, id);
create index event_guest_attendance_recorded_by_idx
  on public.event_guest_attendance (recorded_by);

create trigger event_guest_attendance_set_updated_at
before update on public.event_guest_attendance
for each row execute function public.set_updated_at();

create or replace function public.can_edit_event_roster(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_enabled() and exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.deleted_at is null
      and e.status in ('open', 'closed')
      and e.attendance_finalized_at is null
      and (
        public.is_system_admin()
        or (public.current_user_role() = 'faculty' and e.created_by = (select auth.uid()))
      )
  );
$$;

alter table public.event_guest_attendance enable row level security;

create policy event_guest_attendance_read
on public.event_guest_attendance
for select
to authenticated
using ((select public.can_access_event(event_id)));

grant select on public.event_guest_attendance to authenticated;
grant select (attendance_finalized_at, attendance_finalized_by) on public.events to authenticated;

create or replace function public.get_event_attendance_roster(p_event_id uuid)
returns table (
  attendance_id uuid,
  student_id uuid,
  student_number text,
  full_name text,
  sex text,
  year_level smallint,
  department_id uuid,
  department_name text,
  department_code text,
  is_expected boolean,
  attendance_status text,
  check_in_at timestamptz,
  check_in_method text,
  check_out_at timestamptz,
  check_out_method text,
  remarks text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_enabled() or not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.events where id = p_event_id and deleted_at is null
  ) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  return query
  with included_students as (
    select expected.student_id, true as expected
    from public.get_event_expected_students(p_event_id) expected
    union all
    select a.student_id, false as expected
    from public.attendance a
    where a.event_id = p_event_id
  ), roster_students as (
    select included.student_id, bool_or(included.expected) as expected
    from included_students included
    group by included.student_id
  )
  select
    a.id,
    s.id,
    s.student_number,
    s.full_name,
    s.sex,
    s.year_level,
    d.id,
    d.name,
    d.code,
    roster_students.expected,
    coalesce(a.check_in_status, 'absent'),
    a.check_in_at,
    a.check_in_method,
    a.check_out_at,
    a.check_out_method,
    a.remarks
  from roster_students
  join public.students s on s.id = roster_students.student_id
  join public.departments d on d.id = s.department_id
  left join public.attendance a on a.event_id = p_event_id and a.student_id = s.id
  order by d.code, s.year_level, s.full_name, s.id;
end;
$$;

create or replace function public.set_event_roster_attendance(
  p_event_id uuid,
  p_student_ids uuid[],
  p_status text,
  p_recorded_at timestamptz default now(),
  p_check_out_at timestamptz default null,
  p_preserve_check_out boolean default true,
  p_remarks text default null,
  p_preserve_remarks boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_changes jsonb;
  v_changed integer;
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  if not public.can_edit_event_roster(p_event_id) then
    raise exception 'You cannot edit this event roster' using errcode = '42501';
  end if;
  if p_status not in ('present', 'late', 'absent') then
    raise exception 'Invalid attendance status' using errcode = '22023';
  end if;
  if p_recorded_at is null then
    raise exception 'Enter a valid attendance time' using errcode = '22023';
  end if;
  if p_check_out_at is not null and p_check_out_at < p_recorded_at then
    raise exception 'Check-out cannot be earlier than check-in' using errcode = '22023';
  end if;
  if length(coalesce(p_remarks, '')) > 500 then
    raise exception 'Remarks must be 500 characters or fewer' using errcode = '22023';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0
    or array_length(p_student_ids, 1) > 500 then
    raise exception 'Select between 1 and 500 students' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_student_ids) selected(student_id)
    where selected.student_id is null
      or not exists (
        select 1 from public.students s
        where s.id = selected.student_id and s.deleted_at is null
      )
  ) then
    raise exception 'One or more students are unavailable' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', selected.student_id,
    'previous', case when a.id is null then 'null'::jsonb else to_jsonb(a) end
  )), '[]'::jsonb)
  into v_changes
  from (select distinct unnest(p_student_ids) as student_id) selected
  left join public.attendance a
    on a.event_id = p_event_id and a.student_id = selected.student_id;

  if p_status = 'absent' then
    delete from public.attendance
    where event_id = p_event_id and student_id = any(p_student_ids);
    get diagnostics v_changed = row_count;
  else
    insert into public.attendance (
      event_id,
      student_id,
      check_in_at,
      check_in_status,
      check_in_method,
      check_in_by,
      check_out_at,
      check_out_method,
      check_out_by,
      remarks
    )
    select
      p_event_id,
      selected.student_id,
      p_recorded_at,
      p_status,
      'manual',
      v_actor,
      p_check_out_at,
      case when p_check_out_at is null then null else 'manual' end,
      case when p_check_out_at is null then null else v_actor end,
      v_remarks
    from (select distinct unnest(p_student_ids) as student_id) selected
    on conflict (event_id, student_id) do update set
      check_in_at = case
        when p_preserve_check_out then public.attendance.check_in_at
        else excluded.check_in_at
      end,
      check_in_status = excluded.check_in_status,
      check_in_method = 'manual',
      check_in_by = v_actor,
      check_out_at = case
        when p_preserve_check_out then public.attendance.check_out_at
        else excluded.check_out_at
      end,
      check_out_method = case
        when p_preserve_check_out then public.attendance.check_out_method
        else excluded.check_out_method
      end,
      check_out_by = case
        when p_preserve_check_out then public.attendance.check_out_by
        else excluded.check_out_by
      end,
      remarks = case
        when p_preserve_remarks then public.attendance.remarks
        else excluded.remarks
      end;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 or p_status <> 'absent' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (
      v_actor,
      'attendance_roster_changed',
      'event',
      p_event_id,
      jsonb_build_object(
        'event_id', p_event_id,
        'status', p_status,
        'changed_count', v_changed,
        'changes', v_changes
      )
    );
  end if;

  return coalesce(v_changed, 0);
end;
$$;

create or replace function public.add_event_guest_attendee(
  p_event_id uuid,
  p_full_name text,
  p_reference_number text,
  p_affiliation text,
  p_status text,
  p_recorded_at timestamptz,
  p_remarks text default null
)
returns public.event_guest_attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.event_guest_attendance%rowtype;
begin
  if not public.can_edit_event_roster(p_event_id) then
    raise exception 'You cannot edit this event roster' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' or length(btrim(p_full_name)) > 200 then
    raise exception 'Enter a valid attendee name' using errcode = '22023';
  end if;
  if p_status not in ('present', 'late') or p_recorded_at is null then
    raise exception 'Enter a valid attendance status and time' using errcode = '22023';
  end if;
  if length(coalesce(p_reference_number, '')) > 80
    or length(coalesce(p_affiliation, '')) > 200
    or length(coalesce(p_remarks, '')) > 500 then
    raise exception 'One or more attendee fields are too long' using errcode = '22023';
  end if;

  insert into public.event_guest_attendance (
    event_id, full_name, reference_number, affiliation, attendance_status,
    recorded_at, remarks, recorded_by
  ) values (
    p_event_id,
    btrim(p_full_name),
    nullif(btrim(coalesce(p_reference_number, '')), ''),
    nullif(btrim(coalesce(p_affiliation, '')), ''),
    p_status,
    p_recorded_at,
    nullif(btrim(coalesce(p_remarks, '')), ''),
    auth.uid()
  ) returning * into v_guest;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'guest_attendee_changed',
    'event_guest_attendance',
    v_guest.id,
    jsonb_build_object(
      'event_id', p_event_id,
      'name', v_guest.full_name,
      'change_type', 'added',
      'changes', jsonb_build_array(jsonb_build_object('guest_id', v_guest.id, 'previous', 'null'::jsonb))
    )
  );
  return v_guest;
end;
$$;

create or replace function public.update_event_guest_attendee(
  p_guest_id uuid,
  p_full_name text,
  p_reference_number text,
  p_affiliation text,
  p_status text,
  p_recorded_at timestamptz,
  p_remarks text default null
)
returns public.event_guest_attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.event_guest_attendance%rowtype;
  v_guest public.event_guest_attendance%rowtype;
begin
  select * into v_previous
  from public.event_guest_attendance
  where id = p_guest_id
  for update;
  if not found then raise exception 'Temporary attendee not found' using errcode = 'P0002'; end if;
  if not public.can_edit_event_roster(v_previous.event_id) then
    raise exception 'You cannot edit this event roster' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' or length(btrim(p_full_name)) > 200 then
    raise exception 'Enter a valid attendee name' using errcode = '22023';
  end if;
  if p_status not in ('present', 'late') or p_recorded_at is null then
    raise exception 'Enter a valid attendance status and time' using errcode = '22023';
  end if;
  if length(coalesce(p_reference_number, '')) > 80
    or length(coalesce(p_affiliation, '')) > 200
    or length(coalesce(p_remarks, '')) > 500 then
    raise exception 'One or more attendee fields are too long' using errcode = '22023';
  end if;

  update public.event_guest_attendance set
    full_name = btrim(p_full_name),
    reference_number = nullif(btrim(coalesce(p_reference_number, '')), ''),
    affiliation = nullif(btrim(coalesce(p_affiliation, '')), ''),
    attendance_status = p_status,
    recorded_at = p_recorded_at,
    remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
    recorded_by = auth.uid()
  where id = p_guest_id
  returning * into v_guest;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'guest_attendee_changed',
    'event_guest_attendance',
    v_guest.id,
    jsonb_build_object(
      'event_id', v_guest.event_id,
      'name', v_guest.full_name,
      'change_type', 'updated',
      'changes', jsonb_build_array(jsonb_build_object('guest_id', v_guest.id, 'previous', to_jsonb(v_previous)))
    )
  );
  return v_guest;
end;
$$;

create or replace function public.remove_event_guest_attendee(p_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.event_guest_attendance%rowtype;
begin
  select * into v_previous
  from public.event_guest_attendance
  where id = p_guest_id
  for update;
  if not found then raise exception 'Temporary attendee not found' using errcode = 'P0002'; end if;
  if not public.can_edit_event_roster(v_previous.event_id) then
    raise exception 'You cannot edit this event roster' using errcode = '42501';
  end if;

  delete from public.event_guest_attendance where id = p_guest_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'guest_attendee_changed',
    'event_guest_attendance',
    v_previous.id,
    jsonb_build_object(
      'event_id', v_previous.event_id,
      'name', v_previous.full_name,
      'change_type', 'removed',
      'changes', jsonb_build_array(jsonb_build_object('guest_id', v_previous.id, 'previous', to_jsonb(v_previous)))
    )
  );
end;
$$;

create or replace function public.undo_last_event_roster_change(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.audit_logs%rowtype;
  v_change jsonb;
  v_previous jsonb;
begin
  if not public.can_edit_event_roster(p_event_id) then
    raise exception 'You cannot edit this event roster' using errcode = '42501';
  end if;

  select log.* into v_latest
  from public.audit_logs log
  where log.action in ('attendance_roster_changed', 'guest_attendee_changed')
    and log.metadata->>'event_id' = p_event_id::text
    and not exists (
      select 1
      from public.audit_logs undone
      where undone.action = 'attendance_roster_undone'
        and undone.metadata->>'source_audit_id' = log.id::text
    )
  order by log.created_at desc, log.id desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('undone', false, 'message', 'There is no roster change to undo.');
  end if;
  if v_latest.actor_user_id <> auth.uid() and not public.is_super_admin() then
    raise exception 'Only the person who made the latest change can undo it' using errcode = '42501';
  end if;

  for v_change in select value from jsonb_array_elements(v_latest.metadata->'changes')
  loop
    v_previous := v_change->'previous';
    if v_change ? 'student_id' then
      if v_previous is null or jsonb_typeof(v_previous) = 'null' then
        delete from public.attendance
        where event_id = p_event_id and student_id = (v_change->>'student_id')::uuid;
      else
        insert into public.attendance (
          id, event_id, student_id, check_in_at, check_in_status, check_in_method,
          check_in_by, check_out_at, check_out_method, check_out_by, created_at,
          updated_at, remarks
        ) values (
          (v_previous->>'id')::uuid,
          (v_previous->>'event_id')::uuid,
          (v_previous->>'student_id')::uuid,
          (v_previous->>'check_in_at')::timestamptz,
          v_previous->>'check_in_status',
          v_previous->>'check_in_method',
          (v_previous->>'check_in_by')::uuid,
          nullif(v_previous->>'check_out_at', '')::timestamptz,
          nullif(v_previous->>'check_out_method', ''),
          nullif(v_previous->>'check_out_by', '')::uuid,
          (v_previous->>'created_at')::timestamptz,
          (v_previous->>'updated_at')::timestamptz,
          nullif(v_previous->>'remarks', '')
        )
        on conflict (event_id, student_id) do update set
          check_in_at = excluded.check_in_at,
          check_in_status = excluded.check_in_status,
          check_in_method = excluded.check_in_method,
          check_in_by = excluded.check_in_by,
          check_out_at = excluded.check_out_at,
          check_out_method = excluded.check_out_method,
          check_out_by = excluded.check_out_by,
          remarks = excluded.remarks;
      end if;
    elsif v_change ? 'guest_id' then
      if v_previous is null or jsonb_typeof(v_previous) = 'null' then
        delete from public.event_guest_attendance
        where id = (v_change->>'guest_id')::uuid and event_id = p_event_id;
      else
        insert into public.event_guest_attendance (
          id, event_id, full_name, reference_number, affiliation, attendance_status,
          recorded_at, remarks, recorded_by, created_at, updated_at
        ) values (
          (v_previous->>'id')::uuid,
          (v_previous->>'event_id')::uuid,
          v_previous->>'full_name',
          nullif(v_previous->>'reference_number', ''),
          nullif(v_previous->>'affiliation', ''),
          v_previous->>'attendance_status',
          (v_previous->>'recorded_at')::timestamptz,
          nullif(v_previous->>'remarks', ''),
          (v_previous->>'recorded_by')::uuid,
          (v_previous->>'created_at')::timestamptz,
          (v_previous->>'updated_at')::timestamptz
        )
        on conflict (id) do update set
          full_name = excluded.full_name,
          reference_number = excluded.reference_number,
          affiliation = excluded.affiliation,
          attendance_status = excluded.attendance_status,
          recorded_at = excluded.recorded_at,
          remarks = excluded.remarks,
          recorded_by = excluded.recorded_by;
      end if;
    end if;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'attendance_roster_undone',
    'event',
    p_event_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'source_audit_id', v_latest.id,
      'source_action', v_latest.action
    )
  );

  return jsonb_build_object('undone', true, 'message', 'The latest roster change was undone.');
end;
$$;

create or replace function public.set_event_attendance_finalized(
  p_event_id uuid,
  p_finalized boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;

  if p_finalized then
    if v_event.status <> 'closed' then
      raise exception 'Close the event before finalizing attendance' using errcode = '22023';
    end if;
    if not public.current_user_enabled() or not (
      public.is_system_admin()
      or (public.current_user_role() = 'faculty' and v_event.created_by = auth.uid())
    ) then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;
    if v_event.attendance_finalized_at is null then
      update public.events set attendance_finalized_at = now(), attendance_finalized_by = auth.uid()
      where id = p_event_id;
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      values (auth.uid(), 'event_attendance_finalized', 'event', p_event_id,
        jsonb_build_object('event_id', p_event_id, 'name', v_event.name));
    end if;
  else
    if not public.current_user_enabled() or not public.is_super_admin() then
      raise exception 'Only a Super Admin can reopen finalized attendance' using errcode = '42501';
    end if;
    if v_event.attendance_finalized_at is not null then
      update public.events set attendance_finalized_at = null, attendance_finalized_by = null
      where id = p_event_id;
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      values (auth.uid(), 'event_attendance_reopened', 'event', p_event_id,
        jsonb_build_object('event_id', p_event_id, 'name', v_event.name));
    end if;
  end if;
end;
$$;

revoke all on function public.can_edit_event_roster(uuid) from public, anon, authenticated;
revoke all on function public.get_event_attendance_roster(uuid) from public, anon, authenticated;
revoke all on function public.set_event_roster_attendance(uuid, uuid[], text, timestamptz, timestamptz, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.add_event_guest_attendee(uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.update_event_guest_attendee(uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.remove_event_guest_attendee(uuid) from public, anon, authenticated;
revoke all on function public.undo_last_event_roster_change(uuid) from public, anon, authenticated;
revoke all on function public.set_event_attendance_finalized(uuid, boolean) from public, anon, authenticated;

grant execute on function public.can_edit_event_roster(uuid) to authenticated;
grant execute on function public.get_event_attendance_roster(uuid) to authenticated;
grant execute on function public.set_event_roster_attendance(uuid, uuid[], text, timestamptz, timestamptz, boolean, text, boolean) to authenticated;
grant execute on function public.add_event_guest_attendee(uuid, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_event_guest_attendee(uuid, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.remove_event_guest_attendee(uuid) to authenticated;
grant execute on function public.undo_last_event_roster_change(uuid) to authenticated;
grant execute on function public.set_event_attendance_finalized(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_guest_attendance'
    ) then
    alter publication supabase_realtime add table public.event_guest_attendance;
  end if;
end;
$$;

commit;
