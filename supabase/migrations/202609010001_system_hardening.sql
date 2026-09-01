begin;

-- Replace the Events page's per-event summary and audience requests with one
-- bounded, set-based call. Authorization is rechecked for every requested
-- event so callers cannot use the function to bypass event RLS.
create or replace function public.get_event_overviews(p_event_ids uuid[])
returns table (
  event_id uuid,
  department_ids uuid[],
  year_levels smallint[],
  expected integer,
  checked_in integer,
  remaining integer,
  present integer,
  late integer,
  checked_out integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_enabled() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_event_ids is null
    or cardinality(p_event_ids) = 0
    or cardinality(p_event_ids) > 500
    or array_position(p_event_ids, null) is not null then
    raise exception 'Select between 1 and 500 valid events' using errcode = '22023';
  end if;

  return query
  with accessible_events as (
    select e.id
    from public.events e
    where e.id = any(p_event_ids)
      and e.deleted_at is null
      and public.can_access_event(e.id)
  ), audiences as (
    select
      accessible.id as event_id,
      array(
        select ed.department_id
        from public.event_departments ed
        where ed.event_id = accessible.id
        order by ed.department_id
      ) as department_ids,
      array(
        select eyl.year_level
        from public.event_year_levels eyl
        where eyl.event_id = accessible.id
        order by eyl.year_level
      ) as year_levels
    from accessible_events accessible
  ), expected_totals as (
    select audience.event_id, count(student.id)::integer as expected
    from audiences audience
    left join public.students student
      on student.department_id = any(audience.department_ids)
      and student.is_active
      and student.deleted_at is null
      and (
        cardinality(audience.year_levels) = 0
        or student.year_level = any(audience.year_levels)
      )
    group by audience.event_id
  ), attendance_totals as (
    select
      attendance.event_id,
      count(*)::integer as checked_in,
      (count(*) filter (where attendance.check_in_status = 'present'))::integer as present,
      (count(*) filter (where attendance.check_in_status = 'late'))::integer as late,
      (count(*) filter (where attendance.check_out_at is not null))::integer as checked_out
    from public.attendance attendance
    join accessible_events accessible on accessible.id = attendance.event_id
    group by attendance.event_id
  )
  select
    audience.event_id,
    audience.department_ids,
    audience.year_levels,
    coalesce(expected_total.expected, 0),
    coalesce(attendance_total.checked_in, 0),
    greatest(coalesce(expected_total.expected, 0) - coalesce(attendance_total.checked_in, 0), 0),
    coalesce(attendance_total.present, 0),
    coalesce(attendance_total.late, 0),
    coalesce(attendance_total.checked_out, 0)
  from audiences audience
  left join expected_totals expected_total on expected_total.event_id = audience.event_id
  left join attendance_totals attendance_total on attendance_total.event_id = audience.event_id;
end;
$$;

revoke all on function public.get_event_overviews(uuid[]) from public, anon, authenticated;
grant execute on function public.get_event_overviews(uuid[]) to authenticated;

-- Match database access to the routed UI: Faculty and system administrators
-- may browse students and rosters; Officers use the narrowly scoped scanner
-- RPCs for their assigned events.
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated
using (
  (select public.current_user_enabled())
  and (
    (select public.is_system_admin())
    or (
      (select public.current_user_role()) = 'faculty'
      and deleted_at is null
      and is_active
    )
  )
);

drop policy if exists students_admin_insert on public.students;
create policy students_admin_insert on public.students for insert to authenticated
with check ((select public.is_system_admin()));

drop policy if exists students_admin_update on public.students;
create policy students_admin_update on public.students for update to authenticated
using ((select public.is_system_admin()))
with check ((select public.is_system_admin()));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (
  deleted_at is null
  and (select public.current_user_enabled())
  and (id = (select auth.uid()) or (select public.is_system_admin()))
);

drop policy if exists event_guest_attendance_read on public.event_guest_attendance;
create policy event_guest_attendance_read
on public.event_guest_attendance
for select
to authenticated
using (
  (select public.current_user_role()) in ('super_admin', 'admin', 'faculty')
  and (select public.can_access_event(event_id))
);

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
  if not public.current_user_enabled()
    or public.current_user_role() not in ('super_admin', 'admin', 'faculty')
    or not public.can_access_event(p_event_id) then
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
    select attendance.student_id, false as expected
    from public.attendance attendance
    where attendance.event_id = p_event_id
  ), roster_students as (
    select included.student_id, bool_or(included.expected) as expected
    from included_students included
    group by included.student_id
  )
  select
    attendance.id,
    student.id,
    student.student_number,
    student.full_name,
    student.sex,
    student.year_level,
    department.id,
    department.name,
    department.code,
    roster_students.expected,
    coalesce(attendance.check_in_status, 'absent'),
    attendance.check_in_at,
    attendance.check_in_method,
    attendance.check_out_at,
    attendance.check_out_method,
    attendance.remarks
  from roster_students
  join public.students student on student.id = roster_students.student_id
  join public.departments department on department.id = student.department_id
  left join public.attendance attendance
    on attendance.event_id = p_event_id and attendance.student_id = student.id
  order by department.code, student.year_level, student.full_name, student.id;
end;
$$;

-- RLS helpers without row arguments are wrapped in scalar subqueries so
-- Postgres evaluates them once per statement instead of once per row.
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated
using ((select public.current_user_enabled()) and (deleted_at is null or (select public.is_super_admin())));

drop policy if exists departments_admin_insert on public.departments;
create policy departments_admin_insert on public.departments for insert to authenticated
with check ((select public.is_super_admin()));

drop policy if exists departments_admin_update on public.departments;
create policy departments_admin_update on public.departments for update to authenticated
using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists event_assignments_read on public.event_assignments;
create policy event_assignments_read on public.event_assignments for select to authenticated
using (
  (select public.current_user_enabled())
  and (user_id = (select auth.uid()) or (select public.can_manage_event(event_id)))
);

drop policy if exists event_assignments_insert on public.event_assignments;
create policy event_assignments_insert on public.event_assignments for insert to authenticated
with check ((select public.can_manage_event(event_id)) and assigned_by = (select auth.uid()));

drop policy if exists event_assignments_delete on public.event_assignments;
create policy event_assignments_delete on public.event_assignments for delete to authenticated
using ((select public.can_manage_event(event_id)));

drop policy if exists event_access_grants_read on public.event_access_grants;
create policy event_access_grants_read on public.event_access_grants for select to authenticated
using (
  (select public.current_user_enabled())
  and (user_id = (select auth.uid()) or (select public.is_system_admin()))
);

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
using ((select public.is_super_admin()));

-- Index the actual list, audience, and retained-log access patterns. Remove the
-- redundant non-unique token hash index; the unique constraint already owns an
-- equivalent btree index.
drop index if exists public.student_qr_token_hash_idx;

create index if not exists students_active_audience_idx
  on public.students (department_id, year_level, id)
  where is_active and deleted_at is null;

create index if not exists students_current_name_idx
  on public.students (full_name, id)
  where deleted_at is null;

create index if not exists events_active_start_idx
  on public.events (start_at desc, id)
  where deleted_at is null;

drop index if exists public.audit_logs_created_at_idx;
create index audit_logs_created_at_idx
  on public.audit_logs (created_at desc, id desc);

create index if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, created_at desc, id desc);

-- Serialize undo operations for the same event. Without this lock, two
-- simultaneous requests could both select and reverse the same audit entry.
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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id::text, 0));

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

-- Preserve the deleting actor on assignment-removal audit rows created by the
-- service-role-backed user archival flow.
create or replace function public.archive_user_secure(
  p_actor_id uuid,
  p_user_id uuid,
  p_deleted_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target public.profiles%rowtype;
begin
  select role into v_actor_role
  from public.profiles
  where id = p_actor_id and is_enabled and deleted_at is null;

  if v_actor_role not in ('super_admin', 'admin') then
    raise exception 'You are not authorized to delete users' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_target.deleted_at is not null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_user_id = p_actor_id then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;
  if v_target.role = 'super_admin' then
    raise exception 'The Super Admin account cannot be deleted' using errcode = '42501';
  end if;
  if v_actor_role = 'admin' and v_target.role not in ('faculty', 'officer') then
    raise exception 'Admins can only delete Faculty or Officer accounts' using errcode = '42501';
  end if;
  if p_deleted_username !~ '^deleted_[a-z0-9_]{8,32}$' then
    raise exception 'Invalid deleted-user identifier' using errcode = '22023';
  end if;

  perform set_config('app.audit_actor_id', p_actor_id::text, true);
  delete from public.event_access_grants where user_id = p_user_id;
  delete from public.event_assignments where user_id = p_user_id;

  update public.profiles
  set username = p_deleted_username,
      is_enabled = false,
      session_revoked_at = now(),
      deleted_at = now()
  where id = p_user_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_id,
    'user_deleted',
    'user',
    p_user_id,
    jsonb_build_object('username', v_target.username, 'role', v_target.role)
  );
end;
$$;

revoke all on function public.archive_user_secure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_user_secure(uuid, uuid, text) to service_role;

commit;
