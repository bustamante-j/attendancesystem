begin;

-- PostgreSQL regular-expression bounds cannot exceed 255. The former
-- {40,256} quantifier raised SQLSTATE 2201B whenever a credential was issued.
alter table public.student_qr_credentials
  drop constraint student_qr_encrypted_format,
  add constraint student_qr_encrypted_format check (
    encrypted_token is null or encrypted_token ~ '^[A-Za-z0-9_-]{40,192}$'
  );

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
  if p_encrypted_token !~ '^[A-Za-z0-9_-]{40,192}$' or p_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
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
    if v_encrypted_token !~ '^[A-Za-z0-9_-]{40,192}$' or v_encryption_iv !~ '^[A-Za-z0-9_-]{16}$' then
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

revoke all on function public.issue_student_qr_with_escrow_secure(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.batch_issue_student_qr_with_escrow_secure(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.issue_student_qr_with_escrow_secure(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.batch_issue_student_qr_with_escrow_secure(uuid, jsonb) to service_role;

commit;
