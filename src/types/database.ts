/** Domain types. These mirror the PostgreSQL schema exactly. */

export type AppRole = 'ADMIN' | 'DEPARTMENT_HEAD' | 'EMPLOYEE'
export type TaskStatus = 'BACKLOG' | 'TO_DO' | 'IN_PROGRESS' | 'REVIEW' | 'BLOCKED' | 'DONE'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED'
export type SegmentType = 'WORK' | 'BLOCKED'

export interface Profile {
  id: string
  name: string
  email: string
  role: AppRole
  department_id: string | null
  job_title: string | null
  avatar_url: string | null
  phone: string | null
  daily_working_hours: number
  weekly_working_days: number
  can_create_tasks: boolean
  can_assign_tasks: boolean
  reports_to: string | null
  active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  name: string
  code: string | null
  description: string | null
  head_user_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Sprint {
  id: string
  name: string
  goal: string | null
  start_date: string | null
  end_date: string | null
  status: SprintStatus
  department_id: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface SprintProgress {
  sprint_id: string
  sprint_name: string
  sprint_status: SprintStatus
  start_date: string | null
  end_date: string | null
  department_id: string | null
  total_tasks: number
  done_tasks: number
  blocked_tasks: number
  planned_hours: number
  actual_hours: number
}

export interface Task {
  id: string
  task_key: string
  seq: number
  title: string
  description: string | null
  department_id: string | null
  assignee_id: string | null
  created_by: string | null
  reporter_id: string | null
  priority: TaskPriority
  status: TaskStatus
  sprint_id: string | null
  due_date: string | null
  planned_hours: number
  actual_hours: number
  blocked_hours: number
  position: number
  story_points: number | null
  blocked_reason: string | null
  started_at: string | null
  completed_at: string | null
  version: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  comment: string
  created_at: string
  updated_at: string
}

export interface TimeLog {
  id: string
  task_id: string
  user_id: string
  start_time: string
  end_time: string | null
  duration: number
  segment_type: SegmentType
  source: string
  created_at: string
}

export interface ActiveTimeLog extends TimeLog {
  elapsed_hours: number
  task_key: string
  task_title: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/** An onboarding invitation whose role/department is applied at sign-up. */
export interface PendingInvite {
  id: string
  email: string
  full_name: string | null
  role: AppRole
  department_id: string | null
  invited_by: string | null
  accepted_at: string | null
  created_at: string
}

export interface WorkingCalendarDay {
  id: string
  calendar_date: string
  is_working_day: boolean
  label: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeCalendarDay {
  id: string
  user_id: string
  calendar_date: string
  is_available: boolean
  hours: number | null
  reason: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeSchedule {
  id: string
  user_id: string
  weekday: number
  is_working: boolean
  hours: number
}

export interface UserWorkload {
  user_id: string
  name: string
  email: string
  department_id: string | null
  daily_working_hours: number
  weekly_working_days: number
  active: boolean
  role: AppRole
  active_tasks: number
  blocked_tasks: number
  overdue_tasks: number
  open_tasks: number
  planned_hours: number
  actual_hours: number
}

export interface Team {
  id: string
  name: string
  department_id: string | null
  lead_user_id: string | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  created_at: string
}

/** A task joined with the display data the board needs. */
export interface TaskView extends Task {
  assignee: Profile | null
  creator: Profile | null
  department: Department | null
  sprint: Sprint | null
  comment_count?: number
  active_timer?: { user_id: string; elapsed_hours: number; segment_type: SegmentType } | null
}

export interface CapacityResult {
  user_id: string
  from_date: string
  to_date: string
  working_days: number
  daily_hours: number
  capacity_hours: number
}

export interface TaskFilters {
  search: string
  departmentIds: string[]
  assigneeIds: string[]
  statuses: TaskStatus[]
  priorities: TaskPriority[]
  sprintIds: string[]
  overdueOnly: boolean
  unassignedOnly: boolean
}

export const EMPTY_FILTERS: TaskFilters = {
  search: '',
  departmentIds: [],
  assigneeIds: [],
  statuses: [],
  priorities: [],
  sprintIds: [],
  overdueOnly: false,
  unassignedOnly: false,
}
