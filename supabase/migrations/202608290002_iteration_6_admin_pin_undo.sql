begin;

-- Admin is an operational manager. Super Admin retains identity management,
-- audit access, and secret/credential viewing.
alter table public.profiles drop constraint profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role in ('super_admin', 'admin', 'faculty', 'officer'));

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'admin'), false);
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_enabled() and (
    public.is_system_admin()
    or exists (
      select 1 from public.events e
      where e.id = p_event_id
        and e.created_by = auth.uid()
        and public.current_user_role() = 'faculty'
    )
  );
$$;

create or replace function public.can_access_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_enabled() and (
    public.is_system_admin()
    or public.is_event_assigned(p_event_id)
    or exists (
      select 1 from public.events e
      where e.id = p_event_id
        and e.created_by = auth.uid()
        and public.current_user_role() = 'faculty'
    )
  );
$$;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (public.current_user_enabled() and (id = auth.uid() or public.is_system_admin()));

drop policy departments_read on public.departments;
drop policy departments_admin_insert on public.departments;
drop policy departments_admin_update on public.departments;
create policy departments_read on public.departments for select to authenticated
using (public.current_user_enabled() and (deleted_at is null or public.is_system_admin()));
create policy departments_admin_insert on public.departments for insert to authenticated
with check (public.is_system_admin());
create policy departments_admin_update on public.departments for update to authenticated
using (public.is_system_admin()) with check (public.is_system_admin());

drop policy students_read on public.students;
drop policy students_admin_insert on public.students;
drop policy students_admin_update on public.students;
create policy students_read on public.students for select to authenticated
using (public.current_user_enabled() and (public.is_system_admin() or (deleted_at is null and is_active)));
create policy students_admin_insert on public.students for insert to authenticated
with check (public.is_system_admin());
create policy students_admin_update on public.students for update to authenticated
using (public.is_system_admin()) with check (public.is_system_admin());

drop policy event_access_grants_read on public.event_access_grants;
create policy event_access_grants_read on public.event_access_grants for select to authenticated
using (public.current_user_enabled() and (user_id = auth.uid() or public.is_system_admin()));

grant execute on function public.is_system_admin() to authenticated;

-- Encrypted event PIN retrieval. Plaintext remains available only inside the
-- authenticated Edge Function and is never written to PostgreSQL.
alter table public.events
  add column encrypted_pin text,
  add column pin_encryption_iv text,
  add constraint event_pin_encryption_pair check (
    (encrypted_pin is null and pin_encryption_iv is null)
    or (encrypted_pin is not null and pin_encryption_iv is not null)
  ),
  add constraint event_pin_encrypted_format check (
    encrypted_pin is null or encrypted_pin ~ '^[A-Za-z0-9_-]{24,128}$'
  ),
  add constraint event_pin_iv_format check (
    pin_encryption_iv is null or pin_encryption_iv ~ '^[A-Za-z0-9_-]{16}$'
  );

comment on column public.events.encrypted_pin is
  'AES-GCM ciphertext for Super Admin retrieval through the authorized Edge Function only.';
comment on column public.events.pin_encryption_iv is
  'Unique 96-bit AES-GCM initialization vector encoded as base64url.';

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
  p_plaintext_pin text,
  p_encrypted_pin text,
  p_pin_encryption_iv text
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
    where id = p_actor_id and role in ('super_admin', 'admin', 'faculty') and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_plaintext_pin !~ '^[0-9]{6}$' then raise exception 'Invalid PIN' using errcode = '22023'; end if;
  if p_encrypted_pin !~ '^[A-Za-z0-9_-]{24,128}$' or p_pin_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
    raise exception 'Invalid encrypted PIN' using errcode = '22023';
  end if;
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
    pin_hash, encrypted_pin, pin_encryption_iv, status, created_by
  ) values (
    btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_venue), ''),
    p_start_at, p_end_at, p_check_in_opens_at, p_late_after, p_check_in_closes_at,
    p_attendance_mode, p_check_out_opens_at, p_check_out_closes_at,
    extensions.crypt(p_plaintext_pin, extensions.gen_salt('bf', 10)),
    p_encrypted_pin, p_pin_encryption_iv, 'draft', p_actor_id
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
  p_plaintext_pin text,
  p_encrypted_pin text,
  p_pin_encryption_iv text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = p_actor_id and is_enabled;
  if v_role is null or not (
    v_role in ('super_admin', 'admin')
    or (v_role = 'faculty' and exists (
      select 1 from public.events where id = p_event_id and created_by = p_actor_id and deleted_at is null
    ))
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_plaintext_pin !~ '^[0-9]{6}$' then raise exception 'Invalid PIN' using errcode = '22023'; end if;
  if p_encrypted_pin !~ '^[A-Za-z0-9_-]{24,128}$' or p_pin_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
    raise exception 'Invalid encrypted PIN' using errcode = '22023';
  end if;

  perform set_config('app.audit_actor_id', p_actor_id::text, true);
  update public.events set
    pin_hash = extensions.crypt(p_plaintext_pin, extensions.gen_salt('bf', 10)),
    encrypted_pin = p_encrypted_pin,
    pin_encryption_iv = p_pin_encryption_iv
  where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  delete from public.event_access_grants where event_id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id)
  values (p_actor_id, 'event_pin_reset', 'event', p_event_id);
end;
$$;

revoke all on function public.create_event_secure(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, uuid[], smallint[], text, text, text) from public, anon, authenticated;
revoke all on function public.reset_event_pin_secure(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_event_secure(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, uuid[], smallint[], text, text, text) to service_role;
grant execute on function public.reset_event_pin_secure(uuid, uuid, text, text, text) to service_role;

-- Operational Admin student management.
create or replace function public.get_student_qr_statuses(p_student_ids uuid[] default null)
returns table (student_id uuid, has_active_credential boolean, issued_at timestamptz, token_prefix text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query
  select s.id, q.id is not null, q.issued_at, q.token_prefix
  from public.students s
  left join public.student_qr_credentials q
    on q.student_id = s.id and q.is_active and q.revoked_at is null
  where s.deleted_at is null and (p_student_ids is null or s.id = any(p_student_ids));
end;
$$;

create or replace function public.restore_student(p_student_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.students set deleted_at = null where id = p_student_id and deleted_at is not null;
  if not found then raise exception 'Deleted student not found' using errcode = 'P0002'; end if;
exception when unique_violation then
  raise exception 'Another active record already uses this Student ID' using errcode = '23505';
end;
$$;

create or replace function public.soft_delete_department(p_department_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if exists (select 1 from public.students where department_id = p_department_id and deleted_at is null) then
    raise exception 'Move or delete current students before deleting this department' using errcode = '23503';
  end if;
  update public.departments set deleted_at = now() where id = p_department_id and deleted_at is null;
  if not found then raise exception 'Department not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.restore_department(p_department_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.departments set deleted_at = null where id = p_department_id and deleted_at is not null;
  if not found then raise exception 'Deleted department not found' using errcode = 'P0002'; end if;
exception when unique_violation then
  raise exception 'An active department already uses this name or code' using errcode = '23505';
end;
$$;

-- Service-role-only QR issuance still validates the supplied actor role.
create or replace function public.issue_student_qr_with_escrow_secure(
  p_actor_id uuid, p_student_id uuid, p_token_hash text, p_token_prefix text,
  p_encrypted_token text, p_encryption_iv text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_old record;
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role in ('super_admin', 'admin') and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.students where id = p_student_id and deleted_at is null) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash' using errcode = '22023'; end if;
  if p_encrypted_token !~ '^[A-Za-z0-9_-]{40,256}$' or p_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
    raise exception 'Invalid encrypted credential' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  for v_old in
    update public.student_qr_credentials set is_active = false, revoked_at = now()
    where student_id = p_student_id and is_active and revoked_at is null returning id
  loop
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor_id, 'qr_revoked', 'student_qr_credential', v_old.id, jsonb_build_object('student_id', p_student_id));
  end loop;
  insert into public.student_qr_credentials(student_id, token_hash, token_prefix, encrypted_token, encryption_iv)
  values (p_student_id, p_token_hash, nullif(p_token_prefix, ''), p_encrypted_token, p_encryption_iv)
  returning id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'qr_issued', 'student_qr_credential', v_id, jsonb_build_object('student_id', p_student_id, 'retrievable', true));
  return v_id;
end;
$$;

create or replace function public.batch_issue_student_qr_with_escrow_secure(p_actor_id uuid, p_credentials jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb; v_student_id uuid; v_hash text; v_prefix text; v_encrypted_token text;
  v_encryption_iv text; v_credential_id uuid; v_results jsonb := '[]'::jsonb;
  v_old record; v_seen uuid[] := '{}'::uuid[];
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role in ('super_admin', 'admin') and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_credentials is null or jsonb_typeof(p_credentials) <> 'array'
    or jsonb_array_length(p_credentials) = 0 or jsonb_array_length(p_credentials) > 500 then
    raise exception 'Batch must contain 1 to 500 credentials' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_credentials) order by value->>'student_id'
  loop
    begin v_student_id := (v_item->>'student_id')::uuid;
    exception when others then raise exception 'Invalid student identifier' using errcode = '22023'; end;
    v_hash := v_item->>'token_hash'; v_prefix := v_item->>'token_prefix';
    v_encrypted_token := v_item->>'encrypted_token'; v_encryption_iv := v_item->>'encryption_iv';
    if v_student_id = any(v_seen) then raise exception 'Duplicate student in batch' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_student_id);
    if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash' using errcode = '22023'; end if;
    if v_encrypted_token !~ '^[A-Za-z0-9_-]{40,256}$' or v_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
      raise exception 'Invalid encrypted credential' using errcode = '22023';
    end if;
    if not exists (select 1 from public.students where id = v_student_id and deleted_at is null) then
      raise exception 'Student not found' using errcode = 'P0002';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_student_id::text, 0));
    for v_old in
      update public.student_qr_credentials set is_active = false, revoked_at = now()
      where student_id = v_student_id and is_active and revoked_at is null returning id
    loop
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      values (p_actor_id, 'qr_revoked', 'student_qr_credential', v_old.id, jsonb_build_object('student_id', v_student_id));
    end loop;
    insert into public.student_qr_credentials(student_id, token_hash, token_prefix, encrypted_token, encryption_iv)
    values (v_student_id, v_hash, nullif(v_prefix, ''), v_encrypted_token, v_encryption_iv)
    returning id into v_credential_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor_id, 'qr_issued', 'student_qr_credential', v_credential_id, jsonb_build_object('student_id', v_student_id, 'retrievable', true));
    v_results := v_results || jsonb_build_array(jsonb_build_object('studentId', v_student_id, 'credentialId', v_credential_id));
  end loop;
  return v_results;
end;
$$;

-- Existing service-role-only profile update now accepts the Admin role while
-- retaining Super Admin-only user management.
create or replace function public.update_user_profile_secure(
  p_actor_id uuid, p_user_id uuid, p_username text, p_full_name text, p_role text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_username text := public.normalize_username(p_username);
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'super_admin' and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if v_username !~ '^[a-z0-9_.]{3,40}$' then raise exception 'Invalid username' using errcode = '22023'; end if;
  if btrim(coalesce(p_full_name, '')) = '' or length(btrim(p_full_name)) > 200 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_role not in ('super_admin', 'admin', 'faculty', 'officer') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if p_user_id = p_actor_id and p_role <> 'super_admin' then
    raise exception 'You cannot remove your own Super Admin role' using errcode = '22023';
  end if;
  update public.profiles set username = v_username, full_name = btrim(p_full_name), role = p_role where id = p_user_id;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'user_updated', 'user', p_user_id, jsonb_build_object('username', v_username, 'role', p_role));
end;
$$;

-- Reporting access and operational attendance corrections for Admin.
create or replace function public.get_event_attendance_report(p_event_id uuid)
returns table (
  student_id uuid, student_number text, full_name text, sex text, year_level smallint,
  department_id uuid, department_name text, department_code text, is_expected boolean,
  attendance_status text, check_in_at timestamptz, check_in_method text,
  check_out_at timestamptz, check_out_method text
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_role text := public.current_user_role();
begin
  if not public.current_user_enabled() or v_role not in ('super_admin', 'admin', 'faculty')
    or not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and deleted_at is null) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  return query
  with included_students as (
    select expected.student_id, true as expected from public.get_event_expected_students(p_event_id) expected
    union all
    select a.student_id, false as expected from public.attendance a where a.event_id = p_event_id
  ), report_students as (
    select included.student_id, bool_or(included.expected) as expected
    from included_students included group by included.student_id
  )
  select s.id, s.student_number, s.full_name, s.sex, s.year_level,
    d.id, d.name, d.code, report_students.expected,
    coalesce(a.check_in_status, 'absent'), a.check_in_at, a.check_in_method,
    a.check_out_at, a.check_out_method
  from report_students
  join public.students s on s.id = report_students.student_id
  join public.departments d on d.id = s.department_id
  left join public.attendance a on a.event_id = p_event_id and a.student_id = s.id
  order by d.code, s.year_level, s.full_name, s.id;
end;
$$;

create or replace function public.get_student_attendance_history(p_student_id uuid)
returns table (
  event_id uuid, event_name text, event_start_at timestamptz, event_status text,
  attendance_status text, check_in_at timestamptz, check_in_method text,
  check_out_at timestamptz, check_out_method text
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_role text := public.current_user_role(); v_student public.students%rowtype;
begin
  if not public.current_user_enabled() or v_role not in ('super_admin', 'admin', 'faculty') then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select * into v_student from public.students where id = p_student_id;
  if not found then raise exception 'Student not found' using errcode = 'P0002'; end if;
  return query
  select e.id, e.name, e.start_at, e.status, coalesce(a.check_in_status, 'absent'),
    a.check_in_at, a.check_in_method, a.check_out_at, a.check_out_method
  from public.events e
  left join public.attendance a on a.event_id = e.id and a.student_id = p_student_id
  where e.deleted_at is null and e.status <> 'draft' and public.can_access_event(e.id)
    and (
      a.id is not null
      or ((e.status = 'closed' or e.check_in_closes_at < now())
        and exists (select 1 from public.event_departments ed where ed.event_id = e.id and ed.department_id = v_student.department_id)
        and (not exists (select 1 from public.event_year_levels eyl where eyl.event_id = e.id)
          or exists (select 1 from public.event_year_levels eyl where eyl.event_id = e.id and eyl.year_level = v_student.year_level)))
    )
  order by e.start_at desc, e.id;
end;
$$;

create or replace function public.admin_correct_attendance(
  p_event_id uuid, p_student_id uuid, p_check_in_at timestamptz,
  p_check_in_status text, p_check_out_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_check_in_status not in ('present', 'late') then raise exception 'Invalid check-in status' using errcode = '22023'; end if;
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
  ) on conflict (event_id, student_id) do update set
    check_in_at = excluded.check_in_at, check_in_status = excluded.check_in_status,
    check_in_method = 'manual', check_in_by = auth.uid(), check_out_at = excluded.check_out_at,
    check_out_method = excluded.check_out_method, check_out_by = excluded.check_out_by
  returning id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'attendance_admin_updated', 'attendance', v_id,
    jsonb_build_object('event_id', p_event_id, 'student_id', p_student_id));
  return v_id;
end;
$$;

create or replace function public.admin_remove_attendance(p_event_id uuid, p_student_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_attendance public.attendance%rowtype;
begin
  if not public.is_system_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  select * into v_attendance from public.attendance
  where event_id = p_event_id and student_id = p_student_id for update;
  if not found then raise exception 'Attendance record not found' using errcode = 'P0002'; end if;
  delete from public.attendance where id = v_attendance.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'attendance_admin_removed', 'attendance', v_attendance.id,
    jsonb_build_object('event_id', p_event_id, 'student_id', p_student_id,
      'previous_check_in_at', v_attendance.check_in_at,
      'previous_check_in_status', v_attendance.check_in_status,
      'previous_check_out_at', v_attendance.check_out_at));
  return v_attendance.id;
end;
$$;

-- Revocation-aware attendance processing. Admin can work across events but,
-- unlike Super Admin, must still verify the current event PIN before scanning.
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
  v_role text := public.current_user_role();
  v_now timestamptz := now();
  v_event public.events%rowtype;
  v_student public.students%rowtype;
  v_attendance public.attendance%rowtype;
  v_status text;
begin
  if v_actor is null or v_role is null or v_role not in ('super_admin', 'admin', 'faculty', 'officer') then
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
  if v_role not in ('super_admin', 'admin') and not exists (
    select 1 from public.event_assignments ea where ea.event_id = p_event_id and ea.user_id = v_actor
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
      'code', 'student_not_eligible', 'message', 'The student is not part of this event audience.',
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name)
    );
  end if;

  if p_direction = 'check_in' then
    v_status := case when v_now > v_event.late_after then 'late' else 'present' end;
    insert into public.attendance (
      event_id, student_id, check_in_at, check_in_status, check_in_method, check_in_by
    ) values (p_event_id, v_student.id, v_now, v_status, p_method, v_actor)
    on conflict (event_id, student_id) do nothing returning * into v_attendance;

    if v_attendance.id is null then
      select * into v_attendance from public.attendance
      where event_id = p_event_id and student_id = v_student.id;
      return jsonb_build_object(
        'code', 'already_checked_in', 'message', 'The student is already checked in.',
        'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name),
        'attendance', jsonb_build_object('id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
          'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at)
      );
    end if;
    return jsonb_build_object(
      'code', case when v_status = 'late' then 'success_late' else 'success_present' end,
      'message', case when v_status = 'late' then 'Student checked in as late.' else 'Student checked in.' end,
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name),
      'attendance', jsonb_build_object('id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
        'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at)
    );
  end if;

  select * into v_attendance from public.attendance
  where event_id = p_event_id and student_id = v_student.id;
  if not found then
    return jsonb_build_object(
      'code', 'not_checked_in', 'message', 'The student has not checked in.',
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name)
    );
  end if;
  if v_attendance.check_out_at is not null then
    return jsonb_build_object(
      'code', 'already_checked_out', 'message', 'The student is already checked out.',
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name),
      'attendance', jsonb_build_object('id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
        'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at)
    );
  end if;

  update public.attendance
  set check_out_at = v_now, check_out_method = p_method, check_out_by = v_actor
  where id = v_attendance.id and check_out_at is null returning * into v_attendance;
  if v_attendance.check_out_at is null then
    return jsonb_build_object('code', 'already_checked_out', 'message', 'The student is already checked out.');
  end if;
  return jsonb_build_object(
    'code', 'success_checkout', 'message', 'Student checked out.',
    'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name),
    'attendance', jsonb_build_object('id', v_attendance.id, 'checkInAt', v_attendance.check_in_at,
      'checkInStatus', v_attendance.check_in_status, 'checkOutAt', v_attendance.check_out_at)
  );
end;
$$;

-- Undo only the current operator's most recent successful manual action in the
-- event, within five minutes, and only when no later attendance state depends on it.
create or replace function public.undo_last_manual_attendance(
  p_event_id uuid, p_attendance_id uuid, p_direction text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_latest public.audit_logs%rowtype;
  v_attendance public.attendance%rowtype;
  v_student public.students%rowtype;
begin
  if not public.current_user_enabled() or not public.can_access_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_direction not in ('check_in', 'check_out') then raise exception 'Invalid direction' using errcode = '22023'; end if;

  select * into v_latest from public.audit_logs
  where actor_user_id = auth.uid() and action = 'attendance_manual_created'
    and metadata->>'event_id' = p_event_id::text
  order by created_at desc, id desc limit 1;
  if not found or v_latest.entity_id <> p_attendance_id or v_latest.metadata->>'direction' <> p_direction then
    raise exception 'Only your latest manual attendance action can be undone' using errcode = '22023';
  end if;
  if v_latest.created_at < now() - interval '5 minutes' then
    raise exception 'The five-minute undo window has expired' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.audit_logs where actor_user_id = auth.uid()
      and action = 'attendance_manual_undone' and metadata->>'source_audit_id' = v_latest.id::text
  ) then raise exception 'This manual action was already undone' using errcode = '22023'; end if;

  select * into v_attendance from public.attendance
  where id = p_attendance_id and event_id = p_event_id for update;
  if not found then raise exception 'Attendance record not found' using errcode = 'P0002'; end if;
  select * into v_student from public.students where id = v_attendance.student_id;

  if p_direction = 'check_in' then
    if v_attendance.check_in_method <> 'manual' or v_attendance.check_in_by <> auth.uid()
      or v_attendance.check_out_at is not null then
      raise exception 'This check-in can no longer be safely undone' using errcode = '55000';
    end if;
    delete from public.attendance where id = v_attendance.id;
  else
    if v_attendance.check_out_method <> 'manual' or v_attendance.check_out_by <> auth.uid() then
      raise exception 'This check-out can no longer be safely undone' using errcode = '55000';
    end if;
    update public.attendance set check_out_at = null, check_out_method = null, check_out_by = null
    where id = v_attendance.id;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'attendance_manual_undone', 'attendance', v_attendance.id,
    jsonb_build_object('source_audit_id', v_latest.id, 'event_id', p_event_id,
      'student_id', v_attendance.student_id, 'direction', p_direction));

  return jsonb_build_object(
    'code', 'undo_success',
    'message', case when p_direction = 'check_in' then 'Manual check-in undone.' else 'Manual check-out undone.' end,
    'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number, 'fullName', v_student.full_name),
    'attendance', jsonb_build_object('id', v_attendance.id,
      'checkInAt', case when p_direction = 'check_in' then null else v_attendance.check_in_at end,
      'checkInStatus', case when p_direction = 'check_in' then null else v_attendance.check_in_status end,
      'checkOutAt', null)
  );
end;
$$;

revoke all on function public.undo_last_manual_attendance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.undo_last_manual_attendance(uuid, uuid, text) to authenticated;

commit;
