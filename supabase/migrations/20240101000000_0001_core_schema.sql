-- ===========================================================================
-- Taskflow 0001 — Core schema, enums, indexes, triggers
-- Target: Supabase (PostgreSQL 15+)
-- Run with:  supabase db push        OR   paste into Supabase SQL Editor
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('BACKLOG', 'TO_DO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sprint_status as enum ('PLANNED', 'ACTIVE', 'COMPLETED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type segment_type as enum ('WORK', 'BLOCKED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. departments  (fully configurable from the Admin UI, nothing hardcoded)
-- ===========================================================================
create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text,
  description   text,
  head_user_id  uuid,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint departments_name_key unique (name)
);

-- ===========================================================================
-- 2. profiles  (1:1 with auth.users)
--    role + department are the ONLY authority for permissions. The UI never
--    decides access, the database does.
-- ===========================================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null default '',
  email               text not null,
  role                app_role not null default 'EMPLOYEE',
  department_id       uuid references public.departments(id) on delete set null,
  job_title           text,
  avatar_url          text,
  phone               text,
  -- per-employee working hours configuration (drives capacity maths)
  daily_working_hours numeric(5,2) not null default 6 check (daily_working_hours >= 0 and daily_working_hours <= 24),
  weekly_working_days int not null default 5 check (weekly_working_days between 0 and 7),
  can_create_tasks    boolean not null default true,
  can_assign_tasks    boolean not null default false,
  reports_to          uuid references public.profiles(id) on delete set null,
  active              boolean not null default true,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists profiles_department_idx on public.profiles(department_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_active_idx on public.profiles(active);
create index if not exists profiles_name_lower_idx on public.profiles (lower(name));

-- department heads
alter table public.departments
  drop constraint if exists departments_head_user_id_fkey;
alter table public.departments
  add  constraint departments_head_user_id_fkey
  foreign key (head_user_id) references public.profiles(id) on delete set null;

create index if not exists departments_head_idx on public.departments(head_user_id);

-- ===========================================================================
-- 3. teams + team_members
-- ===========================================================================
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  department_id uuid references public.departments(id) on delete set null,
  lead_user_id  uuid references public.profiles(id) on delete set null,
  description   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint teams_name_key unique (name)
);

create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members(user_id);

-- ===========================================================================
-- 4. sprints
-- ===========================================================================
create table if not exists public.sprints (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal          text,
  start_date    date,
  end_date      date,
  status        sprint_status not null default 'PLANNED',
  department_id uuid references public.departments(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sprints_name_key unique (name),
  constraint sprints_date_range_chk check (end_date is null or start_date is null or end_date >= start_date)
);

-- Business rule: only one ACTIVE sprint per department (NULL dept = global).
create unique index if not exists sprints_one_active_per_dept
  on public.sprints (coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'ACTIVE';

create index if not exists sprints_status_idx on public.sprints(status);
create index if not exists sprints_department_idx on public.sprints(department_id);
create index if not exists sprints_dates_idx on public.sprints(start_date, end_date);

-- ===========================================================================
-- 5. working_calendar  (org-wide working days / weekends / holidays)
--    Absence of a row for a date means "use the org default weekday rule"
--    held in org_settings.
-- ===========================================================================
create table if not exists public.working_calendar (
  id             uuid primary key default gen_random_uuid(),
  calendar_date  date not null unique,
  is_working_day boolean not null default true,
  label          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists working_calendar_date_idx on public.working_calendar(calendar_date);

-- employee specific overrides: leave, absence, partial availability
create table if not exists public.employee_calendar (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  calendar_date  date not null,
  is_available   boolean not null default true,
  hours          numeric(5,2) check (hours >= 0 and hours <= 24),
  reason         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint employee_calendar_unique unique (user_id, calendar_date)
);

create index if not exists employee_calendar_user_date_idx on public.employee_calendar(user_id, calendar_date);

-- per-employee per-weekday schedule
create table if not exists public.employee_schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  is_working  boolean not null default true,
  hours       numeric(5,2) not null default 6 check (hours >= 0 and hours <= 24),
  constraint employee_schedules_unique unique (user_id, weekday)
);

-- ===========================================================================
-- 6. tasks
-- ===========================================================================
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  task_key       text not null unique,                 -- e.g. TF-1042, permanent
  seq            bigint generated always as identity,  -- monotonic counter
  title          text not null check (char_length(trim(title)) between 3 and 300),
  description    text,
  department_id  uuid references public.departments(id) on delete set null,
  assignee_id    uuid references public.profiles(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  reporter_id    uuid references public.profiles(id) on delete set null,
  priority       task_priority not null default 'MEDIUM',
  status         task_status not null default 'TO_DO',
  sprint_id      uuid references public.sprints(id) on delete set null,
  due_date       date,
  planned_hours  numeric(7,2) not null default 0 check (planned_hours >= 0),
  actual_hours   numeric(7,2) not null default 0 check (actual_hours >= 0), -- maintained by trigger
  blocked_hours  numeric(7,2) not null default 0 check (blocked_hours >= 0), -- maintained by trigger
  position       numeric(12,4) not null default 0,     -- ordering inside a column
  story_points   numeric(6,2) check (story_points is null or story_points >= 0),
  blocked_reason text,
  started_at     timestamptz,
  completed_at   timestamptz,
  version        integer not null default 1,            -- optimistic concurrency guard
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  constraint tasks_backlog_no_sprint_chk check (status <> 'BACKLOG' or sprint_id is null)
);

create index if not exists tasks_status_idx        on public.tasks(status);
create index if not exists tasks_department_idx    on public.tasks(department_id);
create index if not exists tasks_assignee_idx      on public.tasks(assignee_id);
create index if not EXISTS tasks_sprint_idx        on public.tasks(sprint_id);
create index if not exists tasks_priority_idx      on public.tasks(priority);
create index if not exists tasks_due_date_idx      on public.tasks(due_date);
create index if not exists tasks_created_by_idx    on public.tasks(created_by);
create index if not exists tasks_board_order_idx   on public.tasks(status, position);
create index if not exists tasks_assignee_status_idx on public.tasks(assignee_id, status);
create index if not exists tasks_title_lower_idx   on public.tasks (lower(title));

-- full text search
create index if not exists tasks_search_idx
  on public.tasks using gin (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(task_key,'') || ' ' || coalesce(description,''))
  );

-- ===========================================================================
-- 7. comments
-- ===========================================================================
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  comment    text not null check (char_length(trim(comment)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_task_idx  on public.comments(task_id, created_at desc);
create index if not exists comments_user_idx on public.comments(user_id);

-- ===========================================================================
-- 8. time_logs  (workflow driven time tracking)
--    A row with end_time IS NULL is the live timer for (task, user).
--    The unique partial index makes duplicate active timers impossible.
-- ===========================================================================
create table if not exists public.time_logs (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  start_time     timestamptz not null default now(),
  end_time       timestamptz,
  duration       numeric(10,2) not null default 0,   -- hours, filled on close
  segment_type   segment_type not null default 'WORK',
  source         text not null default 'AUTO',       -- AUTO | MANUAL
  created_at     timestamptz not null default now(),
  constraint time_logs_duration_chk check (duration >= 0)
);

create unique index if not exists time_logs_one_open_per_user_task
  on public.time_logs (task_id, user_id) where end_time is null;

create index if not exists time_logs_task_idx      on public.time_logs(task_id);
create index if not exists time_logs_user_idx      on public.time_logs(user_id, start_time desc);
create index if not exists time_logs_open_idx      on public.time_logs(user_id) where end_time is null;
create index if not exists time_logs_start_idx     on public.time_logs(start_time);

-- ===========================================================================
-- 9. audit_logs  (append only, enforced)
-- ===========================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_user_idx    on public.audit_logs(user_id, created_at desc);
create index if not exists audit_logs_action_idx  on public.audit_logs(action);

-- audit_logs is append only for everyone: block UPDATE and DELETE
create or replace function block_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only; % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function block_audit_mutation();

drop trigger if exists audit_logs_no_delete on public.audit_logs;
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function block_audit_mutation();

-- ===========================================================================
-- 10. org_settings  (admin configurable, drives capacity defaults)
-- ===========================================================================
create table if not exists public.org_settings (
  id                    uuid primary key default gen_random_uuid(),
  key                   text unique,
  value                 jsonb not null,
  description           text,
  updated_at            timestamptz not null default now()
);

insert into public.org_settings (key, value, description) values
  ('weekend_days', '["0","6"]'::jsonb, 'ISO weekday numbers (0=Sun) treated as non-working by default'),
  ('default_daily_hours', '6'::jsonb, 'Default daily working hours for new employees'),
  ('default_weekly_days', '5'::jsonb, 'Default number of working days per week'),
  ('task_key_prefix', '"TF"'::jsonb, 'Prefix used when generating task keys')
on conflict (key) do nothing;

-- ===========================================================================
-- 11. updated_at triggers
-- ===========================================================================
drop trigger if exists departments_touch on public.departments;
create trigger departments_touch before update on public.departments
  for each row execute function set_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function set_updated_at();

drop trigger if exists teams_touch on public.teams;
create trigger teams_touch before update on public.teams
  for each row execute function set_updated_at();

drop trigger if exists sprints_touch on public.sprints;
create trigger sprints_touch before update on public.sprints
  for each row execute function set_updated_at();

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function set_updated_at();

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments
  for each row execute function set_updated_at();

drop trigger if exists working_calendar_touch on public.working_calendar;
create trigger working_calendar_touch before update on public.working_calendar
  for each row execute function set_updated_at();

drop trigger if exists employee_calendar_touch on public.employee_calendar;
create trigger employee_calendar_touch before update on public.employee_calendar
  for each row execute function set_updated_at();

drop trigger if exists org_settings_touch on public.org_settings;
create trigger org_settings_touch before update on public.org_settings
  for each row execute function set_updated_at();

-- =========================================================== done 0001 ======
