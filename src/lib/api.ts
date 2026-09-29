import { supabase, describeError } from '@/lib/supabase'
import type { Database } from '@/types/database.generated'
import type {
  AuditLog,
  Department,
  PendingInvite,
  Profile,
  Sprint,
  Task,
  TaskComment,
  TaskFilters,
  TaskStatus,
  TimeLog,
  UserWorkload,
} from '@/types/database'

type Tables = Database['public']['Tables']
type UpdateOf<T extends keyof Tables> = Tables[T]['Update']
type InsertOf<T extends keyof Tables> = Tables[T]['Insert']

/** Thrown so the UI can show an exact, human message. */
export class DataError extends Error {
  cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'DataError'
    this.cause = cause
  }
}

/** Supabase builders are thenables, not Promises — accept both. */
async function run<T>(
  op: () => PromiseLike<{ data: T | null; error: unknown }>,
  context: string,
): Promise<T> {
  const { data, error } = await op()
  if (error) throw new DataError(describeError(error, `Could not ${context}.`), error)
  return data as T
}

// ===========================================================================
// Reference data
// ===========================================================================

export const api = {
  // -----------------------------------------------------------------------
  // Departments
  // -----------------------------------------------------------------------
  async listDepartments(): Promise<Department[]> {
    return run(
      () => supabase.from('departments').select('*').order('name'),
      'load departments',
    )
  },

  async createDepartment(input: InsertOf<'departments'>): Promise<Department> {
    return run(
      () => supabase.from('departments').insert(input).select('*').single(),
      'create the department',
    )
  },

  async updateDepartment(id: string, patch: UpdateOf<'departments'>): Promise<Department> {
    return run(
      () => supabase.from('departments').update(patch).eq('id', id).select('*').single(),
      'update the department',
    )
  },

  async deleteDepartment(id: string): Promise<void> {
    await run(
      async () => ({ data: null, error: (await supabase.from('departments').delete().eq('id', id)).error }),
      'delete the department',
    )
  },

  // -----------------------------------------------------------------------
  // Profiles
  // -----------------------------------------------------------------------
  async listProfiles(): Promise<Profile[]> {
    return run(
      () => supabase.from('profiles').select('*').order('name'),
      'load team members',
    )
  },

  async getProfile(id: string): Promise<Profile> {
    return run(() => supabase.from('profiles').select('*').eq('id', id).single(), 'load the profile')
  },

  async updateProfile(id: string, patch: UpdateOf<'profiles'>): Promise<Profile> {
    return run(
      () => supabase.from('profiles').update(patch).eq('id', id).select('*').single(),
      'save the profile',
    )
  },

  async touchLastSeen(id: string): Promise<void> {
    // never block the UI on this; failures are non fatal
    try {
      await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', id)
    } catch {
      /* ignore */
    }
  },

  // -----------------------------------------------------------------------
  // Tasks
  // -----------------------------------------------------------------------
  async listTasks(): Promise<Task[]> {
    return run(
      () => supabase.from('tasks').select('*').order('position').order('created_at', { ascending: false }),
      'load tasks',
    )
  },

  async getTask(id: string): Promise<Task> {
    return run(() => supabase.from('tasks').select('*').eq('id', id).single(), 'load the task')
  },

  /**
   * Creation is a single server-side statement so the permanent task ID
   * (TF-1042) is generated and consumed atomically. The client never supplies
   * or reserves a key, so a failed save can never burn an ID.
   */
  async createTask(input: {
    title: string
    description?: string | null
    department_id?: string | null
    assignee_id?: string | null
    priority?: Task['priority']
    status?: TaskStatus
    sprint_id?: string | null
    due_date?: string | null
    planned_hours?: number
    story_points?: number | null
    position?: number
    blocked_reason?: string | null
  }): Promise<Task> {
    const rows = await run(
      () =>
        supabase.rpc('create_task', {
          p_title: input.title,
          p_description: input.description ?? null,
          p_department_id: input.department_id ?? null,
          p_assignee_id: input.assignee_id ?? null,
          p_priority: input.priority ?? 'MEDIUM',
          p_status: input.status ?? 'TO_DO',
          p_sprint_id: input.sprint_id ?? null,
          p_due_date: input.due_date ?? null,
          p_planned_hours: input.planned_hours ?? 0,
          p_story_points: input.story_points ?? null,
          p_position: input.position ?? 0,
          p_blocked_reason: input.blocked_reason ?? null,
        }),
      'create the task',
    )
    const created = rows[0]
    if (!created) throw new DataError('The task was not created. Please try again.')
    return created
  },

  /**
   * Optimistic-concurrency update. The `version` guard means a stale browser tab
   * can never silently overwrite a newer server state — the update matches zero
   * rows and we surface a "someone else changed this" message.
   */
  async updateTask(
    id: string,
    patch: UpdateOf<'tasks'>,
    expectedVersion?: number,
  ): Promise<Task> {
    let query = supabase.from('tasks').update(patch).eq('id', id)
    if (typeof expectedVersion === 'number') {
      query = query.eq('version', expectedVersion)
    }
    const { data, error } = await query.select('*').maybeSingle()
    if (error) throw new DataError(describeError(error, 'Could not save the task.'), error)
    if (!data) {
      throw new DataError(
        'This task was changed by someone else while you were editing. Your screen has been refreshed with the latest data — please reapply your change.',
      )
    }
    return data
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw new DataError(describeError(error, 'Could not delete the task.'), error)
  },

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------
  async listComments(taskIds: string[]): Promise<TaskComment[]> {
    if (taskIds.length === 0) return []
    return run(
      () => supabase.from('comments').select('*').in('task_id', taskIds).order('created_at'),
      'load comments',
    )
  },

  async addComment(taskId: string, userId: string, comment: string) {
    return run(
      () => supabase.from('comments').insert({ task_id: taskId, user_id: userId, comment }).select('*').single(),
      'post the comment',
    )
  },

  async updateComment(id: string, comment: string) {
    return run(
      () => supabase.from('comments').update({ comment }).eq('id', id).select('*').single(),
      'update the comment',
    )
  },

  async deleteComment(id: string): Promise<void> {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) throw new DataError(describeError(error, 'Could not delete the comment.'), error)
  },

  // -----------------------------------------------------------------------
  // Time logs
  // -----------------------------------------------------------------------
  async listTimeLogs(taskIds: string[]): Promise<TimeLog[]> {
    if (taskIds.length === 0) return []
    return run(
      () => supabase.from('time_logs').select('*').in('task_id', taskIds).order('start_time', { ascending: false }),
      'load time logs',
    )
  },

  async listActiveTimeLogs(): Promise<import('@/types/database').ActiveTimeLog[]> {
    return run(() => supabase.from('active_time_logs').select('*'), 'load running timers')
  },

  async startTimer(taskId: string, userId: string, segmentType: 'WORK' | 'BLOCKED' = 'WORK'): Promise<void> {
    await run(
      async () => ({
        data: null,
        error: (
          await supabase.rpc('open_segment', {
            p_task_id: taskId,
            p_user_id: userId,
            p_segment: segmentType,
          })
        ).error,
      }),
      'start the timer',
    )
  },

  async stopTimer(taskId: string, userId: string): Promise<void> {
    await run(
      async () => ({
        data: null,
        error: (
          await supabase.rpc('close_open_segments', {
            p_task_id: taskId,
            p_user_id: userId,
            p_segment: 'WORK',
          })
        ).error,
      }),
      'stop the timer',
    )
  },

  // -----------------------------------------------------------------------
  // Sprints
  // -----------------------------------------------------------------------
  async listSprints(): Promise<Sprint[]> {
    return run(() => supabase.from('sprints').select('*').order('created_at', { ascending: false }), 'load sprints')
  },

  async createSprint(input: InsertOf<'sprints'>): Promise<Sprint> {
    return run(() => supabase.from('sprints').insert(input).select('*').single(), 'create the sprint')
  },

  async updateSprint(id: string, patch: UpdateOf<'sprints'>): Promise<Sprint> {
    return run(
      () => supabase.from('sprints').update(patch).eq('id', id).select('*').single(),
      'save the sprint',
    )
  },

  async deleteSprint(id: string): Promise<void> {
    const { error } = await supabase.from('sprints').delete().eq('id', id)
    if (error) throw new DataError(describeError(error, 'Could not delete the sprint.'), error)
  },

  async listSprintProgress(): Promise<import('@/types/database').SprintProgress[]> {
    return run(() => supabase.from('sprint_progress').select('*').order('start_date', { ascending: false }), 'load sprint progress')
  },

  // -----------------------------------------------------------------------
  // Calendar
  // -----------------------------------------------------------------------
  async listWorkingCalendar(from: string, to: string): Promise<import('@/types/database').WorkingCalendarDay[]> {
    return run(
      () =>
        supabase
          .from('working_calendar')
          .select('*')
          .gte('calendar_date', from)
          .lte('calendar_date', to)
          .order('calendar_date'),
      'load the working calendar',
    )
  },

  async upsertWorkingDay(calendarDate: string, isWorkingDay: boolean, label?: string | null): Promise<import('@/types/database').WorkingCalendarDay> {
    const { data, error } = await supabase
      .from('working_calendar')
      .upsert(
        { calendar_date: calendarDate, is_working_day: isWorkingDay, label: label ?? null },
        { onConflict: 'calendar_date' },
      )
      .select('*')
      .single()
    if (error) throw new DataError(describeError(error, 'Could not save the calendar day.'), error)
    return data
  },

  async listEmployeeCalendar(from: string, to: string): Promise<import('@/types/database').EmployeeCalendarDay[]> {
    return run(
      () =>
        supabase
          .from('employee_calendar')
          .select('*')
          .gte('calendar_date', from)
          .lte('calendar_date', to)
          .order('calendar_date'),
      'load employee availability',
    )
  },

  async upsertEmployeeDay(input: InsertOf<'employee_calendar'> & { hours?: number | null }) {
    const { data, error } = await supabase
      .from('employee_calendar')
      .upsert(input, { onConflict: 'user_id,calendar_date' })
      .select('*')
      .single()
    if (error) throw new DataError(describeError(error, 'Could not save the availability.'), error)
    return data
  },

  async listSchedules(userId?: string): Promise<import('@/types/database').EmployeeSchedule[]> {
    let q = supabase.from('employee_schedules').select('*').order('weekday')
    if (userId) q = q.eq('user_id', userId)
    return run(() => q, 'load working schedules')
  },

  async upsertSchedule(input: InsertOf<'employee_schedules'>) {
    const { data, error } = await supabase
      .from('employee_schedules')
      .upsert(input, { onConflict: 'user_id,weekday' })
      .select('*')
      .single()
    if (error) throw new DataError(describeError(error, 'Could not save the schedule.'), error)
    return data
  },

  async calculateCapacity(userId: string, from: string, to: string): Promise<import('@/types/database').CapacityResult | null> {
    const { data, error } = await supabase.rpc('calculate_capacity', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
    })
    if (error) throw new DataError(describeError(error, 'Could not calculate capacity.'), error)
    return data?.[0] ?? null
  },

  // -----------------------------------------------------------------------
  // Workload / audit / settings
  // -----------------------------------------------------------------------
  async listUserWorkload(): Promise<UserWorkload[]> {
    return run(() => supabase.from('user_workload').select('*').order('name'), 'load workload')
  },

  async listInvites(): Promise<PendingInvite[]> {
    return run(
      () => supabase.from('pending_invites').select('*').order('created_at', { ascending: false }),
      'load pending invitations',
    )
  },

  async upsertInvite(input: InsertOf<'pending_invites'>) {
    return run(
      () => supabase.from('pending_invites').upsert(input, { onConflict: 'email' }).select('*').single(),
      'save the invitation',
    )
  },

  async deleteInvite(id: string): Promise<void> {
    const { error } = await supabase.from('pending_invites').delete().eq('id', id)
    if (error) throw new DataError(describeError(error, 'Could not remove the invitation.'), error)
  },

  async listAuditLogs(opts: { limit?: number; entityType?: string; entityId?: string } = {}): Promise<AuditLog[]> {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false })
    if (opts.entityType) q = q.eq('entity_type', opts.entityType)
    if (opts.entityId) q = q.eq('entity_id', opts.entityId)
    q = q.limit(opts.limit ?? 200)
    return run(() => q, 'load the audit log')
  },

  /**
   * Activity for a single task. Reads the scoped `task_activity` view rather
   * than `audit_logs`, because the raw trail is admin-only: without this the
   * Activity tab would come back empty for every non-admin participant.
   */
  async listTaskActivity(taskId: string, limit = 300): Promise<AuditLog[]> {
    return run(
      () =>
        supabase
          .from('task_activity')
          .select('*')
          .eq('entity_id', taskId)
          .order('created_at', { ascending: false })
          .limit(limit),
      'load the task activity',
    )
  },

  async listSettings(): Promise<Record<string, unknown>> {
    const rows = await run(() => supabase.from('org_settings').select('*'), 'load system settings')
    const out: Record<string, unknown> = {}
    for (const r of rows) if (r.key) out[r.key] = r.value
    return out
  },

  async updateSetting(key: string, value: unknown) {
    const { data, error } = await supabase
      .from('org_settings')
      .upsert({ key, value }, { onConflict: 'key' })
      .select('*')
      .single()
    if (error) throw new DataError(describeError(error, 'Could not save the setting.'), error)
    return data
  },
}

// ===========================================================================
// Filtering + aggregation — all performed on the rows already fetched from
// PostgreSQL, so behaviour is identical for every user and never drifts
// between clients.
// ===========================================================================
export function applyFilters(tasks: Task[], filters: TaskFilters, today = new Date()): Task[] {
  const todayIso = today.toISOString().slice(0, 10)
  const needle = filters.search.trim().toLowerCase()

  return tasks.filter((t) => {
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false
    if (filters.priorities.length && !filters.priorities.includes(t.priority)) return false
    if (filters.departmentIds.length && !(t.department_id && filters.departmentIds.includes(t.department_id)))
      return false
    if (filters.assigneeIds.length && !(t.assignee_id && filters.assigneeIds.includes(t.assignee_id))) return false
    if (filters.sprintIds.length && !(t.sprint_id && filters.sprintIds.includes(t.sprint_id))) return false
    if (filters.unassignedOnly && t.assignee_id) return false
    if (filters.overdueOnly && !(t.due_date && t.due_date < todayIso && t.status !== 'DONE')) return false

    if (needle) {
      const haystack = [t.task_key, t.title, t.description ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function countBy<T extends string>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, k) => {
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
}
