begin;

-- Existing appointments deliberately retain an unknown type (NULL).
alter table public.follow_up_tasks
  add column appointment_type text
  constraint follow_up_appointment_type_check
  check (appointment_type is null or appointment_type in ('follow_up', 'phone'));

commit;
