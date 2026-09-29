-- ===========================================================================
-- Taskflow 0002 — Business logic: task keys, automated time tracking,
--                 activity + audit logging, capacity & metrics views
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: current user profile / role / department (SECURITY DEFINER so RLS
-- on profiles can never recurse).
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select auth.uid();
$$;

create or replace function public.current_role()
returns app_role language sql stable security definer set search_path = public as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'EMPLOYEE'::app_role);
$$;

create or replace function public.current_department_id()
returns uuid language sql stable security definer set search_path = public as $$
  select (select p.department_id from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'ADMIN' and p.active from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_department_head()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role in ('ADMIN','DEPARTMENT_HEAD') and p.active
                     from public.profiles p where p.id = auth.uid()), false);
$$;

-- can the current user read this task?
create or replace function public.can_view_task(p_task public.tasks)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or p_task.assignee_id  = auth.uid()
      or p_task.created_by   = auth.uid()
      or p_task.reporter_id  = auth.uid()
      or (
            public.current_role() = 'DEPARTMENT_HEAD'
        and p_task.department_id is not null
        and p_task.department_id = public.current_department_id()
      );
$$;

-- can the current user modify this task?
create or replace function public.can_edit_task(p_task public.tasks)
returns boolean language sql stable as $$
  select public.is_admin()
      or p_task.assignee_id = auth.uid()
      or p_task.created_by  = auth.uid()
      or (
            public.current_role() = 'DEPARTMENT_HEAD'
        and p_task.department_id is not null
        and p_task.department_id = public.current_department_id()
      );
$$;

-- only admins may delete tasks
create or replace function public.can_delete_task(p_task public.tasks)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Audit logging helper. SECURITY DEFINER so ordinary users can never tamper
-- with audit_logs even indirectly.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_old_value   jsonb default null,
  p_new_value   jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_old_value, p_new_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- Task key generation: TF-1, TF-2 ... (prefix configurable, gap free & unique)
-- ---------------------------------------------------------------------------
create or replace function public.org_setting_text(p_key text, p_default text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select value #>> '{}' into v from public.org_settings where key = p_key;
  return coalesce(v, p_default);
exception when others then
  return p_default;
end;
$$;

create or replace function public.next_task_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq   bigint;
begin
  v_prefix := public.org_setting_text('task_key_prefix', 'TF');

  insert into public.tasks (task_key, title)
  values ('__placeholder__', '__generating__')
  returning seq into v_seq;

  update public.tasks
     set task_key = v_prefix || '-' || v_seq
   where seq = v_seq;

  return v_prefix || '-' || v_seq;
end;
$$;

-- Guard: a real INSERT must go through the app flow which sets task_key.
-- This trigger keeps task_key immutable and always present.
create or replace function public.tasks_require_key()
returns trigger language plpgsql as $$
begin
  if new.task_key is null or new.task_key = '' or new.task_key = '__placeholder__' then
    raise exception 'task_key must be supplied by the application'
      using errcode = '23502';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_require_key_trg on public.tasks;
create trigger tasks_require_key_trg before insert on public.tasks
  for each row execute function public.tasks_require_key();

create or replace function public.tasks_key_immutable()
returns trigger language plpgsql as $$
begin
  if new.task_key is distinct from old.task_key then
    raise exception 'task_key is permanent and cannot be changed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_key_immutable_trg on public.tasks;
create trigger tasks_key_immutable_trg before update on public.tasks
  for each row execute function public.tasks_key_immutable();

-- ---------------------------------------------------------------------------
-- Time tracking engine
--   segment_type WORK    : IN_PROGRESS <-> REVIEW
--   segment_type BLOCKED : BLOCKED
-- Durations are always derived from persisted timestamps.
-- ---------------------------------------------------------------------------
create or replace function public.close_open_segments(
  p_task_id uuid,
  p_user_id uuid,
  p_segment segment_type default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.time_logs t
     set end_time   = now(),
         duration   = round((extract(epoch from (now() - t.start_time)) / 3600.0)::numeric, 2)
   where t.task_id = p_task_id
     and t.user_id = p_user_id
     and t.end_time is null
     and (p_segment is null or t.segment_type = p_segment);
end;
$$;

create or replace function public.open_segment(
  p_task_id  uuid,
  p_user_id  uuid,
  p_segment segment_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_existing int;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*) into v_existing
    from public.time_logs
   where task_id = p_task_id and user_id = p_user_id and end_time is null;

  if v_existing > 0 then
    return; -- never create duplicate active timers
  end if;

  insert into public.time_logs (task_id, user_id, start_time, segment_type, source)
  values (p_task_id, p_user_id, now(), p_segment, 'AUTO');
end;
$$;

-- recompute the denormalised hour columns from the immutable time_logs rows
create or replace function public.recompute_task_hours(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual  numeric(7,2);
  v_blocked numeric(7,2);
begin
  select
      round(coalesce(sum(duration) filter (where segment_type = 'WORK'), 0)::numeric, 2),
      round(coalesce(sum(duration) filter (where segment_type = 'BLOCKED'), 0)::numeric, 2)
    into v_actual, v_blocked
    from public.time_logs
   where task_id = p_task_id;

  update public.tasks
     set actual_hours  = greatest(v_actual, 0),
         blocked_hours = greatest(v_blocked, 0)
   where id = p_task_id
     and (actual_hours is distinct from greatest(v_actual, 0)
          or blocked_hours is distinct from greatest(v_blocked, 0));
end;
$$;

-- the workflow engine
create or replace function public.tasks_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_prev   task_status := old.status;
  v_next   task_status := new.status;
  v_actor_for_timer uuid;
begin
  -- bump optimistic concurrency version whenever anything changes
  new.version := old.version + 1;
  new.updated_by := coalesce(v_actor, old.updated_by);

  -- lifecycle timestamps
  if v_next = 'IN_PROGRESS' and old.started_at is null then
    new.started_at := now();
  end if;

  if v_next = 'DONE' and old.completed_at is null then
    new.completed_at := now();
  elsif v_next <> 'DONE' and old.completed_at is not null then
    new.completed_at := null;
  end if;

  -- ---------------- automated time tracking ----------------
  v_actor_for_timer := coalesce(new.assignee_id, old.assignee_id);

  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    -- stop the previous owner's clock
    perform public.close_open_segments(new.id, old.assignee_id);
    -- and start a fresh one for the new owner if the task is still "live"
    if v_next in ('IN_PROGRESS', 'REVIEW', 'BLOCKED') then
      perform public.open_segment(new.id, new.assignee_id,
        case when v_next = 'BLOCKED' then 'BLOCKED'::segment_type else 'WORK'::segment_type end);
    end if;
  else
    if v_next in ('IN_PROGRESS', 'REVIEW') and v_prev not in ('IN_PROGRESS', 'REVIEW') then
      -- TO DO / BACKLOG / DONE / BLOCKED  ->  start or resume a WORK segment
      perform public.close_open_segments(new.id, v_actor_for_timer);
      perform public.open_segment(new.id, v_actor_for_timer, 'WORK');

    elsif v_next = 'BLOCKED' and v_prev <> 'BLOCKED' then
      -- pause work tracking, start recording blocked time separately
      perform public.close_open_segments(new.id, v_actor_for_timer);
      perform public.open_segment(new.id, v_actor_for_timer, 'BLOCKED');

    elsif v_next in ('BACKLOG', 'TO_DO') and v_prev in ('IN_PROGRESS', 'REVIEW', 'BLOCKED') then
      -- stepping back to un-started work stops the clock
      perform public.close_open_segments(new.id, v_actor_for_timer);

    elsif v_next = 'DONE' then
      -- IN PROGRESS / REVIEW / BLOCKED -> DONE stops active tracking
      perform public.close_open_segments(new.id, v_actor_for_timer);
    end if;
  end if;

  -- ---------------- activity + audit ----------------
  if v_next is distinct from v_prev then
    perform public.write_audit('TASK_STATUS_CHANGED', 'task', new.id,
      jsonb_build_object('status', v_prev), jsonb_build_object('status', v_next));
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform public.write_audit('TASK_ASSIGNEE_CHANGED', 'task', new.id,
      jsonb_build_object('assignee_id', old.assignee_id), jsonb_build_object('assignee_id', new.assignee_id));
  end if;

  if new.priority is distinct from old.priority then
    perform public.write_audit('TASK_PRIORITY_CHANGED', 'task', new.id,
      jsonb_build_object('priority', old.priority), jsonb_build_object('priority', new.priority));
  end if;

  if new.sprint_id is distinct from old.sprint_id then
    perform public.write_audit('TASK_SPRINT_CHANGED', 'task', new.id,
      jsonb_build_object('sprint_id', old.sprint_id), jsonb_build_object('sprint_id', new.sprint_id));
  end if;

  if new.due_date is distinct from old.due_date then
    perform public.write_audit('TASK_DUE_DATE_CHANGED', 'task', new.id,
      jsonb_build_object('due_date', old.due_date), jsonb_build_object('due_date', new.due_date));
  end if;

  if new.department_id is distinct from old.department_id then
    perform public.write_audit('TASK_DEPARTMENT_CHANGED', 'task', new.id,
      jsonb_build_object('department_id', old.department_id), jsonb_build_object('department_id', new.department_id));
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.planned_hours is distinct from old.planned_hours then
    perform public.write_audit('TASK_UPDATED', 'task', new.id,
      jsonb_build_object('title', old.title, 'planned_hours', old.planned_hours, 'description', old.description),
      jsonb_build_object('title', new.title, 'planned_hours', new.planned_hours, 'description', new.description));
  end if;

  if v_next = 'DONE' and v_prev <> 'DONE' then
    perform public.write_audit('TASK_COMPLETED', 'task', new.id, null,
      jsonb_build_object('completed_at', new.completed_at));
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_workflow_trg on public.tasks;
create trigger tasks_workflow_trg before update on public.tasks
  for each row execute function public.tasks_workflow();

-- keep hour aggregates correct after the workflow trigger has written the row
create or replace function public.tasks_after_update_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_task_hours(new.id);
  return null;
end;
$$;

drop trigger if exists tasks_after_update_hours_trg on public.tasks;
create trigger tasks_after_update_hours_trg after update on public.tasks
  for each row execute function public.tasks_after_update_hours();

-- guard: BACKLOG tasks must not be attached to a sprint
create or replace function public.tasks_backlog_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'BACKLOG' and new.sprint_id is not null then
    raise exception 'A BACKLOG task cannot belong to a sprint. Move it to TO DO first.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_backlog_guard_trg on public.tasks;
create trigger tasks_backlog_guard_trg before insert or update of status, sprint_id on public.tasks
  for each row execute function public.tasks_backlog_guard();

-- creation + deletion audit
create or replace function public.tasks_audit_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit('TASK_CREATED', 'task', new.id, null,
    jsonb_build_object('task_key', new.task_key, 'title', new.title,
                       'status', new.status, 'priority', new.priority,
                       'department_id', new.department_id, 'assignee_id', new.assignee_id,
                       'sprint_id', new.sprint_id, 'planned_hours', new.planned_hours,
                       'due_date', new.due_date));
  return null;
end;
$$;

drop trigger if exists tasks_audit_insert_trg on public.tasks;
create trigger tasks_audit_insert_trg after insert on public.tasks
  for each row execute function public.tasks_audit_insert();

create or replace function public.tasks_audit_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit('TASK_DELETED', 'task', old.id,
    jsonb_build_object('task_key', old.task_key, 'title', old.title), null);
  return null;
end;
$$;

drop trigger if exists tasks_audit_delete_trg on public.tasks;
create trigger tasks_audit_delete_trg after delete on public.tasks
  for each row execute function public.tasks_audit_delete();

-- ---------------------------------------------------------------------------
-- Comment audit (task activity feed)
-- ---------------------------------------------------------------------------
create or replace function public.comments_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('COMMENT_ADDED', 'task', new.task_id, null,
      jsonb_build_object('comment_id', new.id, 'excerpt', left(new.comment, 200)));
  elsif tg_op = 'DELETE' then
    perform public.write_audit('COMMENT_DELETED', 'task', old.task_id,
      jsonb_build_object('comment_id', old.id, 'excerpt', left(old.comment, 200)), null);
  end if;
  return null;
end;
$$;

drop trigger if exists comments_audit_trg on public.comments;
create trigger comments_audit_trg after insert or delete on public.comments
  for each row execute function public.comments_audit();

-- ---------------------------------------------------------------------------
-- Time log lifecycle: close + recompute + audit
-- ---------------------------------------------------------------------------
create or replace function public.time_logs_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('TIME_TRACKING_STARTED', 'task', new.task_id, null,
      jsonb_build_object('segment_type', new.segment_type, 'start_time', new.start_time));
  elsif tg_op = 'UPDATE' and old.end_time is null and new.end_time is not null then
    perform public.write_audit('TIME_TRACKING_STOPPED', 'task', new.task_id,
      jsonb_build_object('segment_type', new.segment_type),
      jsonb_build_object('duration_hours', new.duration, 'end_time', new.end_time));
  end if;
  return null;
end;
$$;

drop trigger if exists time_logs_audit_trg on public.time_logs;
create trigger time_logs_audit_trg after insert or update on public.time_logs
  for each row execute function public.time_logs_audit();

drop trigger if exists time_logs_recompute_trg on public.time_logs;
create trigger time_logs_recompute_trg after insert or update or delete on public.time_logs
  for each row execute function public.recompute_task_hours(coalesce(new.task_id, old.task_id));

-- ---------------------------------------------------------------------------
-- Sprint audit
-- ---------------------------------------------------------------------------
create or replace function public.sprints_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('SPRINT_CREATED', 'sprint', new.id, null,
      jsonb_build_object('name', new.name, 'status', new.status,
                         'start_date', new.start_date, 'end_date', new.end_date));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.write_audit('SPRINT_STATUS_CHANGED', 'sprint', new.id,
        jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
    end if;
    if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
      perform public.write_audit('SPRINT_DATES_CHANGED', 'sprint', new.id,
        jsonb_build_object('start_date', old.start_date, 'end_date', old.end_date),
        jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.write_audit('SPRINT_DELETED', 'sprint', old.id,
      jsonb_build_object('name', old.name), null);
  end if;
  return null;
end;
$$;

drop trigger if exists sprints_audit_trg on public.sprints;
create trigger sprints_audit_trg after insert or update or delete on public.sprints
  for each row execute function public.sprints_audit();

-- only one ACTIVE sprint overall (global sprints have department_id NULL)
create or replace function public.sprints_single_active_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE' then
    perform 1 from public.sprints
     where status = 'ACTIVE'
       and coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(new.department_id, '00000000-0000-0000-0000-000000000000'::uuid)
     for update;
  end if;
  return new;
end;
$$;

drop trigger if exists sprints_single_active_trg on public.sprints;
create trigger sprints_single_active_trg before update of status on public.sprints
  for each row execute function public.sprints_single_active_guard();

-- ---------------------------------------------------------------------------
-- Profile audit: role / department / active changes
-- ---------------------------------------------------------------------------
create or replace function public.profiles_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.write_audit('PERMISSION_CHANGED', 'profile', new.id,
        jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
    end if;
    if new.department_id is distinct from old.department_id then
      perform public.write_audit('DEPARTMENT_CHANGED', 'profile', new.id,
        jsonb_build_object('department_id', old.department_id),
        jsonb_build_object('department_id', new.department_id));
    end if;
    if new.active is distinct from old.active then
      perform public.write_audit(
        case when new.active then 'USER_ACTIVATED' else 'USER_DEACTIVATED' end,
        'profile', new.id, jsonb_build_object('active', old.active), jsonb_build_object('active', new.active));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_audit_trg on public.profiles;
create trigger profiles_audit_trg after update on public.profiles
  for each row execute function public.profiles_audit();

create or replace function public.departments_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('DEPARTMENT_CREATED', 'department', new.id, null,
      jsonb_build_object('name', new.name, 'head_user_id', new.head_user_id));
  elsif tg_op = 'UPDATE' then
    if new.name is distinct from old.name or new.head_user_id is distinct from old.head_user_id
       or new.active is distinct from old.active then
      perform public.write_audit('DEPARTMENT_UPDATED', 'department', new.id,
        jsonb_build_object('name', old.name, 'head_user_id', old.head_user_id, 'active', old.active),
        jsonb_build_object('name', new.name, 'head_user_id', new.head_user_id, 'active', new.active));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.write_audit('DEPARTMENT_DELETED', 'department', old.id,
      jsonb_build_object('name', old.name), null);
  end if;
  return null;
end;
$$;

drop trigger if exists departments_audit_trg on public.departments;
create trigger departments_audit_trg after insert or update or delete on public.departments
  for each row execute function public.departments_audit();

-- ---------------------------------------------------------------------------
-- New auth user  ->  profile row (this is what makes signup self-provisioning)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(new.email, ''),
    'EMPLOYEE',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Views used by the UI for capacity / metrics (all DB-computed, never in JS)
-- ---------------------------------------------------------------------------

-- live timers with their elapsed time computed from persisted timestamps
create or replace view public.active_time_logs
with (security_invoker = true) as
select
  tl.id,
  tl.task_id,
  tl.user_id,
  tl.start_time,
  tl.segment_type,
  t.task_key,
  t.title as task_title,
  round((extract(epoch from (now() - tl.start_time)) / 3600.0)::numeric, 3) as elapsed_hours
from public.time_logs tl
join public.tasks t on t.id = tl.task_id
where tl.end_time is null;

-- per-employee workload aggregates
create or replace view public.user_workload
with (security_invoker = true) as
select
  p.id                                        as user_id,
  p.name,
  p.email,
  p.department_id,
  p.daily_working_hours,
  p.weekly_working_days,
  p.active,
  p.role,
  coalesce(s.active_tasks, 0)                 as active_tasks,
  coalesce(s.blocked_tasks, 0)                as blocked_tasks,
  coalesce(s.overdue_tasks, 0)                as overdue_tasks,
  coalesce(s.open_tasks, 0)                   as open_tasks,
  coalesce(s.planned_hours, 0)::numeric(10,2) as planned_hours,
  coalesce(s.actual_hours, 0)::numeric(10,2)  as actual_hours
from public.profiles p
left join lateral (
  select
    count(*) filter (where t.status in ('TO_DO','IN_PROGRESS','REVIEW','BLOCKED'))                       as open_tasks,
    count(*) filter (where t.status in ('IN_PROGRESS','REVIEW'))                                         as active_tasks,
    count(*) filter (where t.status = 'BLOCKED')                                                         as blocked_tasks,
    count(*) filter (where t.due_date < current_date
                       and t.status not in ('DONE'))                                                     as overdue_tasks,
    coalesce(sum(t.planned_hours) filter (where t.status <> 'DONE'), 0)                                  as planned_hours,
    coalesce(sum(t.actual_hours) filter (where t.status <> 'DONE'), 0)                                   as actual_hours
  from public.tasks t
  where t.assignee_id = p.id
) s on true;

-- capacity for a window, purely from calendar + profile configuration
create or replace function public.calculate_capacity(
  p_user_id uuid,
  p_from    date,
  p_to      date
)
returns table (
  user_id            uuid,
  from_date          date,
  to_date            date,
  working_days       numeric,
  daily_hours        numeric,
  capacity_hours     numeric
)
language sql stable
security definer
set search_path = public
as $$
  with cfg as (
    select
      p.id as uid,
      coalesce(p.daily_working_hours, 6) as daily_hours,
      coalesce(p.weekly_working_days, 5) as weekly_days
    from public.profiles p
    where p.id = p_user_id
  ),
  days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  evaluated as (
    select
      d.d,
      -- an explicit holiday/absence always wins, then the per-employee
      -- weekday schedule, then the profile's weekly_working_days
      (coalesce(wc.is_working_day, true)
         and coalesce(ec.is_available, true)
         and coalesce(sched.is_working, extract(isodow from d.d)::int <= cfg.weekly_days)
      ) as is_working,
      coalesce(ec.hours, sched.hours, cfg.daily_hours) as hours
    from days d
    cross join cfg
    left join public.working_calendar wc
           on wc.calendar_date = d.d
    left join public.employee_schedules sched
           on sched.user_id = cfg.uid
          and sched.weekday = extract(isodow from d.d)::int - 1
    left join public.employee_calendar ec
           on ec.user_id = cfg.uid
          and ec.calendar_date = d.d
  )
  select
    cfg.uid,
    p_from,
    p_to,
    count(*) filter (where e.is_working)::numeric,
    coalesce(cfg.daily_hours, 0)::numeric,
    round(coalesce(sum(e.hours) filter (where e.is_working), 0)::numeric, 2)
  from evaluated e
  cross join cfg
  group by cfg.uid, cfg.daily_hours;
$$;

-- sprint progress, derived live
create or replace view public.sprint_progress
with (security_invoker = true) as
select
  s.id                as sprint_id,
  s.name              as sprint_name,
  s.status            as sprint_status,
  s.start_date,
  s.end_date,
  s.department_id,
  coalesce(count(t.id), 0)                                            as total_tasks,
  coalesce(count(t.id) filter (where t.status = 'DONE'), 0)            as done_tasks,
  coalesce(count(t.id) filter (where t.status = 'BLOCKED'), 0)        as blocked_tasks,
  coalesce(sum(t.planned_hours), 0)::numeric(10,2)                    as planned_hours,
  coalesce(sum(t.actual_hours), 0)::numeric(10,2)                     as actual_hours
from public.sprints s
left join public.tasks t on t.sprint_id = s.id
group by s.id;

-- ================================ done 0002 ================================
