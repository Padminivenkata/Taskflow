import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || fallback
}

/** Stable colour per person so avatars stay recognisable across the app. */
const AVATAR_COLORS = [
  'bg-rose-500/20 text-rose-300',
  'bg-orange-500/20 text-orange-300',
  'bg-amber-500/20 text-amber-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-teal-500/20 text-teal-300',
  'bg-sky-500/20 text-sky-300',
  'bg-blue-500/20 text-blue-300',
  'bg-indigo-500/20 text-indigo-300',
  'bg-violet-500/20 text-violet-300',
  'bg-fuchsia-500/20 text-fuchsia-300',
  'bg-pink-500/20 text-pink-300',
  'bg-lime-500/20 text-lime-300',
]

export function avatarColor(seed: string | null | undefined): string {
  if (!seed) return 'bg-surface-400 text-slate-300'
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function formatDate(value: string | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!value) return '—'
  const d = parseISO(value)
  return isValid(d) ? format(d, pattern) : '—'
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, 'dd MMM yyyy, HH:mm')
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = parseISO(value)
  if (!isValid(d)) return '—'
  return `${formatDistanceToNowStrict(d)} ago`
}

export function toISODate(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const d = typeof value === 'string' ? parseISO(value) : new Date(value)
  return isValid(d) ? format(d, 'yyyy-MM-dd') : null
}

export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false
  if (status === 'DONE') return false
  const today = toISODate(new Date())
  return today !== null && dueDate < today
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a))
}

/** Aging = how long a task has been alive (open) or took (done). */
export function agingDays(task: {
  created_at: string
  completed_at: string | null
  started_at: string | null
  status: string
}): number {
  const end = task.completed_at ? parseISO(task.completed_at) : new Date()
  return Math.max(0, differenceInCalendarDays(end, parseISO(task.created_at)))
}

/** Cycle time = first start -> completion, or still running. */
export function cycleTimeDays(task: { started_at: string | null; completed_at: string | null }): number | null {
  if (!task.started_at) return null
  const end = task.completed_at ? parseISO(task.completed_at) : new Date()
  return Math.max(0, differenceInCalendarDays(end, parseISO(task.started_at)))
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0h'
  const n = Number(value)
  if (!Number.isFinite(n)) return '0h'
  if (n === 0) return '0h'
  if (n < 1) return `${Math.round(n * 60)}m`
  return `${Number(n.toFixed(1))}h`
}

export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

export function startOfWeekIso(date: Date = new Date()): string {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return format(d, 'yyyy-MM-dd')
}

export function endOfWeekIso(date: Date = new Date()): string {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() + (6 - day))
  d.setHours(23, 59, 59, 999)
  return format(d, 'yyyy-MM-dd')
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return format(d, 'yyyy-MM-dd')
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
