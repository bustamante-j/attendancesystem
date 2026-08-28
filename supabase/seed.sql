insert into public.departments (name, code)
values ('College of Information Technology', 'CIT')
on conflict do nothing;
