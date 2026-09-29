-- ===========================================================================
-- Taskflow 0004 — Seed the organisation structure.
--
-- Only *configuration* rows live here (departments, calendar defaults,
-- settings). NO mock users, NO mock tasks — every task in the system is
-- created by a real employee through the application.
-- ===========================================================================

insert into public.departments (name, code, description) values
  ('Development',            'DEV', 'Product engineering and implementation'),
  ('QA',                     'QA',  'Quality assurance, testing and release verification'),
  ('Scrum Master',           'SM',  'Agile facilitation, backlog grooming and delivery flow'),
  ('Delivery Management',    'DLM', 'Programme delivery, client engagement and reporting'),
  ('HR',                     'HR',  'People operations, policy and employee welfare'),
  ('Administration',         'ADM', 'Business and office administration'),
  ('Talent Acquisition',     'TA',  'Recruitment, onboarding and employer branding'),
  ('Operations',             'OPS', 'Day to day operational execution'),
  ('Finance',                'FIN', 'Accounting, budgeting and financial control')
on conflict (name) do update
  set code = excluded.code,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- Default weekday schedule rows are intentionally NOT created here: capacity
-- falls back to profiles.weekly_working_days / daily_working_hours, and
-- admins can add per-employee schedules from the Calendar page.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Bootstrap helper: the FIRST real user to sign up becomes System Admin.
-- Runs on every signup but is a no-op once an admin exists.
-- ---------------------------------------------------------------------------
create or replace function public.promote_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'ADMIN') then
    update public.profiles set role = 'ADMIN', can_assign_tasks = true where id = new.id;
    perform public.write_audit('USER_PROMOTED', 'profile', new.id, null,
      jsonb_build_object('role', 'ADMIN', 'reason', 'first user bootstrap'));
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_promote on auth.users;
create trigger on_auth_user_created_promote after insert on auth.users
  for each row execute function public.promote_first_admin();

-- ================================ done 0004 ================================
