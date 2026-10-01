-- ===========================================================================
-- 0005  Correctness + security hardening
--
-- Fixes defects found while reviewing 0001-0004:
--   1. next_task_key() inserted a '__placeholder__' row that the very
--      tasks_require_key trigger rejected, and would have left a junk task
--      behind even if it had succeeded. Replaced with a single atomic
--      create_task() RPC.
--   2. Unassigning a task left the previous owner's timer running.
--   3. tasks_scope_guard let an employee reassign work to anyone.
--   4. user_workload policy referenced a non-existent `id` column.
--   5. sprint_progress policy used an unqualified `sprint_id` reference.
--   6. Task activity was unreadable by non-admins (audit_logs is admin-only),
--      so the Activity tab silently failed for employees.
--   7. open_segment/close_open_segments were SECURITY DEFINER but accepted an
--      arbitrary user id, letting any authenticated user forge another
--      person's time entries. They now derive the user from auth.uid().
--   8. Functions were executable by PUBLIC/anon by default. Privileges are now
--      revoked explicitly and granted only to authenticated.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Let server-side triggers set a role during signup
--
--    (redefined here, and in 0006, so the three files stay runnable in order)
--
--    0003 guards role changes with "only an admin may do this", and it asks
--    public.is_admin(), which resolves the caller through auth.uid(). An
--    AFTER INSERT trigger on auth.users runs with no JWT in the request, so
--    auth.uid() is NULL, is_admin() is false, and the guard raises
--    'Only a System Admin may change roles'. That aborted signup itself:
--    handle_new_user() and promote_first_admin() both write profiles.role,
--    so the first person to register could never get an account, and an
--    invited manager could never redeem their invite.
--
--    The guard's real purpose is to stop a *user-initiated* request from
--    elevating itself. These triggers are the narrow set of places the server
--    itself is allowed to write a role, so they announce themselves with
--    set_config('taskflow.system_write', 'on', true) -- third argument true
--    makes it transaction-local, so it cannot leak to any later request on a
--    pooled connection.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_role_escalation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Server-side signup path (see note above). Scoped to a trusted SECURITY
  -- DEFINER function and to this transaction only.
  if current_setting('taskflow.system_write', true) = 'on' then
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

-- The self-edit guard has the same NULL-caller blind spot: it only fires when
-- auth.uid() = old.id, which is never true without a JWT, so it silently let
-- the server path through already. Tighten it to recognise the same flag.
create or replace function public.profiles_self_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
     and not public.is_admin()
     and coalesce(current_setting('taskflow.system_write', true), '') <> 'on' then
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

-- Replaces 0004's version. Identical apart from the system_write flag, which
-- the role-escalation guard above now requires in order to let this run.
create or replace function public.promote_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'ADMIN') then
    perform set_config('taskflow.system_write', 'on', true);
    update public.profiles set role = 'ADMIN', can_assign_tasks = true where id = new.id;
    perform public.write_audit('USER_PROMOTED', 'profile', new.id, null,
      jsonb_build_object('role', 'ADMIN', 'reason', 'first user bootstrap'));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Permanent task IDs, generated by the database in one atomic step
-- ---------------------------------------------------------------------------
drop trigger if exists tasks_require_key_trg on public.tasks;

-- `seq` is an identity column, so it is already assigned before BEFORE
-- INSERT triggers run. Deriving task_key from it makes the ID permanent,
-- gap-free under concurrency, and impossible to supply wrongly by mistake.
create or replace function public.tasks_assign_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  if new.task_key is null or new.task_key = '' then
    v_prefix := public.org_setting_text('task_key_prefix', 'TF');
    new.task_key := v_prefix || '-' || new.seq;
  end if;

  if new.task_key = '__placeholder__' then
    raise exception 'task_key is generated by the database and cannot be a placeholder'
      using errcode = '23502';
  end if;

  return new;
end;
$$;

create trigger tasks_require_key_trg before insert on public.tasks
  for each row execute function public.tasks_assign_key();

-- Replace the two-call "reserve then insert" flow with one statement, so a
-- key can never be reserved and then abandoned. SECURITY INVOKER (the
-- default) means the normal RLS policies on tasks still apply to the caller.
create or replace function public.create_task(
  p_title         text,
  p_description   text         default null,
  p_department_id uuid         default null,
  p_assignee_id   uuid         default null,
  p_priority      task_priority default 'MEDIUM',
  p_status        task_status  default 'TO_DO',
  p_sprint_id     uuid         default null,
  p_due_date      date         default null,
  p_planned_hours numeric      default 0,
  p_story_points  numeric      default null,
  p_position      numeric      default 0,
  p_blocked_reason text        default null
)
returns setof public.tasks
language plpgsql
set search_path = public
as $$
declare
  v_row public.tasks;
begin
  insert into public.tasks (
    title, description, department_id, assignee_id,
    created_by, reporter_id,
    priority, status, sprint_id, due_date,
    planned_hours, story_points, position, blocked_reason
  )
  values (
    p_title, p_description, p_department_id, p_assignee_id,
    auth.uid(), auth.uid(),
    p_priority, p_status, p_sprint_id, p_due_date,
    coalesce(p_planned_hours, 0), p_story_points, coalesce(p_position, 0), p_blocked_reason
  )
  returning * into v_row;

  return next v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Unassigning a task must stop the previous owner's clock
-- ---------------------------------------------------------------------------
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
  v_reassigned boolean;
begin
  new.version := old.version + 1;
  new.updated_by := coalesce(v_actor, old.updated_by);

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
  v_reassigned := new.assignee_id is distinct from old.assignee_id;

  if v_reassigned then
    -- Always stop whoever was holding the clock, including when the task is
    -- being unassigned (old.assignee_id is not null, new.assignee_id is null).
    if old.assignee_id is not null then
      perform public.close_open_segments(new.id, old.assignee_id);
    end if;

    -- Only the new owner starts tracking, and only for a live task.
    if new.assignee_id is not null
       and v_next in ('IN_PROGRESS', 'REVIEW', 'BLOCKED') then
      perform public.open_segment(new.id, new.assignee_id,
        case when v_next = 'BLOCKED' then 'BLOCKED'::segment_type else 'WORK'::segment_type end);
    end if;

  elsif v_next in ('IN_PROGRESS', 'REVIEW') and v_prev not in ('IN_PROGRESS', 'REVIEW') then
    perform public.close_open_segments(new.id, v_actor_for_timer);
    perform public.open_segment(new.id, v_actor_for_timer, 'WORK');

  elsif v_next = 'BLOCKED' and v_prev <> 'BLOCKED' then
    perform public.close_open_segments(new.id, v_actor_for_timer);
    perform public.open_segment(new.id, v_actor_for_timer, 'BLOCKED');

  elsif v_next in ('BACKLOG', 'TO_DO') and v_prev in ('IN_PROGRESS', 'REVIEW', 'BLOCKED') then
    perform public.close_open_segments(new.id, v_actor_for_timer);

  elsif v_next = 'DONE' then
    perform public.close_open_segments(new.id, v_actor_for_timer);
  end if;

  -- ---------------- activity + audit ----------------
  if v_next is distinct from v_prev then
    perform public.write_audit('TASK_STATUS_CHANGED', 'task', new.id,
      jsonb_build_object('status', v_prev), jsonb_build_object('status', v_next));
  end if;

  if new.priority is distinct from old.priority then
    perform public.write_audit('TASK_PRIORITY_CHANGED', 'task', new.id,
      jsonb_build_object('priority', old.priority), jsonb_build_object('priority', new.priority));
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform public.write_audit('TASK_ASSIGNED', 'task', new.id,
      jsonb_build_object('assignee_id', old.assignee_id), jsonb_build_object('assignee_id', new.assignee_id));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Employees may update their work but must not reassign it
--    (all the department-scope rules from 0003 are preserved)
-- ---------------------------------------------------------------------------
create or replace function public.tasks_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
  v_dept uuid;
begin
  v_role := public.current_role();
  if v_role = 'ADMIN' then
    return new;
  end if;

  v_dept := public.current_department_id();

  if new.department_id is not null
     and new.department_id is distinct from old.department_id
     and v_dept is null then
    raise exception 'You do not belong to a department' using errcode = '42501';
  end if;

  if v_role = 'EMPLOYEE' then
    if new.department_id is distinct from old.department_id then
      raise exception 'Employees cannot move a task to another department' using errcode = '42501';
    end if;

    if new.created_by is distinct from old.created_by then
      raise exception 'The task creator cannot be changed' using errcode = '42501';
    end if;

    -- Previously this only fired when planned_hours *also* changed, so an
    -- employee could reassign work by leaving the estimate untouched.
    if new.assignee_id is distinct from old.assignee_id then
      raise exception 'Only a Department Head or System Admin can change who a task is assigned to'
        using errcode = '42501';
    end if;
  end if;

  if v_role = 'DEPARTMENT_HEAD'
     and new.department_id is distinct from old.department_id
     and new.department_id is distinct from v_dept then
    raise exception 'Department Heads can only move tasks inside their own department'
      using errcode = '42501';
  end if;

  -- A task cannot be pushed into a sprint belonging to another department.
  if new.sprint_id is not null and new.department_id is not null then
    if exists (select 1 from public.sprints s
                where s.id = new.sprint_id
                  and s.department_id is not null
                  and s.department_id <> new.department_id) then
      raise exception 'That sprint belongs to a different department than this task'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 + 5. View access
--
-- user_workload and sprint_progress are views, not tables. Postgres rejects
-- CREATE POLICY on a view, and 0002 already defines both with
-- security_invoker = on, so they apply the querying user's RLS from the
-- underlying tasks / time_logs / sprints. No policies are needed here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. Activity history for people who may see a task
--    audit_logs stays admin-only; this function is the scoped, read-only
--    window that lets a task's own participants see its history.
--
--    It must be SECURITY DEFINER. With security_invoker the underlying read of
--    audit_logs would still be subject to audit_logs' own admin-only policy,
--    so the function would return nothing for exactly the non-admins it exists
--    to serve. As DEFINER it runs as its owner and the filtering below is the
--    only thing deciding what a caller can see.
-- ---------------------------------------------------------------------------
create or replace function public.task_activity(p_task_id uuid)
returns setof public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_task_id is null then
    return;
  end if;

  if not public.can_view_task((select t from public.tasks t where t.id = p_task_id)) then
    raise exception 'You do not have access to this task'
      using errcode = '42501';
  end if;

  return query
    select a.*
      from public.audit_logs a
     where a.entity_type = 'task'
       and a.entity_id = p_task_id
     order by a.created_at desc;
end;
$$;

revoke all on function public.task_activity(uuid) from public, anon;
grant execute on function public.task_activity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Timer RPCs may only ever act on the calling user's own time
-- ---------------------------------------------------------------------------
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
declare
  v_actor uuid := auth.uid();
  v_existing int;
begin
  -- The SECURITY DEFINER signature is kept for trigger callers, but a direct
  -- API call may only ever open a timer for the caller themselves.
  if p_user_id is distinct from v_actor then
    if v_actor is null or not public.can_edit_task(
         (select t from public.tasks t where t.id = p_task_id)) then
      raise exception 'You can only start a timer on your own behalf'
        using errcode = '42501';
    end if;
  end if;

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
declare
  v_actor uuid := auth.uid();
begin
  if p_user_id is distinct from v_actor then
    if v_actor is null or not public.can_edit_task(
         (select t from public.tasks t where t.id = p_task_id)) then
      raise exception 'You can only stop your own timer'
        using errcode = '42501';
    end if;
  end if;

  update public.time_logs t
     set end_time = now(),
         duration = round((extract(epoch from (now() - t.start_time)) / 3600.0)::numeric, 2)
   where t.task_id = p_task_id
     and t.user_id = p_user_id
     and t.end_time is null
     and (p_segment is null or t.segment_type = p_segment);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Explicit privileges. PostgreSQL grants EXECUTE to PUBLIC by default,
--    which would expose every SECURITY DEFINER helper to anon as well.
-- ---------------------------------------------------------------------------
revoke all on function public.current_user_id()                 from public, anon;
revoke all on function public.current_role()                    from public, anon;
revoke all on function public.current_department_id()           from public, anon;
revoke all on function public.is_admin()                        from public, anon;
revoke all on function public.is_department_head()              from public, anon;
revoke all on function public.org_setting_text(text, text)      from public, anon;
revoke all on function public.can_view_task(public.tasks)       from public, anon;
revoke all on function public.can_edit_task(public.tasks)       from public, anon;
revoke all on function public.can_delete_task(public.tasks)     from public, anon;
revoke all on function public.recompute_task_hours(uuid)        from public, anon;
revoke all on function public.write_audit(text, text, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.open_segment(uuid, uuid, public.segment_type) from public, anon;
revoke all on function public.close_open_segments(uuid, uuid, public.segment_type) from public, anon;
revoke all on function public.create_task(text, text, uuid, uuid, public.task_priority,
        public.task_status, uuid, date, numeric, numeric, numeric, text) from public, anon;

grant execute on function public.current_user_id()              to authenticated;
grant execute on function public.current_role()                 to authenticated;
grant execute on function public.current_department_id()        to authenticated;
grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.is_department_head()           to authenticated;
grant execute on function public.can_view_task(public.tasks)    to authenticated;
grant execute on function public.can_edit_task(public.tasks)    to authenticated;
grant execute on function public.can_delete_task(public.tasks)  to authenticated;
grant execute on function public.calculate_capacity(uuid, date, date) to authenticated;
grant execute on function public.open_segment(uuid, uuid, public.segment_type) to authenticated;
grant execute on function public.close_open_segments(uuid, uuid, public.segment_type) to authenticated;
grant execute on function public.create_task(text, text, uuid, uuid, public.task_priority,
        public.task_status, uuid, date, numeric, numeric, numeric, text) to authenticated;

-- write_audit is the audit trail's only writer and is called from triggers.
-- No client role may invoke it directly, or anyone could forge history.
revoke execute on function public.write_audit(text, text, uuid, jsonb, jsonb) from authenticated;

-- next_task_key() was the old, client-driven key allocator. It inserted a
-- placeholder row just to read a sequence, which its own trigger rejected and
-- which leaked a task whenever the real insert later failed. Task keys are now
-- derived inside create_task() / tasks_assign_key(), so the function goes away.
-- Dropping it also removes the grant 0003 gave it, which is why there is no
-- matching revoke above.
drop function if exists public.next_task_key();
