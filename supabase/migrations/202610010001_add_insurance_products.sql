-- Apply once after 202609290001_team_performance.sql.
-- Preserve historical Kfz rows while accepting the four new products.
begin;

alter table public.sales_entries drop constraint sales_entries_category_check;
alter table public.sales_entries add constraint sales_entries_category_check
  check (category in (
    'Rechtsschutz', 'Haftpflicht', 'Hausrat', 'Wohngebäude',
    'Unfall', 'Krankenversicherung', 'Recht und Heim',
    'Reis Protect 365', 'Top Schutzbrief', 'Lebensversicherung',
    'Sonstiges'
  )) not valid;

commit;
