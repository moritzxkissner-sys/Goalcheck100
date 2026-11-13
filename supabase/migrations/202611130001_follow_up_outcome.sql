begin;
-- Separate result; do not rewrite appointment status, dates, type or permissions.
alter table public.follow_up_tasks
  add column outcome_status text
  constraint follow_up_outcome_status_check
  check (outcome_status is null or outcome_status in ('no_show', 'reschedule_requested', 'sale'));
commit;
