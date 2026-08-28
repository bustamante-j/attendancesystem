begin;

create or replace function public.get_event_attendance_report(p_event_id uuid)
returns table (
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
  check_out_method text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_user_role();
begin
  if not public.current_user_enabled()
    or v_role not in ('super_admin', 'faculty')
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
    select a.student_id, false as expected
    from public.attendance a
    where a.event_id = p_event_id
  ), report_students as (
    select included.student_id, bool_or(included.expected) as expected
    from included_students included
    group by included.student_id
  )
  select
    s.id,
    s.student_number,
    s.full_name,
    s.sex,
    s.year_level,
    d.id,
    d.name,
    d.code,
    report_students.expected,
    coalesce(a.check_in_status, 'absent'),
    a.check_in_at,
    a.check_in_method,
    a.check_out_at,
    a.check_out_method
  from report_students
  join public.students s on s.id = report_students.student_id
  join public.departments d on d.id = s.department_id
  left join public.attendance a
    on a.event_id = p_event_id and a.student_id = s.id
  order by d.code, s.year_level, s.full_name;
end;
$$;

create or replace function public.get_student_attendance_history(p_student_id uuid)
returns table (
  event_id uuid,
  event_name text,
  event_start_at timestamptz,
  event_status text,
  attendance_status text,
  check_in_at timestamptz,
  check_in_method text,
  check_out_at timestamptz,
  check_out_method text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_user_role();
  v_student public.students%rowtype;
begin
  if not public.current_user_enabled() or v_role not in ('super_admin', 'faculty') then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  return query
  select
    e.id,
    e.name,
    e.start_at,
    e.status,
    coalesce(a.check_in_status, 'absent'),
    a.check_in_at,
    a.check_in_method,
    a.check_out_at,
    a.check_out_method
  from public.events e
  left join public.attendance a
    on a.event_id = e.id and a.student_id = p_student_id
  where e.deleted_at is null
    and e.status <> 'draft'
    and public.can_access_event(e.id)
    and (
      a.id is not null
      or (
        (e.status = 'closed' or e.check_in_closes_at < now())
        and exists (
          select 1 from public.event_departments ed
          where ed.event_id = e.id and ed.department_id = v_student.department_id
        )
        and (
          not exists (select 1 from public.event_year_levels eyl where eyl.event_id = e.id)
          or exists (
            select 1 from public.event_year_levels eyl
            where eyl.event_id = e.id and eyl.year_level = v_student.year_level
          )
        )
      )
    )
  order by e.start_at desc;
end;
$$;

create or replace function public.admin_remove_attendance(
  p_event_id uuid,
  p_student_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendance public.attendance%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_attendance
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id
  for update;

  if not found then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  delete from public.attendance where id = v_attendance.id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'attendance_admin_removed',
    'attendance',
    v_attendance.id,
    jsonb_build_object(
      'event_id', p_event_id,
      'student_id', p_student_id,
      'previous_check_in_at', v_attendance.check_in_at,
      'previous_check_in_status', v_attendance.check_in_status,
      'previous_check_out_at', v_attendance.check_out_at
    )
  );

  return v_attendance.id;
end;
$$;

revoke all on function public.get_event_attendance_report(uuid) from public, anon, authenticated;
revoke all on function public.get_student_attendance_history(uuid) from public, anon, authenticated;
revoke all on function public.admin_remove_attendance(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_event_attendance_report(uuid) to authenticated;
grant execute on function public.get_student_attendance_history(uuid) to authenticated;
grant execute on function public.admin_remove_attendance(uuid, uuid) to authenticated;

commit;
