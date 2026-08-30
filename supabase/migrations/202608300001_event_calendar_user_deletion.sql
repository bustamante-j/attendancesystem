begin;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create unique index if not exists profiles_single_super_admin_idx
  on public.profiles ((role))
  where role = 'super_admin' and deleted_at is null;

create or replace function public.protect_super_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'super_admin' then
    if tg_op = 'DELETE' then
      raise exception 'The Super Admin account cannot be deleted' using errcode = '42501';
    end if;
    if new.role <> 'super_admin' or not new.is_enabled or new.deleted_at is not null then
      raise exception 'The Super Admin account cannot be demoted, disabled, or deleted' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_super_admin_profile on public.profiles;
create trigger protect_super_admin_profile
before update or delete on public.profiles
for each row execute function public.protect_super_admin_profile();

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

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (
  deleted_at is null
  and public.current_user_enabled()
  and (id = auth.uid() or public.is_system_admin())
);

revoke all on function public.archive_user_secure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_user_secure(uuid, uuid, text) to service_role;

commit;
