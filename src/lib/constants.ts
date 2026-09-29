import type { AppRole, SegmentType, SprintStatus, TaskPriority, TaskStatus } from '@/types/database'

export const APP_NAME = 'Taskflow'

export const TASK_STATUSES: TaskStatus[] = [
  'BACKLOG',
  'TO_DO',
  'IN_PROGRESS',
  'REVIEW',
  'BLOCKED',
  'DONE',
]

export const BOARD_STATUSES: TaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE']

export const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export const SPRINT_STATUSES: SprintStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED']

export const APP_ROLES: AppRole[] = ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE']

export const SEGMENT_TYPES: SegmentType[] = ['WORK', 'BLOCKED']

export const STATUS_META: Record<
  TaskStatus,
  { label: string; short: string; dot: string; chip: string; column: string; accent: string }
> = {
  BACKLOG: {
    label: 'Backlog',
    short: 'BLG',
    dot: 'bg-slate-400',
    chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    column: 'from-slate-500/20',
    accent: 'text-slate-300',
  },
  TO_DO: {
    label: 'To Do',
    short: 'TODO',
    dot: 'bg-sky-400',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    column: 'from-sky-500/20',
    accent: 'text-sky-300',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    short: 'WIP',
    dot: 'bg-blue-500',
    chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    column: 'from-blue-500/20',
    accent: 'text-blue-300',
  },
  REVIEW: {
    label: 'Review',
    short: 'REV',
    dot: 'bg-violet-400',
    chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    column: 'from-violet-500/20',
    accent: 'text-violet-300',
  },
  BLOCKED: {
    label: 'Blocked',
    short: 'BLK',
    dot: 'bg-rose-500',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    column: 'from-rose-500/20',
    accent: 'text-rose-300',
  },
  DONE: {
    label: 'Done',
    short: 'DON',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    column: 'from-emerald-500/20',
    accent: 'text-emerald-300',
  },
}

export const PRIORITY_META: Record<TaskPriority, { label: string; chip: string; bar: string; rank: number }> = {
  URGENT: { label: 'Urgent', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40', bar: 'bg-rose-500', rank: 0 },
  HIGH: { label: 'High', chip: 'bg-orange-500/15 text-orange-300 border-orange-500/40', bar: 'bg-orange-500', rank: 1 },
  MEDIUM: { label: 'Medium', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40', bar: 'bg-amber-500', rank: 2 },
  LOW: { label: 'Low', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', bar: 'bg-emerald-500', rank: 3 },
}

export const ROLE_META: Record<AppRole, { label: string; chip: string; description: string }> = {
  ADMIN: {
    label: 'System Admin',
    chip: 'bg-brand-500/20 text-brand-300 border-brand-500/40',
    description: 'Full access: users, departments, roles, every task, sprints, audit logs, settings.',
  },
  DEPARTMENT_HEAD: {
    label: 'Department Head',
    chip: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    description: 'Full control of their own department: tasks, assignment, workload, sprint activity.',
  },
  EMPLOYEE: {
    label: 'Employee',
    chip: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    description: 'Works their own tasks: view, update, move through workflow, comment, log time.',
  },
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PASSWORD_RESET_REQUESTED: 'Requested password reset',
  USER_CREATED: 'User created',
  USER_ACTIVATED: 'User activated',
  USER_DEACTIVATED: 'User deactivated',
  USER_PROMOTED: 'User promoted to Admin',
  PERMISSION_CHANGED: 'Role / permission changed',
  DEPARTMENT_CHANGED: 'Department changed',
  DEPARTMENT_CREATED: 'Department created',
  DEPARTMENT_UPDATED: 'Department updated',
  DEPARTMENT_DELETED: 'Department deleted',
  TASK_CREATED: 'Task created',
  TASK_UPDATED: 'Task details updated',
  TASK_STATUS_CHANGED: 'Status changed',
  TASK_ASSIGNEE_CHANGED: 'Assignee changed',
  TASK_PRIORITY_CHANGED: 'Priority changed',
  TASK_SPRINT_CHANGED: 'Sprint changed',
  TASK_DUE_DATE_CHANGED: 'Due date changed',
  TASK_DEPARTMENT_CHANGED: 'Task department changed',
  TASK_COMPLETED: 'Task completed',
  TASK_DELETED: 'Task deleted',
  COMMENT_ADDED: 'Comment added',
  COMMENT_DELETED: 'Comment deleted',
  TIME_TRACKING_STARTED: 'Time tracking started',
  TIME_TRACKING_STOPPED: 'Time tracking stopped',
  SPRINT_CREATED: 'Sprint created',
  SPRINT_STATUS_CHANGED: 'Sprint status changed',
  SPRINT_DATES_CHANGED: 'Sprint dates changed',
  SPRINT_DELETED: 'Sprint deleted',
  SETTINGS_UPDATED: 'System settings updated',
  CALENDAR_UPDATED: 'Working calendar updated',
}

export const TIMINGING_ACTIVITIES = new Set([
  'TASK_STATUS_CHANGED',
  'TASK_ASSIGNEE_CHANGED',
  'TIME_TRACKING_STARTED',
  'TIME_TRACKING_STOPPED',
  'SPRINT_STATUS_CHANGED',
])
