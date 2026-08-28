begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(btrim(value));
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null,
  full_name text not null,
  role text not null,
  is_enabled boolean not null default true,
  session_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_normalized check (
    username = public.normalize_username(username)
    and username ~ '^[a-z0-9_.]{3,40}$'
  ),
  constraint profiles_full_name_not_blank check (btrim(full_name) <> ''),
  constraint profiles_role_valid check (role in ('super_admin', 'faculty', 'officer')),
  constraint profiles_username_unique unique (username)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint departments_name_not_blank check (btrim(name) <> ''),
  constraint departments_code_not_blank check (btrim(code) <> ''),
  constraint departments_code_trimmed check (code = btrim(code))
);

create unique index departments_active_name_unique
  on public.departments (lower(name)) where deleted_at is null;
create unique index departments_active_code_unique
  on public.departments (lower(code)) where deleted_at is null;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null,
  full_name text not null,
  year_level smallint not null,
  sex text not null,
  department_id uuid not null references public.departments(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint students_number_not_blank check (btrim(student_number) <> ''),
  constraint students_number_trimmed check (student_number = btrim(student_number)),
  constraint students_name_not_blank check (btrim(full_name) <> ''),
  constraint students_year_level_valid check (year_level between 1 and 4),
  constraint students_sex_valid check (sex in ('Male', 'Female'))
);

create unique index students_active_number_unique
  on public.students (lower(student_number)) where deleted_at is null;
create index students_department_id_idx on public.students (department_id);
create index students_year_level_idx on public.students (year_level);
create index students_is_active_idx on public.students (is_active);
create index students_deleted_at_idx on public.students (deleted_at);

create table public.student_qr_credentials (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  token_hash text not null,
  token_prefix text,
  is_active boolean not null default true,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_qr_hash_not_blank check (btrim(token_hash) <> ''),
  constraint student_qr_active_not_revoked check (not is_active or revoked_at is null),
  constraint student_qr_token_hash_unique unique (token_hash)
);

create unique index student_qr_one_active_per_student
  on public.student_qr_credentials (student_id)
  where is_active and revoked_at is null;
create index student_qr_token_hash_idx on public.student_qr_credentials (token_hash);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  venue text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  check_in_opens_at timestamptz not null,
  late_after timestamptz not null,
  check_in_closes_at timestamptz not null,
  attendance_mode text not null,
  check_out_opens_at timestamptz,
  check_out_closes_at timestamptz,
  pin_hash text not null,
  status text not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_name_not_blank check (btrim(name) <> ''),
  constraint events_time_order check (start_at <= end_at),
  constraint events_checkin_order check (
    check_in_opens_at <= late_after and late_after <= check_in_closes_at
  ),
  constraint events_mode_valid check (attendance_mode in ('check_in_only', 'check_in_out')),
  constraint events_status_valid check (status in ('draft', 'open', 'closed')),
  constraint events_checkout_valid check (
    (attendance_mode = 'check_in_only' and check_out_opens_at is null and check_out_closes_at is null)
    or
    (attendance_mode = 'check_in_out' and check_out_opens_at is not null
      and check_out_closes_at is not null and check_out_opens_at <= check_out_closes_at)
  ),
  constraint events_pin_hash_not_blank check (btrim(pin_hash) <> '')
);

create index events_status_idx on public.events (status);
create index events_start_at_idx on public.events (start_at);
create index events_deleted_at_idx on public.events (deleted_at);
create index events_created_by_idx on public.events (created_by);

create table public.event_departments (
  event_id uuid not null references public.events(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  primary key (event_id, department_id)
);

create index event_departments_department_idx on public.event_departments (department_id);

create table public.event_year_levels (
  event_id uuid not null references public.events(id) on delete restrict,
  year_level smallint not null,
  primary key (event_id, year_level),
  constraint event_year_levels_valid check (year_level between 1 and 4)
);

create table public.event_assignments (
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_assignments_user_id_idx on public.event_assignments (user_id);

create table public.event_access_grants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint event_access_grants_expiry_valid check (expires_at > granted_at),
  constraint event_access_grants_unique unique (event_id, user_id)
);

create index event_access_grants_lookup_idx
  on public.event_access_grants (event_id, user_id, expires_at);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  check_in_at timestamptz not null,
  check_in_status text not null,
  check_in_method text not null,
  check_in_by uuid not null references public.profiles(id) on delete restrict,
  check_out_at timestamptz,
  check_out_method text,
  check_out_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_checkin_status_valid check (check_in_status in ('present', 'late')),
  constraint attendance_checkin_method_valid check (check_in_method in ('qr', 'manual')),
  constraint attendance_checkout_method_valid check (check_out_method is null or check_out_method in ('qr', 'manual')),
  constraint attendance_checkout_consistent check (
    (check_out_at is null and check_out_method is null and check_out_by is null)
    or
    (check_out_at is not null and check_out_method is not null and check_out_by is not null and check_out_at >= check_in_at)
  ),
  constraint attendance_event_student_unique unique (event_id, student_id)
);

create index attendance_event_id_idx on public.attendance (event_id);
create index attendance_student_id_idx on public.attendance (student_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_action_not_blank check (btrim(action) <> ''),
  constraint audit_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments
for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_enabled
    and (
      p.session_revoked_at is null
      or to_timestamp(coalesce((auth.jwt()->>'iat')::double precision, 0)) > p.session_revoked_at
    );
$$;

create or replace function public.current_user_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_enabled
      and (
        p.session_revoked_at is null
        or to_timestamp(coalesce((auth.jwt()->>'iat')::double precision, 0)) > p.session_revoked_at
      )
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'super_admin', false);
$$;

create or replace function public.is_event_assigned(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_assignments ea
    where ea.event_id = p_event_id and ea.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_enabled() and (
    public.is_super_admin()
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
    public.is_super_admin()
    or public.is_event_assigned(p_event_id)
    or exists (
      select 1 from public.events e
      where e.id = p_event_id
        and e.created_by = auth.uid()
        and public.current_user_role() = 'faculty'
    )
  );
$$;

create or replace function public.audit_student_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'student_created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'student_deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'student_restored';
  else
    v_action := 'student_updated';
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(nullif(current_setting('app.audit_actor_id', true), '')::uuid, auth.uid()),
    v_action,
    'student',
    new.id,
    jsonb_build_object('student_number', new.student_number)
  );
  return new;
end;
$$;

create or replace function public.audit_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'event_created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'event_deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'event_restored';
  elsif old.status <> new.status and new.status = 'open' then
    v_action := 'event_opened';
  elsif old.status <> new.status and new.status = 'closed' then
    v_action := 'event_closed';
  else
    v_action := 'event_updated';
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(nullif(current_setting('app.audit_actor_id', true), '')::uuid, auth.uid()),
    v_action,
    'event',
    new.id,
    jsonb_build_object('name', new.name)
  );
  return new;
end;
$$;

create or replace function public.audit_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.event_assignments;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(nullif(current_setting('app.audit_actor_id', true), '')::uuid, auth.uid()),
    case when tg_op = 'DELETE' then 'event_assignment_removed' else 'event_assignment_created' end,
    'event',
    v_row.event_id,
    jsonb_build_object('user_id', v_row.user_id)
  );
  return v_row;
end;
$$;

create trigger students_audit after insert or update on public.students
for each row execute function public.audit_student_change();
create trigger events_audit after insert or update on public.events
for each row execute function public.audit_event_change();
create trigger event_assignments_audit after insert or delete on public.event_assignments
for each row execute function public.audit_assignment_change();

insert into public.departments (name, code)
values ('Information Technology', 'IT')
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.students enable row level security;
alter table public.student_qr_credentials enable row level security;
alter table public.events enable row level security;
alter table public.event_departments enable row level security;
alter table public.event_year_levels enable row level security;
alter table public.event_assignments enable row level security;
alter table public.event_access_grants enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (public.current_user_enabled() and (id = auth.uid() or public.is_super_admin()));

create policy departments_read on public.departments for select to authenticated
using (public.current_user_enabled() and (deleted_at is null or public.is_super_admin()));
create policy departments_admin_insert on public.departments for insert to authenticated
with check (public.is_super_admin());
create policy departments_admin_update on public.departments for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy students_read on public.students for select to authenticated
using (public.current_user_enabled() and (public.is_super_admin() or (deleted_at is null and is_active)));
create policy students_admin_insert on public.students for insert to authenticated
with check (public.is_super_admin());
create policy students_admin_update on public.students for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

-- No QR credential policies are intentionally defined. Only service-role-backed
-- code and tightly scoped security-definer RPCs can touch credential hashes.

create policy events_read on public.events for select to authenticated
using (deleted_at is null and public.can_access_event(id));
create policy events_manage_update on public.events for update to authenticated
using (deleted_at is null and public.can_manage_event(id))
with check (public.can_manage_event(id));

create policy event_departments_read on public.event_departments for select to authenticated
using (public.can_access_event(event_id));
create policy event_departments_insert on public.event_departments for insert to authenticated
with check (public.can_manage_event(event_id));
create policy event_departments_delete on public.event_departments for delete to authenticated
using (public.can_manage_event(event_id));

create policy event_year_levels_read on public.event_year_levels for select to authenticated
using (public.can_access_event(event_id));
create policy event_year_levels_insert on public.event_year_levels for insert to authenticated
with check (public.can_manage_event(event_id));
create policy event_year_levels_delete on public.event_year_levels for delete to authenticated
using (public.can_manage_event(event_id));

create policy event_assignments_read on public.event_assignments for select to authenticated
using (public.current_user_enabled() and (user_id = auth.uid() or public.can_manage_event(event_id)));
create policy event_assignments_insert on public.event_assignments for insert to authenticated
with check (public.can_manage_event(event_id) and assigned_by = auth.uid());
create policy event_assignments_delete on public.event_assignments for delete to authenticated
using (public.can_manage_event(event_id));

create policy event_access_grants_read on public.event_access_grants for select to authenticated
using (public.current_user_enabled() and (user_id = auth.uid() or public.is_super_admin()));

create policy attendance_read on public.attendance for select to authenticated
using (public.can_access_event(event_id));

create policy audit_logs_admin_read on public.audit_logs for select to authenticated
using (public.is_super_admin());

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.departments to authenticated;
grant insert (name, code) on public.departments to authenticated;
grant update (name, code, deleted_at) on public.departments to authenticated;

grant select on public.students to authenticated;
grant insert (student_number, full_name, year_level, sex, department_id, is_active)
  on public.students to authenticated;
grant update (student_number, full_name, year_level, sex, department_id, is_active, deleted_at)
  on public.students to authenticated;

grant select (
  id, name, description, venue, start_at, end_at, check_in_opens_at, late_after,
  check_in_closes_at, attendance_mode, check_out_opens_at, check_out_closes_at,
  status, created_by, created_at, updated_at, deleted_at
) on public.events to authenticated;
grant update (
  name, description, venue, start_at, end_at, check_in_opens_at, late_after,
  check_in_closes_at, attendance_mode, check_out_opens_at, check_out_closes_at,
  status, deleted_at
) on public.events to authenticated;

grant select, insert, delete on public.event_departments to authenticated;
grant select, insert, delete on public.event_year_levels to authenticated;
grant select, insert, delete on public.event_assignments to authenticated;
grant select on public.event_access_grants to authenticated;
grant select on public.attendance to authenticated;
grant select on public.audit_logs to authenticated;

grant execute on function public.normalize_username(text) to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_enabled() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_event_assigned(uuid) to authenticated;
grant execute on function public.can_manage_event(uuid) to authenticated;
grant execute on function public.can_access_event(uuid) to authenticated;

commit;
