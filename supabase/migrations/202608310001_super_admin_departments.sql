begin;

drop policy departments_read on public.departments;
drop policy departments_admin_insert on public.departments;
drop policy departments_admin_update on public.departments;

create policy departments_read on public.departments for select to authenticated
using (public.current_user_enabled() and (deleted_at is null or public.is_super_admin()));

create policy departments_admin_insert on public.departments for insert to authenticated
with check (public.is_super_admin());

create policy departments_admin_update on public.departments for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.soft_delete_department(p_department_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
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
  if not public.is_super_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.departments set deleted_at = null where id = p_department_id and deleted_at is not null;
  if not found then raise exception 'Deleted department not found' using errcode = 'P0002'; end if;
exception when unique_violation then
  raise exception 'An active department already uses this name or code' using errcode = '23505';
end;
$$;

commit;
