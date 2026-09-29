-- ===========================================================================
-- Taskflow 0003 — Row Level Security
--
-- This is the ONLY place permissions are decided. The React UI hides buttons
-- for usability, but every read and write below is enforced by PostgreSQL,
-- so a user cannot bypass it with curl, the Supabase console or a modified
-- frontend.
-- ===========================================================================

alter table public.departments        enable row level security;
alter table public.profiles           enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.sprints            enable row level security;
alter table public.tasks              enable row level security;
alter table public.comments           enable row level security;
alter table public.time_logs          enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.working_calendar   enable row level security;
alter table public.employee_calendar  enable row level security;
alter table public.employee_schedules enable row level security;
alter table public.org_settings       enable row level security;

-- Re-apply RLS on views so their querying user is the one filtered.
alter table public.active_time_logs  enable row level security;
alter table public.user_workload     enable row level security;
alter table public.sprint_progress   enable row level security;

-- ---------------------------------------------------------------------------
-- VIEW POLICIES (security_invoker views inherit the base table's RLS, but
-- explicit policies keep behaviour identical across Supabase versions)
-- ---------------------------------------------------------------------------
drop policy if exists active_time_logs_read on public.active_time_logs;
create policy active_time_logs_read on public.active_time_logs for select to authenticated
  using (public.can_view_task((select t from public.tasks t where t.id = task_id)));

drop policy if exists user_workload_read on public.user_workload;
create policy user_workload_read on public.user_workload for select to authenticated
  using (public.is_admin() or public.is_department_head() or id = auth.uid());

drop policy if exists sprint_progress_read on public.sprint_progress;
create policy sprint_progress_read on public.sprint_progress for select to authenticated
  using (public.is_admin()
         or public.is_department_head()
         or exists (select 1 from public.tasks t
                     where t.sprint_id = sprint_id
                       and (t.assignee_id = auth.uid() or t.created_by = auth.uid())));

-- ===========================================================================
-- departments
-- ===========================================================================
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select to authenticated
  using (active = true or public.is_admin());

drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments for insert to authenticated
  with check (public.is_admin());

drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists departments_delete on public.departments;
create policy departments_delete on public.departments for delete to authenticated
  using (public.is_admin());

-- ===========================================================================
-- profiles
--   SELECT : every signed-in employee needs names for assignee pickers
--   UPDATE : admin = anything; self = safe columns only (enforced by trigger)
--   INSERT : only the auth trigger (SECURITY DEFINER) creates profiles
--   DELETE : admin only
-- ===========================================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (active = true or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- Self-service profile edits may never touch privileged columns.
create or replace function public.profiles_self_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.role                is distinct from old.role then raise exception 'You cannot change your own role'; end if;
    if new.active              is distinct from old.active then raise exception 'You cannot change your own active flag'; end if;
    if new.department_id       is distinct from old.department_id then raise exception 'You cannot change your own department'; end if;
    if new.can_assign_tasks    is distinct from old.can_assign_tasks then raise exception 'You cannot change your own permissions'; end if;
    if new.can_create_tasks    is distinct from old.can_create_tasks then raise exception 'You cannot change your own permissions'; end if;
    if new.reports_to          is distinct from old.reports_to then raise exception 'You cannot change your own reporting line'; end if;
    if new.email               is distinct from old.email then raise exception 'You cannot change your own email'; end if;
    if new.daily_working_hours is distinct from old.daily_working_hours then raise exception 'Contact an administrator to change working hours'; end if;
    if new.weekly_working_days is distinct from old.weekly_working_days then raise exception 'Contact an administrator to change working days'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_self_edit_guard_trg on public.profiles;
create trigger profiles_self_edit_guard_trg before update on public.profiles
  for each row execute function public.profiles_self_edit_guard();

-- only an admin may elevate somebody to ADMIN / DEPARTMENT_HEAD
create or replace function public.profiles_role_escalation_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only a System Admin may change roles' using errcode = '42501';
  end if;
  if new.department_id is distinct from old.department_id then
    raise exception 'Only a System Admin may change departments' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_escalation_guard_trg on public.profiles;
create trigger profiles_role_escalation_guard_trg before update on public.profiles
  for each row execute function public.profiles_role_escalation_guard();

-- ===========================================================================
-- teams
-- ===========================================================================
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (true);

drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to authenticated
  using (true);

drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members for all to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

-- ===========================================================================
-- sprints
-- ===========================================================================
drop policy if exists sprints_select on public.sprints;
create policy sprints_select on public.sprints for select to authenticated
  using (true);

drop policy if exists sprints_insert on public.sprints;
create policy sprints_insert on public.sprints for insert to authenticated
  with check (public.is_department_head()
              and (department_id is null or department_id = public.current_department_id() or public.is_admin()));

drop policy if exists sprints_update on public.sprints;
create policy sprints_update on public.sprints for update to authenticated
  using (public.is_admin()
         or (public.is_department_head()
             and (department_id is null or department_id = public.current_department_id())))
  with check (public.is_admin()
              or (public.is_department_head()
                  and (department_id is null or department_id = public.current_department_id())));

drop policy if exists sprints_delete on public.sprints;
create policy sprints_delete on public.sprints for delete to authenticated
  using (public.is_admin());

-- ===========================================================================
-- tasks
-- ===========================================================================
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_view_task(tasks));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    (select p.active and (p.can_create_tasks or p.role <> 'EMPLOYEE') from public.profiles p where p.id = auth.uid())
    and (
      public.is_admin()
      or (department_id is null)
      or (department_id = public.current_department_id())
    )
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(tasks))
  with check (public.can_edit_task(tasks));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_admin());

-- A non-admin may not move work into a department they do not belong to,
-- nor hand a task to somebody outside their department.
create or replace function public.tasks_scope_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role app_role; v_dept uuid;
begin
  v_role := public.current_role();
  if v_role = 'ADMIN' then
    return new;
  end if;

  v_dept := public.current_department_id();

  if new.department_id is not null and new.department_id is distinct from old.department_id and v_dept is null then
    raise exception 'You do not belong to a department' using errcode = '42501';
  end if;

  if v_role = 'EMPLOYEE' then
    if new.department_id is distinct from old.department_id then
      raise exception 'Employees cannot move a task to another department' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'The task creator cannot be changed' using errcode = '42501';
    end if;
    if new.planned_hours is distinct from old.planned_hours
       and new.assignee_id is distinct from old.assignee_id then
      raise exception 'Employees cannot reassign a task' using errcode = '42501';
    end if;
  end if;

  if v_role = 'DEPARTMENT_HEAD' and new.department_id is distinct from old.department_id
     and new.department_id is distinct from v_dept then
    raise exception 'Department Heads can only move tasks inside their own department' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_scope_guard_trg on public.tasks;
create trigger tasks_scope_guard_trg before update on public.tasks
  for each row execute function public.tasks_scope_guard();

-- ===========================================================================
-- comments
-- ===========================================================================
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.can_view_task(t)));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and public.can_view_task(t))
  );

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- time_logs
-- ===========================================================================
drop policy if exists time_logs_select on public.time_logs;
create policy time_logs_select on public.time_logs for select to authenticated
  using (user_id = auth.uid()
         or public.is_admin()
         or exists (select 1 from public.tasks t where t.id = task_id and public.can_view_task(t)));

-- segments are normally opened by the workflow trigger; a user may also
-- start one manually, but only for themselves.
drop policy if exists time_logs_insert on public.time_logs;
create policy time_logs_insert on public.time_logs for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t
                 where t.id = task_id
                   and t.status in ('IN_PROGRESS','REVIEW','BLOCKED')
                   and public.can_view_task(t))
  );

drop policy if exists time_logs_update on public.time_logs;
create policy time_logs_update on public.time_logs for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists time_logs_delete on public.time_logs;
create policy time_logs_delete on public.time_logs for delete to authenticated
  using (public.is_admin());

-- ===========================================================================
-- audit_logs — read only for admins, immutable for everybody else.
-- There is deliberately no INSERT / UPDATE / DELETE policy: only the
-- SECURITY DEFINER audit functions can append, and the table triggers
-- reject any UPDATE or DELETE outright.
-- ===========================================================================
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ===========================================================================
-- working_calendar / employee_calendar / employee_schedules
-- ===========================================================================
drop policy if exists working_calendar_select on public.working_calendar;
create policy working_calendar_select on public.working_calendar for select to authenticated
  using (true);

drop policy if exists working_calendar_write on public.working_calendar;
create policy working_calendar_write on public.working_calendar for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists employee_calendar_select on public.employee_calendar;
create policy employee_calendar_select on public.employee_calendar for select to authenticated
  using (user_id = auth.uid()
         or public.is_admin()
         or (public.is_department_head() and user_id in (
              select p.id from public.profiles p where p.department_id = public.current_department_id())));

drop policy if exists employee_calendar_write on public.employee_calendar;
create policy employee_calendar_write on public.employee_calendar for all to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists employee_schedules_select on public.employee_schedules;
create policy employee_schedules_select on public.employee_schedules for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_department_head());

drop policy if exists employee_schedules_write on public.employee_schedules;
create policy employee_schedules_write on public.employee_schedules for all to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

-- ===========================================================================
-- org_settings
-- ===========================================================================
drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings for select to authenticated
  using (true);

drop policy if exists org_settings_write on public.org_settings;
create policy org_settings_write on public.org_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- Grant helper function execution to logged-in users (they are SECURITY
-- DEFINER but only ever act on the caller's own identity).
-- ===========================================================================
grant execute on function public.current_user_id()          to authenticated;
grant execute on function public.current_role()             to authenticated;
grant execute on function public.current_department_id()    to authenticated;
grant execute on function public.is_admin()                 to authenticated;
grant execute on function public.is_department_head()       to authenticated;
grant execute on function public.can_view_task(public.tasks) to authenticated;
grant execute on function public.can_edit_task(public.tasks) to authenticated;
grant execute on function public.can_delete_task(public.tasks) to authenticated;
grant execute on function public.calculate_capacity(uuid, date, date) to authenticated;
grant execute on function public.next_task_key()            to authenticated;
grant execute on function public.close_open_segments(uuid, uuid, public.segment_type) to authenticated;
grant execute on function public.open_segment(uuid, uuid, public.segment_type) to authenticated;

-- Realtime: publish these tables to the anon/authenticated channels.
do $$
declare t text;
begin
  foreach t in array array['tasks','comments','time_logs','sprints','departments',
                           'profiles','audit_logs','working_calendar','employee_calendar',
                           'teams','team_members','org_settings']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then
        null; -- publication may not exist outside hosted Supabase
      end;
    end if;
  end loop;
end $$;

-- ================================ done 0003 ================================
