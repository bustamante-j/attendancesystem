begin;

create or replace function public.get_event_expected_students(p_event_id uuid)
returns table (
  student_id uuid,
  student_number text,
  full_name text,
  year_level smallint,
  sex text,
  department_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select s.id, s.student_number, s.full_name, s.year_level, s.sex, s.department_id
  from public.students s
  where s.is_active
    and s.deleted_at is null
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
  order by s.full_name;
end;
$$;

create or replace function public.get_event_expected_count(p_event_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.get_event_expected_students(p_event_id);
$$;

create or replace function public.verify_event_pin(p_event_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.current_user_enabled() then
    return jsonb_build_object('code', 'unauthorized', 'message', 'Authentication is required.');
  end if;

  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found or v_event.status <> 'open' then
    return jsonb_build_object('code', 'event_not_open', 'message', 'The event is not open.');
  end if;

  if not public.is_super_admin() and not public.is_event_assigned(p_event_id) then
    return jsonb_build_object('code', 'unauthorized', 'message', 'You are not assigned to this event.');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$'
    or extensions.crypt(p_pin, v_event.pin_hash) <> v_event.pin_hash then
    return jsonb_build_object('code', 'invalid_pin', 'message', 'The event PIN is incorrect.');
  end if;

  insert into public.event_access_grants(event_id, user_id, granted_at, expires_at)
  values (p_event_id, v_user_id, now(), now() + interval '12 hours')
  on conflict (event_id, user_id) do update
    set granted_at = excluded.granted_at, expires_at = excluded.expires_at;

  return jsonb_build_object(
    'code', 'success',
    'message', 'Event access granted.',
    'expiresAt', now() + interval '12 hours'
  );
end;
$$;

create or replace function public._process_attendance(
  p_event_id uuid,
  p_raw_credential text,
  p_student_id uuid,
  p_direction text,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_now timestamptz := now();
  v_event public.events%rowtype;
  v_student public.students%rowtype;
  v_attendance public.attendance%rowtype;
  v_status text;
begin
  select role into v_role
  from public.profiles
  where id = v_actor and is_enabled;

  if v_actor is null or v_role is null or v_role not in ('super_admin', 'faculty', 'officer') then
    return jsonb_build_object('code', 'unauthorized', 'message', 'You are not authorized to record attendance.');
  end if;

  if p_direction is null or p_direction not in ('check_in', 'check_out')
    or p_method is null or p_method not in ('qr', 'manual') then
    return jsonb_build_object('code', 'invalid_request', 'message', 'Invalid attendance direction or method.');
  end if;

  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found or v_event.status <> 'open' then
    return jsonb_build_object('code', 'event_not_open', 'message', 'The event is not open.');
  end if;

  if v_role <> 'super_admin' and not exists (
    select 1 from public.event_assignments ea
    where ea.event_id = p_event_id and ea.user_id = v_actor
  ) then
    return jsonb_build_object('code', 'unauthorized', 'message', 'You are not assigned to this event.');
  end if;

  if v_role <> 'super_admin' and not exists (
    select 1 from public.event_access_grants eag
    where eag.event_id = p_event_id and eag.user_id = v_actor and eag.expires_at > v_now
  ) then
    return jsonb_build_object('code', 'unauthorized', 'message', 'Enter the current event PIN before recording attendance.');
  end if;

  if p_direction = 'check_in' then
    if v_now < v_event.check_in_opens_at then
      return jsonb_build_object('code', 'checkin_not_open', 'message', 'Check-in is not open yet.');
    end if;
    if v_now > v_event.check_in_closes_at then
      return jsonb_build_object('code', 'checkin_closed', 'message', 'Check-in has closed.');
    end if;
  else
    if v_event.attendance_mode <> 'check_in_out' or v_now < v_event.check_out_opens_at then
      return jsonb_build_object('code', 'checkout_not_open', 'message', 'Check-out is not open yet.');
    end if;
    if v_now > v_event.check_out_closes_at then
      return jsonb_build_object('code', 'checkout_closed', 'message', 'Check-out has closed.');
    end if;
  end if;

  if p_method = 'qr' then
    if p_raw_credential is null or length(p_raw_credential) < 20 then
      return jsonb_build_object('code', 'invalid_qr', 'message', 'The QR credential is invalid.');
    end if;
    select s.* into v_student
    from public.student_qr_credentials q
    join public.students s on s.id = q.student_id
    where q.token_hash = encode(extensions.digest(p_raw_credential, 'sha256'), 'hex')
      and q.is_active and q.revoked_at is null;
    if not found then
      return jsonb_build_object('code', 'invalid_qr', 'message', 'The QR credential is invalid or revoked.');
    end if;
  else
    select * into v_student from public.students where id = p_student_id;
    if not found then
      return jsonb_build_object('code', 'student_not_found', 'message', 'The student was not found.');
    end if;
  end if;

  if not v_student.is_active or v_student.deleted_at is not null then
    return jsonb_build_object('code', 'student_inactive', 'message', 'The student is inactive.');
  end if;

  if not exists (
    select 1 from public.event_departments ed
    where ed.event_id = p_event_id and ed.department_id = v_student.department_id
  ) or (
    exists (select 1 from public.event_year_levels yl where yl.event_id = p_event_id)
    and not exists (
      select 1 from public.event_year_levels yl
      where yl.event_id = p_event_id and yl.year_level = v_student.year_level
    )
  ) then
    return jsonb_build_object(
      'code', 'student_not_eligible',
      'message', 'The student is not part of this event audience.',
      'student', jsonb_build_object(
        'id', v_student.id,
        'studentNumber', v_student.student_number,
        'fullName', v_student.full_name
      )
    );
  end if;

  if p_direction = 'check_in' then
    v_status := case when v_now > v_event.late_after then 'late' else 'present' end;
    insert into public.attendance (
      event_id, student_id, check_in_at, check_in_status, check_in_method, check_in_by
    ) values (
      p_event_id, v_student.id, v_now, v_status, p_method, v_actor
    )
    on conflict (event_id, student_id) do nothing
    returning * into v_attendance;

    if v_attendance.id is null then
      select * into v_attendance from public.attendance
      where event_id = p_event_id and student_id = v_student.id;
      return jsonb_build_object(
        'code', 'already_checked_in',
        'message', 'The student is already checked in.',
        'student', jsonb_build_object(
          'id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name
        ),
        'attendance', jsonb_build_object(
          'id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
          'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at
        )
      );
    end if;

    return jsonb_build_object(
      'code', case when v_status = 'late' then 'success_late' else 'success_present' end,
      'message', case when v_status = 'late' then 'Student checked in as late.' else 'Student checked in.' end,
      'student', jsonb_build_object(
        'id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name
      ),
      'attendance', jsonb_build_object(
        'id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
        'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at
      )
    );
  end if;

  select * into v_attendance from public.attendance
  where event_id = p_event_id and student_id = v_student.id;
  if not found then
    return jsonb_build_object(
      'code', 'not_checked_in', 'message', 'The student has not checked in.',
      'student', jsonb_build_object(
        'id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name
      )
    );
  end if;
  if v_attendance.check_out_at is not null then
    return jsonb_build_object(
      'code', 'already_checked_out', 'message', 'The student is already checked out.',
      'student', jsonb_build_object(
        'id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name
      ),
      'attendance', jsonb_build_object(
        'id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
        'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at
      )
    );
  end if;

  update public.attendance
  set check_out_at = v_now, check_out_method = p_method, check_out_by = v_actor
  where id = v_attendance.id and check_out_at is null
  returning * into v_attendance;

  if v_attendance.check_out_at is null then
    return jsonb_build_object('code', 'already_checked_out', 'message', 'The student is already checked out.');
  end if;

  return jsonb_build_object(
    'code', 'success_checkout', 'message', 'Student checked out.',
    'student', jsonb_build_object(
      'id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name
    ),
    'attendance', jsonb_build_object(
      'id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
      'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at
    )
  );
end;
$$;

create or replace function public.process_attendance_scan(
  p_event_id uuid,
  p_raw_credential text,
  p_direction text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public._process_attendance(p_event_id, p_raw_credential, null, p_direction, 'qr');
$$;

create or replace function public.process_manual_attendance(
  p_event_id uuid,
  p_student_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public._process_attendance(p_event_id, null, p_student_id, p_direction, 'manual');
  if v_result->>'code' in ('success_present', 'success_late', 'success_checkout') then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      'attendance_manual_created',
      'attendance',
      nullif(v_result->'attendance'->>'id', '')::uuid,
      jsonb_build_object('event_id', p_event_id, 'student_id', p_student_id, 'direction', p_direction)
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.admin_correct_attendance(
  p_event_id uuid,
  p_student_id uuid,
  p_check_in_at timestamptz,
  p_check_in_status text,
  p_check_out_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_check_in_status not in ('present', 'late') then
    raise exception 'Invalid check-in status' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id)
    or not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Event or student not found' using errcode = 'P0002';
  end if;

  insert into public.attendance (
    event_id, student_id, check_in_at, check_in_status, check_in_method, check_in_by,
    check_out_at, check_out_method, check_out_by
  ) values (
    p_event_id, p_student_id, p_check_in_at, p_check_in_status, 'manual', auth.uid(),
    p_check_out_at, case when p_check_out_at is null then null else 'manual' end,
    case when p_check_out_at is null then null else auth.uid() end
  )
  on conflict (event_id, student_id) do update set
    check_in_at = excluded.check_in_at,
    check_in_status = excluded.check_in_status,
    check_in_method = 'manual',
    check_in_by = auth.uid(),
    check_out_at = excluded.check_out_at,
    check_out_method = excluded.check_out_method,
    check_out_by = excluded.check_out_by
  returning id into v_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'attendance_admin_updated', 'attendance', v_id,
    jsonb_build_object('event_id', p_event_id, 'student_id', p_student_id)
  );
  return v_id;
end;
$$;

create or replace function public.set_user_enabled(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_enabled then
    raise exception 'You cannot disable your own account' using errcode = '22023';
  end if;
  update public.profiles
  set is_enabled = p_enabled,
      session_revoked_at = case when p_enabled then session_revoked_at else now() end
  where id = p_user_id;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id)
  values (auth.uid(), case when p_enabled then 'user_enabled' else 'user_disabled' end, 'user', p_user_id);
end;
$$;

create or replace function public.force_user_logout(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  update public.profiles set session_revoked_at = now() where id = p_user_id;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id)
  values (auth.uid(), 'force_logout', 'user', p_user_id);
end;
$$;

create or replace function public.update_event_details(
  p_event_id uuid,
  p_name text,
  p_description text,
  p_venue text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_check_in_opens_at timestamptz,
  p_late_after timestamptz,
  p_check_in_closes_at timestamptz,
  p_attendance_mode text,
  p_check_out_opens_at timestamptz,
  p_check_out_closes_at timestamptz,
  p_status text,
  p_department_ids uuid[],
  p_year_levels smallint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if coalesce(array_length(p_department_ids, 1), 0) = 0 then
    raise exception 'At least one department is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_department_ids) d
    where d is null or not exists (
      select 1 from public.departments where id = d and deleted_at is null
    )
  ) then
    raise exception 'Invalid department' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_year_levels, '{}'::smallint[])) y where y not between 1 and 4) then
    raise exception 'Invalid year level' using errcode = '22023';
  end if;

  update public.events set
    name = btrim(p_name), description = nullif(btrim(p_description), ''), venue = nullif(btrim(p_venue), ''),
    start_at = p_start_at, end_at = p_end_at,
    check_in_opens_at = p_check_in_opens_at, late_after = p_late_after,
    check_in_closes_at = p_check_in_closes_at, attendance_mode = p_attendance_mode,
    check_out_opens_at = p_check_out_opens_at, check_out_closes_at = p_check_out_closes_at,
    status = p_status
  where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;

  delete from public.event_departments where event_id = p_event_id;
  insert into public.event_departments(event_id, department_id)
    select p_event_id, d from (select distinct unnest(p_department_ids) d) values_to_insert;

  delete from public.event_year_levels where event_id = p_event_id;
  insert into public.event_year_levels(event_id, year_level)
    select p_event_id, y from (select distinct unnest(coalesce(p_year_levels, '{}'::smallint[])) y) values_to_insert;
end;
$$;

create or replace function public.soft_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  update public.events set deleted_at = now(), status = 'closed'
  where id = p_event_id and deleted_at is null;
end;
$$;

-- Called only by the issue-student-qr Edge Function with a service-role client.
create or replace function public.issue_student_qr_secure(
  p_actor_id uuid,
  p_student_id uuid,
  p_token_hash text,
  p_token_prefix text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old record;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'super_admin' and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.students where id = p_student_id and deleted_at is null
  ) then raise exception 'Student not found' using errcode = 'P0002'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid token hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  for v_old in
    update public.student_qr_credentials
    set is_active = false, revoked_at = now()
    where student_id = p_student_id and is_active and revoked_at is null
    returning id
  loop
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor_id, 'qr_revoked', 'student_qr_credential', v_old.id, jsonb_build_object('student_id', p_student_id));
  end loop;

  insert into public.student_qr_credentials(student_id, token_hash, token_prefix)
  values (p_student_id, p_token_hash, nullif(p_token_prefix, ''))
  returning id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'qr_issued', 'student_qr_credential', v_id, jsonb_build_object('student_id', p_student_id));
  return v_id;
end;
$$;

-- Called only by the create-event Edge Function. The raw PIN is hashed inside PostgreSQL.
create or replace function public.create_event_secure(
  p_actor_id uuid,
  p_name text,
  p_description text,
  p_venue text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_check_in_opens_at timestamptz,
  p_late_after timestamptz,
  p_check_in_closes_at timestamptz,
  p_attendance_mode text,
  p_check_out_opens_at timestamptz,
  p_check_out_closes_at timestamptz,
  p_department_ids uuid[],
  p_year_levels smallint[],
  p_plaintext_pin text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role in ('super_admin', 'faculty') and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_plaintext_pin !~ '^[0-9]{6}$' then raise exception 'Invalid PIN' using errcode = '22023'; end if;
  if coalesce(array_length(p_department_ids, 1), 0) = 0 then
    raise exception 'At least one department is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_department_ids) d
    where d is null or not exists (
      select 1 from public.departments where id = d and deleted_at is null
    )
  ) then raise exception 'Invalid department' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_year_levels, '{}'::smallint[])) y where y not between 1 and 4) then
    raise exception 'Invalid year level' using errcode = '22023';
  end if;

  perform set_config('app.audit_actor_id', p_actor_id::text, true);
  insert into public.events (
    name, description, venue, start_at, end_at, check_in_opens_at, late_after,
    check_in_closes_at, attendance_mode, check_out_opens_at, check_out_closes_at,
    pin_hash, status, created_by
  ) values (
    btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_venue), ''),
    p_start_at, p_end_at, p_check_in_opens_at, p_late_after, p_check_in_closes_at,
    p_attendance_mode, p_check_out_opens_at, p_check_out_closes_at,
    extensions.crypt(p_plaintext_pin, extensions.gen_salt('bf', 10)), 'draft', p_actor_id
  ) returning id into v_event_id;

  insert into public.event_departments(event_id, department_id)
    select v_event_id, d from (select distinct unnest(p_department_ids) d) values_to_insert;
  insert into public.event_year_levels(event_id, year_level)
    select v_event_id, y from (select distinct unnest(coalesce(p_year_levels, '{}'::smallint[])) y) values_to_insert;
  insert into public.event_assignments(event_id, user_id, assigned_by)
  values (v_event_id, p_actor_id, p_actor_id);

  return v_event_id;
end;
$$;

create or replace function public.reset_event_pin_secure(
  p_actor_id uuid,
  p_event_id uuid,
  p_plaintext_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles
  where id = p_actor_id and is_enabled;
  if v_role is null or not (
    v_role = 'super_admin'
    or (v_role = 'faculty' and exists (
      select 1 from public.events where id = p_event_id and created_by = p_actor_id and deleted_at is null
    ))
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_plaintext_pin !~ '^[0-9]{6}$' then raise exception 'Invalid PIN' using errcode = '22023'; end if;

  perform set_config('app.audit_actor_id', p_actor_id::text, true);
  update public.events
  set pin_hash = extensions.crypt(p_plaintext_pin, extensions.gen_salt('bf', 10))
  where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  delete from public.event_access_grants where event_id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id)
  values (p_actor_id, 'event_pin_reset', 'event', p_event_id);
end;
$$;

revoke all on function public.get_event_expected_students(uuid) from public, anon, authenticated;
revoke all on function public.get_event_expected_count(uuid) from public, anon, authenticated;
revoke all on function public.verify_event_pin(uuid, text) from public, anon, authenticated;
revoke all on function public._process_attendance(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_attendance_scan(uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_manual_attendance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_correct_attendance(uuid, uuid, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_user_enabled(uuid, boolean) from public, anon, authenticated;
revoke all on function public.force_user_logout(uuid) from public, anon, authenticated;
revoke all on function public.update_event_details(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, text, uuid[], smallint[]) from public, anon, authenticated;
revoke all on function public.soft_delete_event(uuid) from public, anon, authenticated;
revoke all on function public.issue_student_qr_secure(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_event_secure(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, uuid[], smallint[], text) from public, anon, authenticated;
revoke all on function public.reset_event_pin_secure(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_event_expected_students(uuid) to authenticated;
grant execute on function public.get_event_expected_count(uuid) to authenticated;
grant execute on function public.verify_event_pin(uuid, text) to authenticated;
grant execute on function public.process_attendance_scan(uuid, text, text) to authenticated;
grant execute on function public.process_manual_attendance(uuid, uuid, text) to authenticated;
grant execute on function public.admin_correct_attendance(uuid, uuid, timestamptz, text, timestamptz) to authenticated;
grant execute on function public.set_user_enabled(uuid, boolean) to authenticated;
grant execute on function public.force_user_logout(uuid) to authenticated;
grant execute on function public.update_event_details(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, text, uuid[], smallint[]) to authenticated;
grant execute on function public.soft_delete_event(uuid) to authenticated;

grant execute on function public.issue_student_qr_secure(uuid, uuid, text, text) to service_role;
grant execute on function public.create_event_secure(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, uuid[], smallint[], text) to service_role;
grant execute on function public.reset_event_pin_secure(uuid, uuid, text) to service_role;

commit;
