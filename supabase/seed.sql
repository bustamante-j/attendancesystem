insert into public.departments (name, code)
values ('Information Technology', 'IT')
on conflict do nothing;
