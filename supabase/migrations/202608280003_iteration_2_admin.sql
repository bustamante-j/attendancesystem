begin;

create or replace function public.audit_department_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'department_created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'department_deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'department_restored';
  else
    v_action := 'department_updated';
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(nullif(current_setting('app.audit_actor_id', true), '')::uuid, auth.uid()),
    v_action,
    'department',
    new.id,
    jsonb_build_object('code', new.code, 'name', new.name)
  );
  return new;
end;
$$;

create trigger departments_audit after insert or update on public.departments
for each row execute function public.audit_department_change();

create or replace function public.bulk_import_students(
  p_rows jsonb,
  p_update_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_row_index integer := 1;
  v_source_row integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}'::text[];
  v_student_number text;
  v_full_name text;
  v_year_level smallint;
  v_sex text;
  v_department_code text;
  v_department_id uuid;
  v_is_active boolean;
  v_existing_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import must contain 1 to 2000 rows' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_index := v_row_index + 1;
    begin
      v_source_row := case
        when coalesce(v_row->>'source_row', '') ~ '^[0-9]{1,6}$' then (v_row->>'source_row')::integer
        else v_row_index
      end;
      v_student_number := btrim(coalesce(v_row->>'student_number', ''));
      v_full_name := btrim(coalesce(v_row->>'full_name', ''));
      v_department_code := lower(btrim(coalesce(v_row->>'department_code', '')));

      if v_student_number = '' then raise exception 'Student ID is required.'; end if;
      if length(v_student_number) > 80 then raise exception 'Student ID is too long.'; end if;
      if lower(v_student_number) = any(v_seen) then raise exception 'Duplicate Student ID in this file.'; end if;
      v_seen := array_append(v_seen, lower(v_student_number));
      if v_full_name = '' then raise exception 'Full name is required.'; end if;
      if length(v_full_name) > 200 then raise exception 'Full name is too long.'; end if;
      if coalesce(v_row->>'year_level', '') !~ '^[1-4]$' then raise exception 'Year level must be 1, 2, 3, or 4.'; end if;
      v_year_level := (v_row->>'year_level')::smallint;

      v_sex := case lower(btrim(coalesce(v_row->>'sex', '')))
        when 'male' then 'Male'
        when 'female' then 'Female'
        else null
      end;
      if v_sex is null then raise exception 'Sex must be Male or Female.'; end if;

      select id into v_department_id
      from public.departments
      where lower(code) = v_department_code and deleted_at is null;
      if v_department_id is null then raise exception 'Department code was not found.'; end if;

      v_is_active := case lower(btrim(coalesce(v_row->>'is_active', 'true')))
        when 'true' then true when '1' then true when 'yes' then true when 'active' then true
        when 'false' then false when '0' then false when 'no' then false when 'inactive' then false
        else null
      end;
      if v_is_active is null then raise exception 'Active must be true or false.'; end if;

      select id into v_existing_id
      from public.students
      where lower(student_number) = lower(v_student_number) and deleted_at is null;

      if v_existing_id is not null and not p_update_existing then
        raise exception 'Student ID already exists.';
      elsif v_existing_id is not null then
        update public.students set
          full_name = v_full_name,
          year_level = v_year_level,
          sex = v_sex,
          department_id = v_department_id,
          is_active = v_is_active
        where id = v_existing_id;
        v_updated := v_updated + 1;
      else
        insert into public.students(student_number, full_name, year_level, sex, department_id, is_active)
        values (v_student_number, v_full_name, v_year_level, v_sex, v_department_id, v_is_active);
        v_inserted := v_inserted + 1;
      end if;
    exception
      when sqlstate 'P0001' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_source_row,
          'studentNumber', nullif(v_student_number, ''),
          'message', sqlerrm
        ));
      when unique_violation then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_source_row,
          'studentNumber', nullif(v_student_number, ''),
          'message', 'Student ID conflicts with an existing record.'
        ));
      when check_violation or not_null_violation or invalid_text_representation then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_source_row,
          'studentNumber', nullif(v_student_number, ''),
          'message', 'One or more values are invalid.'
        ));
      when others then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_source_row,
          'studentNumber', nullif(v_student_number, ''),
          'message', 'This row could not be imported.'
        ));
    end;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, metadata)
  values (
    auth.uid(), 'student_batch_imported', 'student',
    jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'failed', jsonb_array_length(v_errors))
  );
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'errors', v_errors);
end;
$$;

create or replace function public.get_student_qr_statuses(p_student_ids uuid[] default null)
returns table (
  student_id uuid,
  has_active_credential boolean,
  issued_at timestamptz,
  token_prefix text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    q.id is not null,
    q.issued_at,
    q.token_prefix
  from public.students s
  left join public.student_qr_credentials q
    on q.student_id = s.id and q.is_active and q.revoked_at is null
  where s.deleted_at is null
    and (p_student_ids is null or s.id = any(p_student_ids));
end;
$$;

create or replace function public.restore_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.students set deleted_at = null where id = p_student_id and deleted_at is not null;
  if not found then raise exception 'Deleted student not found' using errcode = 'P0002'; end if;
exception
  when unique_violation then
    raise exception 'Another active record already uses this Student ID' using errcode = '23505';
end;
$$;

create or replace function public.soft_delete_department(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if exists (
    select 1 from public.students where department_id = p_department_id and deleted_at is null
  ) then
    raise exception 'Move or delete current students before deleting this department' using errcode = '23503';
  end if;
  update public.departments set deleted_at = now()
  where id = p_department_id and deleted_at is null;
  if not found then raise exception 'Department not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.restore_department(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.departments set deleted_at = null
  where id = p_department_id and deleted_at is not null;
  if not found then raise exception 'Deleted department not found' using errcode = 'P0002'; end if;
exception
  when unique_violation then
    raise exception 'An active department already uses this name or code' using errcode = '23505';
end;
$$;

create or replace function public.set_event_status_secure(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid event status' using errcode = '22023';
  end if;
  if p_status = 'open' and not exists (
    select 1 from public.event_departments where event_id = p_event_id
  ) then
    raise exception 'An event audience is required before opening' using errcode = '22023';
  end if;
  update public.events set status = p_status
  where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
end;
$$;

-- Service-role-only transactional backend for batch credential issuance.
create or replace function public.batch_issue_student_qr_secure(
  p_actor_id uuid,
  p_credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_student_id uuid;
  v_hash text;
  v_prefix text;
  v_credential_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_old record;
  v_seen uuid[] := '{}'::uuid[];
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'super_admin' and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_credentials is null or jsonb_typeof(p_credentials) <> 'array'
    or jsonb_array_length(p_credentials) = 0
    or jsonb_array_length(p_credentials) > 500 then
    raise exception 'Batch must contain 1 to 500 credentials' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_credentials)
    order by value->>'student_id'
  loop
    begin
      v_student_id := (v_item->>'student_id')::uuid;
    exception when others then
      raise exception 'Invalid student identifier' using errcode = '22023';
    end;
    v_hash := v_item->>'token_hash';
    v_prefix := v_item->>'token_prefix';
    if v_student_id = any(v_seen) then raise exception 'Duplicate student in batch' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_student_id);
    if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid token hash' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.students where id = v_student_id and deleted_at is null
    ) then raise exception 'Student not found' using errcode = 'P0002'; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_student_id::text, 0));
    for v_old in
      update public.student_qr_credentials
      set is_active = false, revoked_at = now()
      where student_id = v_student_id and is_active and revoked_at is null
      returning id
    loop
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      values (p_actor_id, 'qr_revoked', 'student_qr_credential', v_old.id, jsonb_build_object('student_id', v_student_id));
    end loop;

    insert into public.student_qr_credentials(student_id, token_hash, token_prefix)
    values (v_student_id, v_hash, nullif(v_prefix, ''))
    returning id into v_credential_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor_id, 'qr_issued', 'student_qr_credential', v_credential_id, jsonb_build_object('student_id', v_student_id));
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'studentId', v_student_id, 'credentialId', v_credential_id
    ));
  end loop;
  return v_results;
end;
$$;

-- Service-role-only profile update used after the Admin Auth email update.
create or replace function public.update_user_profile_secure(
  p_actor_id uuid,
  p_user_id uuid,
  p_username text,
  p_full_name text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := public.normalize_username(p_username);
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'super_admin' and is_enabled
  ) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if v_username !~ '^[a-z0-9_.]{3,40}$' then raise exception 'Invalid username' using errcode = '22023'; end if;
  if btrim(coalesce(p_full_name, '')) = '' or length(btrim(p_full_name)) > 200 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_role not in ('super_admin', 'faculty', 'officer') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if p_user_id = p_actor_id and p_role <> 'super_admin' then
    raise exception 'You cannot remove your own Super Admin role' using errcode = '22023';
  end if;

  update public.profiles set username = v_username, full_name = btrim(p_full_name), role = p_role
  where id = p_user_id;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'user_updated', 'user', p_user_id, jsonb_build_object('username', v_username, 'role', p_role));
end;
$$;

revoke all on function public.bulk_import_students(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.get_student_qr_statuses(uuid[]) from public, anon, authenticated;
revoke all on function public.restore_student(uuid) from public, anon, authenticated;
revoke all on function public.soft_delete_department(uuid) from public, anon, authenticated;
revoke all on function public.restore_department(uuid) from public, anon, authenticated;
revoke all on function public.set_event_status_secure(uuid, text) from public, anon, authenticated;
revoke all on function public.batch_issue_student_qr_secure(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_user_profile_secure(uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.bulk_import_students(jsonb, boolean) to authenticated;
grant execute on function public.get_student_qr_statuses(uuid[]) to authenticated;
grant execute on function public.restore_student(uuid) to authenticated;
grant execute on function public.soft_delete_department(uuid) to authenticated;
grant execute on function public.restore_department(uuid) to authenticated;
grant execute on function public.set_event_status_secure(uuid, text) to authenticated;
grant execute on function public.batch_issue_student_qr_secure(uuid, jsonb) to service_role;
grant execute on function public.update_user_profile_secure(uuid, uuid, text, text, text) to service_role;

commit;
