begin;

create temporary table iteration_6_qa_students on commit drop as
select id
from public.students
where student_number like 'ATT-QA-%'
  and full_name like 'Attendly System QA %';

create temporary table iteration_6_qa_events on commit drop as
select id
from public.events
where name like 'Attendly System QA %'
  and description = 'ITERATION_6_AUTOMATED_QA';

delete from public.student_qr_credentials
where student_id in (select id from iteration_6_qa_students);

delete from public.students
where id in (select id from iteration_6_qa_students);

delete from public.event_access_grants
where event_id in (select id from iteration_6_qa_events);
delete from public.event_assignments
where event_id in (select id from iteration_6_qa_events);
delete from public.event_departments
where event_id in (select id from iteration_6_qa_events);
delete from public.event_year_levels
where event_id in (select id from iteration_6_qa_events);
delete from public.events
where id in (select id from iteration_6_qa_events);

delete from public.audit_logs
where entity_id in (select id from iteration_6_qa_students)
   or entity_id in (select id from iteration_6_qa_events)
   or metadata->>'student_id' in (select id::text from iteration_6_qa_students)
   or (entity_type = 'event' and metadata->>'name' like 'Attendly System QA %');

commit;
