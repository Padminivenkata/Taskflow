import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  MessageSquare,
  Pause,
  Pencil,
  Timer,
  Trash2,
  Plus,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useToast, useConfirm } from '@/context/ToastContext'
import { useTaskActions } from '@/hooks/useTaskActions'
import { api } from '@/lib/api'
import { AUDIT_ACTION_LABELS, PRIORITY_META, STATUS_META, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import { formatDate, formatDateTime, formatHours, formatTimer, relativeTime, titleCase } from '@/lib/format'
import type { AuditLog, TaskPriority, TaskStatus } from '@/types/database'
import { Avatar, Button, Card, Chip, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { TaskFormModal } from '@/components/tasks/TaskFormModal'

type Tab = 'overview' | 'comments' | 'activity' | 'time'

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const { user } = useAuth()
  const {
    tasks,
    comments,
    activeTimeLogs,
    profiles,
    sprints,
    profileById,
    departmentById,
    sprintById,
    loading,
    isEditable,
    isDeletable,
    canAssign,
    refreshTasks,
    refreshAuditLogs,
  } = useData()
  const { patchTask, deleteTask, changeStatus } = useTaskActions()

  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [activity, setActivity] = useState<AuditLog[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [now, setNow] = useState(0)

  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId])

  // ticking clock so live timers advance without a refetch
  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const loadActivity = useCallback(async () => {
    if (!taskId) return
    setActivityLoading(true)
    try {
      const rows = await api.listTaskActivity(taskId)
      setActivity(rows)
    } catch (err) {
      toast.error('Could not load activity', err instanceof Error ? err.message : undefined)
    } finally {
      setActivityLoading(false)
    }
  }, [taskId, toast])

  useEffect(() => {
    if (tab === 'activity') void loadActivity()
  }, [tab, loadActivity])

  const taskComments = useMemo(
    () => comments.filter((c) => c.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [comments, taskId],
  )

  const timer = useMemo(() => activeTimeLogs.find((t) => t.task_id === taskId) ?? null, [activeTimeLogs, taskId])

  const elapsedSeconds = useMemo(() => {
    if (!timer) return 0
    return Math.max(0, Math.floor((now - new Date(timer.start_time).getTime()) / 1000))
  }, [timer, now])

  const activeProfiles = useMemo(() => profiles.filter((p) => p.active), [profiles])
  const openSprints = useMemo(() => sprints.filter((s) => s.status !== 'COMPLETED'), [sprints])

  if (loading && !task) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Task not available"
          description="It may have been deleted, or you may not have permission to view it. Row Level Security blocks access at the database level."
          action={
            <Button onClick={() => navigate('/board')} icon={<ArrowLeft className="h-4 w-4" />}>
              Back to the board
            </Button>
          }
        />
      </div>
    )
  }

  const creator = profileById(task.created_by)
  const reporter = profileById(task.reporter_id)
  const department = departmentById(task.department_id)
  const sprint = sprintById(task.sprint_id)
  const editable = isEditable(task)

  const remaining = Math.max(0, Number(task.planned_hours ?? 0) - Number(task.actual_hours ?? 0))

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !user) return
    setPosting(true)
    try {
      await api.addComment(task.id, user.id, comment.trim())
      setComment('')
      await refreshTasks()
      await refreshAuditLogs()
      toast.success('Comment posted')
    } catch (err) {
      toast.error('Could not post the comment', err instanceof Error ? err.message : undefined)
    } finally {
      setPosting(false)
    }
  }

  const removeComment = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this comment?',
      description: 'The comment will be removed for everyone. The deletion is recorded in the audit log.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await api.deleteComment(id)
      await refreshTasks()
      toast.success('Comment deleted')
    } catch (err) {
      toast.error('Could not delete', err instanceof Error ? err.message : undefined)
    }
  }

  const stopTimer = async () => {
    if (!user) return
    try {
      await api.stopTimer(task.id, user.id)
      await refreshTasks()
      toast.success('Timer stopped', 'Duration saved from the recorded timestamps.')
    } catch (err) {
      toast.error('Could not stop the timer', err instanceof Error ? err.message : undefined)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${task.task_key}?`,
      description: 'This permanently removes the task, its comments and its time logs for every user. This cannot be undone.',
      confirmLabel: 'Delete permanently',
    })
    if (!ok) return
    const done = await deleteTask(task)
    if (done) navigate('/board')
  }

  const TABS: { key: Tab; label: string; icon: typeof ActivityIcon; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: CheckCircle2 },
    { key: 'comments', label: 'Comments', icon: MessageSquare, count: taskComments.length },
    { key: 'activity', label: 'Activity', icon: History },
    { key: 'time', label: 'Time log', icon: Clock3 },
  ]

  return (
    <div className="p-4 sm:p-6">
      {dialog}
      <Link
        to="/board"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to board
      </Link>

      <PageHeader
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-brand-300">{task.task_key}</span>
            <Chip className={STATUS_META[task.status].chip} dot={STATUS_META[task.status].dot}>
              {STATUS_META[task.status].label}
            </Chip>
            <Chip className={PRIORITY_META[task.priority].chip}>{PRIORITY_META[task.priority].label} priority</Chip>
            {editable ? (
              <span className="text-xs text-emerald-400">You can edit this task</span>
            ) : (
              <span className="text-xs text-slate-500">Read only for your role</span>
            )}
          </span>
        }
        actions={
          <>
            {editable && (
              <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {isDeletable(task) && (
              <Button variant="ghost" size="icon" title="Delete task" onClick={() => void remove()}>
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------- */}
        {/* Main column                                                    */}
        {/* ------------------------------------------------------------- */}
        <div className="min-w-0 space-y-4">
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  tab === t.key ? 'bg-surface-300 text-white' : 'text-slate-400 hover:bg-surface-200',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <Card title="Description">
                {task.description ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{task.description}</div>
                ) : (
                  <p className="text-sm italic text-slate-500">No description was provided.</p>
                )}
              </Card>

              <Card title="Workflow">
                <p className="mb-3 text-xs text-slate-500">
                  Moving a task changes the tracked time automatically. Times are always recalculated from the
                  timestamps stored in PostgreSQL.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {TASK_STATUSES.map((s) => {
                    const active = task.status === s
                    return (
                      <button
                        key={s}
                        disabled={!editable || active}
                        onClick={() => void changeStatus(task, s as TaskStatus)}
                        className={clsx(
                          'rounded-lg border px-3 py-2.5 text-left transition',
                          active
                            ? STATUS_META[s].chip
                            : 'border-surface-400 bg-surface-50 text-slate-400 hover:border-surface-500 hover:text-slate-200',
                          !editable && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <span className={clsx('h-1.5 w-1.5 rounded-full', STATUS_META[s].dot)} />
                          {STATUS_META[s].label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            </div>
          )}

          {tab === 'comments' && (
            <Card title={`Comments (${taskComments.length})`}>
              <form onSubmit={postComment} className="mb-4 flex flex-col gap-2 sm:flex-row">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment for the team…"
                  rows={3}
                  className="flex-1"
                  maxLength={4000}
                />
                <Button type="submit" loading={posting} disabled={!comment.trim()} className="self-start sm:self-auto">
                  <Plus className="h-4 w-4" />
                  Post
                </Button>
              </form>

              {taskComments.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No comments yet. Start the conversation.</p>
              ) : (
                <ul className="space-y-3">
                  {taskComments.map((c) => {
                    const author = profileById(c.user_id)
                    const mine = c.user_id === user?.id
                    return (
                      <li key={c.id} className="flex gap-3 rounded-lg border border-surface-300 bg-surface-50 p-3">
                        <Avatar name={author?.name} id={c.user_id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-white">{author?.name ?? 'Unknown user'}</span>
                            <span className="text-[11px] text-slate-500" title={formatDateTime(c.created_at)}>
                              {relativeTime(c.created_at)}
                            </span>
                            {(mine || user?.role === 'ADMIN') && (
                              <button
                                onClick={() => void removeComment(c.id)}
                                className="ml-auto rounded p-1 text-slate-500 transition hover:bg-surface-300 hover:text-rose-400"
                                title="Delete comment"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{c.comment}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === 'activity' && (
            <Card
              title="Activity history"
              description="Append-only. These records cannot be edited or removed by any user, including administrators."
              actions={
                <Button variant="ghost" size="sm" onClick={() => void loadActivity()}>
                  Reload
                </Button>
              }
            >
              {activityLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : !activity || activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No activity recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-surface-300 pl-5">
                  {activity.map((a) => {
                    const actor = profileById(a.user_id)
                    return (
                      <li key={a.id} className="relative">
                        <span
                          className={clsx(
                            'absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface-100',
                            a.action === 'TASK_COMPLETED'
                              ? 'bg-emerald-500'
                              : a.action.includes('BLOCK') || a.action === 'TASK_STATUS_CHANGED'
                                ? 'bg-brand-500'
                                : 'bg-surface-500',
                          )}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {AUDIT_ACTION_LABELS[a.action] ?? titleCase(a.action.toLowerCase())}
                          </span>
                          <span className="text-[11px] text-slate-500" title={formatDateTime(a.created_at)}>
                            {relativeTime(a.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          by {actor?.name ?? 'system'} · {formatDateTime(a.created_at)}
                        </p>
                        <ChangeSummary audit={a} />
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          )}

          {tab === 'time' && <TimeLogPanel taskId={task.id} />}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Sidebar                                                        */}
        {/* ------------------------------------------------------------- */}
        <div className="space-y-4">
          <Card title="Time tracking" padded>
            {timer ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                  <Timer className="h-3.5 w-3.5 animate-pulse" />
                  {timer.segment_type === 'BLOCKED' ? 'Blocked time running' : 'Timer running'}
                </p>
                <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-white">
                  {formatTimer(elapsedSeconds)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Started {formatDateTime(timer.start_time)}</p>
                {timer.user_id === user?.id && editable && (
                  <Button variant="secondary" size="sm" className="mt-3 w-full" icon={<Pause className="h-3.5 w-3.5" />} onClick={() => void stopTimer()}>
                    Stop timer
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs text-slate-500">
                  No timer running. Moving the task to In Progress or Review starts one automatically.
                </p>
              </div>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Planned hours" value={formatHours(task.planned_hours)} />
              <Row label="Actual hours" value={formatHours(task.actual_hours)} strong />
              <Row label="Blocked hours" value={formatHours(task.blocked_hours)} />
              <Row label="Remaining" value={formatHours(remaining)} />
            </dl>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-300">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  Number(task.actual_hours) > Number(task.planned_hours) ? 'bg-rose-500' : 'bg-emerald-500',
                )}
                style={{
                  width: `${Math.min(100, task.planned_hours > 0 ? (task.actual_hours / task.planned_hours) * 100 : 0)}%`,
                }}
              />
            </div>
          </Card>

          <Card title="People">
            <ul className="space-y-3 text-sm">
              <PersonRow label="Assignee" profile={task.assignee_id ? profileById(task.assignee_id) : null} />
              <PersonRow label="Created by" profile={creator} />
              {reporter && reporter.id !== creator?.id && <PersonRow label="Reported by" profile={reporter} />}
            </ul>
            {canAssign && (
              <div className="mt-4 border-t border-surface-300 pt-4">
                <Field label="Reassign to">
                  <Select
                    value={task.assignee_id ?? ''}
                    onChange={(e) => void patchTask(task, { assignee_id: e.target.value || null }, 'Assignee changed')}
                  >
                    <option value="">Unassigned</option>
                    {activeProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </Card>

          <Card title="Details">
            <dl className="space-y-2.5 text-sm">
              <DetailRow icon={<Building2 className="h-4 w-4" />} label="Department" value={department?.name ?? '—'} />
              <DetailRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Sprint"
                value={
                  sprint ? (
                    <Link to="/sprints" className="link">
                      {sprint.name}
                    </Link>
                  ) : (
                    'Not in a sprint'
                  )
                }
              />
              <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Due date" value={formatDate(task.due_date)} />
              <DetailRow icon={<Clock3 className="h-4 w-4" />} label="Story points" value={task.story_points ?? '—'} />
            </dl>

            {editable && (
              <div className="mt-4 space-y-3 border-t border-surface-300 pt-4">
                <Field label="Priority">
                  <Select
                    value={task.priority}
                    onChange={(e) => void patchTask(task, { priority: e.target.value as TaskPriority }, 'Priority updated')}
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sprint">
                  <Select
                    value={task.sprint_id ?? ''}
                    onChange={(e) => void patchTask(task, { sprint_id: e.target.value || null }, 'Sprint updated')}
                    disabled={task.status === 'BACKLOG'}
                  >
                    <option value="">Not in a sprint</option>
                    {openSprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </Card>

          <Card title="Dates">
            <dl className="space-y-2.5 text-sm">
              <Row label="Created" value={formatDateTime(task.created_at)} />
              <Row label="Updated" value={formatDateTime(task.updated_at)} />
              <Row label="Started" value={task.started_at ? formatDateTime(task.started_at) : '—'} />
              <Row label="Completed" value={task.completed_at ? formatDateTime(task.completed_at) : '—'} />
            </dl>
            {editable && (
              <div className="mt-4 border-t border-surface-300 pt-4">
                <Field label="Change due date">
                  <Input
                    type="date"
                    defaultValue={task.due_date ?? ''}
                    onBlur={(e) => {
                      const value = e.target.value || null
                      if (value !== task.due_date) void patchTask(task, { due_date: value }, 'Due date updated')
                    }}
                  />
                </Field>
              </div>
            )}
          </Card>
        </div>
      </div>

      <TaskFormModal open={editOpen} onClose={() => setEditOpen(false)} task={task} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */
function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={clsx('text-sm tabular-nums', strong ? 'font-semibold text-white' : 'text-slate-300')}>{value}</dd>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-500">{icon}</span>
      <dt className="w-24 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-300">{value}</dd>
    </div>
  )
}

function PersonRow({ label, profile }: { label: string; profile: ReturnType<typeof useData>['profiles'][number] | null }) {
  if (!profile) {
    return (
      <li className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-surface-400 text-xs text-slate-500">
          ?
        </span>
        <span className="text-slate-500">{label}: unassigned</span>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={profile.name} id={profile.id} size="md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{profile.name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {label} · {profile.job_title || titleCase(profile.role.toLowerCase())}
        </p>
      </div>
    </li>
  )
}

function ChangeSummary({ audit }: { audit: AuditLog }) {
  const oldVal = audit.old_value ?? {}
  const newVal = audit.new_value ?? {}
  const keys = Object.keys(newVal).filter((k) => !['completed_at'].includes(k))
  if (keys.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {keys.slice(0, 6).map((k) => {
        const before = oldVal[k]
        const after = newVal[k]
        if (before === undefined && typeof after !== 'object') return null
        return (
          <span key={k} className="chip border-surface-400 bg-surface-200 text-slate-400">
            <span className="text-slate-500">{titleCase(k)}:</span>{' '}
            <span className="text-slate-300 line-through opacity-70">{formatAuditValue(before)}</span>{' '}
            <span className="text-slate-500">→</span>{' '}
            <span className="text-slate-200">{formatAuditValue(after)}</span>
          </span>
        )
      })}
    </div>
  )
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return 'none'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 40)
  const s = String(value)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

function TimeLogPanel({ taskId }: { taskId: string }) {
  const { profileById } = useData()
  const toast = useToast()
  const [logs, setLogs] = useState<import('@/types/database').TimeLog[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.listTimeLogs([taskId])
        if (!cancelled) setLogs(rows)
      } catch {
        if (!cancelled) setLogs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (loading) {
    return (
      <Card title="Time log">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    )
  }

  const rows = (logs ?? []).filter((l) => l.end_time !== null)
  const totalWork = rows.filter((l) => l.segment_type === 'WORK').reduce((s, l) => s + Number(l.duration), 0)
  const totalBlocked = rows.filter((l) => l.segment_type === 'BLOCKED').reduce((s, l) => s + Number(l.duration), 0)

  return (
    <Card
      title="Time log"
      description="Every segment is derived from timestamps persisted in PostgreSQL, so it survives refreshes, sign-outs and reconnects."
    >
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Work', value: formatHours(totalWork), cls: 'text-emerald-400' },
          { label: 'Blocked', value: formatHours(totalBlocked), cls: 'text-rose-400' },
          { label: 'Segments', value: String(rows.length), cls: 'text-slate-200' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-surface-300 bg-surface-50 py-2.5">
            <p className={clsx('text-lg font-bold tabular-nums', s.cls)}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No completed time segments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">User</th>
                <th className="table-head">Type</th>
                <th className="table-head">Started</th>
                <th className="table-head">Ended</th>
                <th className="table-head text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const p = profileById(l.user_id)
                return (
                  <tr key={l.id} className="border-b border-surface-200/60 last:border-0">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Avatar name={p?.name} id={l.user_id} size="xs" />
                        <span className="truncate">{p?.name ?? 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <Chip
                        className={
                          l.segment_type === 'BLOCKED'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }
                      >
                        {l.segment_type}
                      </Chip>
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs">{formatDateTime(l.start_time)}</td>
                    <td className="table-cell whitespace-nowrap text-xs">{formatDateTime(l.end_time)}</td>
                    <td className="table-cell text-right font-semibold tabular-nums text-white">
                      {formatHours(l.duration)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-[11px] text-slate-600">
        Failed to load?{' '}
        <button
          className="link"
          onClick={() => {
            setLoading(true)
            void api
              .listTimeLogs([taskId])
              .then((r) => setLogs(r))
              .catch(() => toast.error('Could not load time logs'))
              .finally(() => setLoading(false))
          }}
        >
          Retry
        </button>
      </p>
    </Card>
  )
}

