import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, CheckCircle2, PlayCircle, Plus, Rocket, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useToast, useConfirm } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { STATUS_META, TASK_STATUSES } from '@/lib/constants'
import { daysOverdue, formatDate, formatHours, isSprintOverdue, titleCase } from '@/lib/format'
import type { Sprint, SprintStatus } from '@/types/database'
import { Button, Card, Chip, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, Skeleton, Textarea } from '@/components/ui'

const STATUS_CHIP: Record<SprintStatus, string> = {
  PLANNED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  COMPLETED: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
}

export default function SprintsPage() {
  const { sprints, sprintProgress, tasks, canManageSprints, loading, refresh, refreshTasks, refreshAuditLogs, departmentById, profile } =
    useData()
  const { user } = useAuth()
  const toast = useToast()
  const { confirm, dialog } = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', department_id: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const progressBySprint = useMemo(() => {
    const map: Record<string, (typeof sprintProgress)[number]> = {}
    for (const p of sprintProgress) map[p.sprint_id] = p
    return map
  }, [sprintProgress])

  // The DB allows one ACTIVE sprint per department, so more than one can come
  // back. Prefer the viewer's own department, then the most recently started,
  // instead of whichever row the sort happened to return first.
  const activeSprint = useMemo(() => {
    const active = sprints.filter((s) => s.status === 'ACTIVE')
    if (active.length === 0) return null
    if (active.length === 1) return active[0]
    const mine = active.filter((s) => s.department_id && s.department_id === profile?.department_id)
    const pool = mine.length > 0 ? mine : active
    return [...pool].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0]
  }, [sprints, profile?.department_id])

  const otherActiveSprints = useMemo(
    () => sprints.filter((s) => s.status === 'ACTIVE' && s.id !== activeSprint?.id),
    [sprints, activeSprint],
  )

  const plannedSprints = sprints.filter((s) => s.status === 'PLANNED')
  const history = sprints.filter((s) => s.status === 'COMPLETED')

  const createSprint = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const next: Record<string, string> = {}
    if (form.name.trim().length < 3) next.name = 'Give the sprint a name (3+ characters)'
    if (form.start_date && form.end_date && form.end_date < form.start_date)
      next.end_date = 'End date must be after the start date'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await api.createSprint({
        name: form.name.trim(),
        goal: form.goal.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        department_id: form.department_id || profile?.department_id || null,
      })
      toast.success('Sprint created', 'It is saved in PLANNED state.')
      setForm({ name: '', goal: '', start_date: '', end_date: '', department_id: '' })
      setCreateOpen(false)
      await refresh()
      await refreshAuditLogs()
    } catch (err) {
      toast.error('Could not create the sprint', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (sprint: Sprint, status: SprintStatus) => {
    // Only one sprint may be ACTIVE, so starting a new one has to retire every
    // other active sprint first. Previously this just errored out, which left an
    // expired sprint active forever and made switching impossible.
    const retiring = status === 'ACTIVE' ? sprints.filter((s) => s.status === 'ACTIVE' && s.id !== sprint.id) : []

    if (status === 'ACTIVE' && retiring.length > 0) {
      const names = retiring.map((s) => `"${s.name}"`).join(', ')
      const stale = retiring.filter(isSprintOverdue)
      const ok = await confirm({
        title: `Start "${sprint.name}"?`,
        description: `${names} ${retiring.length === 1 ? 'will be completed' : 'will be completed'} and moved to history${
          stale.length > 0
            ? ` — ${stale.map((s) => `"${s.name}" ended ${formatDate(s.end_date, 'dd MMM yyyy')}`).join('; ')} and ${stale.length === 1 ? 'is' : 'are'} still marked active`
            : ''
        }. Tasks that are not done stay on the board untouched.`,
        confirmLabel: `Complete ${retiring.map((s) => s.name).join(', ')} & start ${sprint.name}`,
        danger: stale.length > 0,
      })
      if (!ok) return
    }
    if (status === 'ACTIVE' && retiring.length === 0) {
      const ok = await confirm({
        title: `Start "${sprint.name}"?`,
        description: 'The sprint becomes the active sprint for the whole organisation. This is stored in the database, so a refresh will not reset it.',
        confirmLabel: 'Start sprint',
        danger: false,
      })
      if (!ok) return
    }
    if (status === 'COMPLETED') {
      const ok = await confirm({
        title: `Complete "${sprint.name}"?`,
        description: 'The sprint moves into history. Tasks that are not done return to the board untouched.',
        confirmLabel: 'Complete sprint',
      })
      if (!ok) return
    }
    try {
      // Archive outgoing sprints before the new one takes the ACTIVE slot,
      // otherwise a partial unique index on status rejects the second write.
      for (const old of retiring) {
        await api.updateSprint(old.id, {
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
        })
      }
      await api.updateSprint(sprint.id, {
        status,
        start_date: status === 'ACTIVE' && !sprint.start_date ? new Date().toISOString().slice(0, 10) : sprint.start_date,
        completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
      })
      toast.success(
        status === 'ACTIVE' && retiring.length > 0
          ? `${retiring.map((s) => s.name).join(', ')} completed, ${sprint.name} started`
          : `Sprint ${status === 'ACTIVE' ? 'started' : status === 'COMPLETED' ? 'completed' : 'updated'}`,
      )
      await refresh()
      await refreshTasks()
      await refreshAuditLogs()
    } catch (err) {
      toast.error('Could not update the sprint', err instanceof Error ? err.message : undefined)
      await refresh()
    }
  }

  const removeSprint = async (sprint: Sprint) => {
    const ok = await confirm({
      title: `Delete "${sprint.name}"?`,
      description: 'The sprint is removed for everyone. Its tasks stay in the board and lose their sprint assignment.',
      confirmLabel: 'Delete sprint',
    })
    if (!ok) return
    try {
      await api.deleteSprint(sprint.id)
      toast.success('Sprint deleted')
      await refresh()
      await refreshTasks()
      await refreshAuditLogs()
    } catch (err) {
      toast.error('Could not delete the sprint', err instanceof Error ? err.message : undefined)
    }
  }

  if (loading && sprints.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      {dialog}
      <PageHeader
        title="Sprints"
        subtitle="Sprint state lives in PostgreSQL — refreshing or signing out never resets it."
        actions={
          canManageSprints && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New sprint
            </Button>
          )
        }
      />

      {sprints.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Rocket className="h-6 w-6" />}
            title="No sprints yet"
            description="Create a sprint to plan a period of work, then pull backlog items into it."
            action={
              canManageSprints ? (
                <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Create the first sprint
                </Button>
              ) : (
                <p className="text-xs text-slate-500">A Department Head or Admin can create sprints.</p>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {otherActiveSprints.length > 0 && (
            <div className="card border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              <p className="font-medium">
                {otherActiveSprints.length} other sprint{otherActiveSprints.length === 1 ? ' is' : 's are'} also marked
                active
              </p>
              <p className="mt-0.5 text-xs text-amber-300/70">
                {otherActiveSprints.map((s) => s.name).join(', ')}. Starting a new sprint completes{' '}
                {otherActiveSprints.length === 1 ? 'it' : 'them'} automatically.
              </p>
            </div>
          )}

          <SprintSection
            title="Active sprint"
            sprints={activeSprint ? [activeSprint] : []}
            progressBySprint={progressBySprint}
            tasksBySprint={tasks}
            canManage={canManageSprints}
            onStatus={setStatus}
            onDelete={removeSprint}
            departmentById={departmentById}
            emptyLabel="No sprint is active. Start a planned sprint when the team is ready."
            emptyIcon={<PlayCircle className="h-6 w-6" />}
          />

          <SprintSection
            title="Planned sprints"
            sprints={plannedSprints}
            progressBySprint={progressBySprint}
            tasksBySprint={tasks}
            canManage={canManageSprints}
            onStatus={setStatus}
            onDelete={removeSprint}
            departmentById={departmentById}
            emptyLabel="No planned sprints."
            emptyIcon={<CalendarRange className="h-6 w-6" />}
          />

          {history.length > 0 && (
            <SprintSection
              title="Sprint history"
              sprints={history}
              progressBySprint={progressBySprint}
              tasksBySprint={tasks}
              canManage={canManageSprints}
              onStatus={setStatus}
              onDelete={removeSprint}
              departmentById={departmentById}
              emptyLabel="No completed sprints yet."
              emptyIcon={<CheckCircle2 className="h-6 w-6" />}
            />
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a sprint"
        description="Sprints start in PLANNED state. Only one sprint can be ACTIVE at a time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={createSprint} loading={busy}>
              Create sprint
            </Button>
          </>
        }
      >
        <form onSubmit={createSprint} className="space-y-4" noValidate>
          <Field label="Sprint name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Sprint 24 — Payments hardening"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Goal" hint="What does success look like for this sprint?">
            <Textarea
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              rows={3}
              placeholder="Ship the new payment flow with zero regressions."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </Field>
            <Field label="End date" error={errors.end_date}>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                invalid={Boolean(errors.end_date)}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function SprintSection({
  title,
  sprints,
  progressBySprint,
  tasksBySprint,
  canManage,
  onStatus,
  onDelete,
  departmentById,
  emptyLabel,
  emptyIcon,
}: {
  title: string
  sprints: Sprint[]
  progressBySprint: Record<string, import('@/types/database').SprintProgress | undefined>
  tasksBySprint: import('@/types/database').Task[]
  canManage: boolean
  onStatus: (s: Sprint, status: SprintStatus) => Promise<void>
  onDelete: (s: Sprint) => Promise<void>
  departmentById: (id: string | null | undefined) => import('@/types/database').Department | null
  emptyLabel: string
  emptyIcon: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {sprints.length === 0 ? (
        <div className="card flex items-center gap-3 p-4 text-sm text-slate-500">
          <span className="text-slate-600">{emptyIcon}</span>
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sprints.map((s) => {
            const progress = progressBySprint[s.id]
            const sprintTasks = tasksBySprint.filter((t) => t.sprint_id === s.id)
            const statusCounts = TASK_STATUSES.map((st) => ({
              status: st,
              count: sprintTasks.filter((t) => t.status === st).length,
            })).filter((x) => x.count > 0)

            return (
              <Card key={s.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{s.name}</h3>
                      <Chip className={STATUS_CHIP[s.status]}>{titleCase(s.status.toLowerCase())}</Chip>
                      {isSprintOverdue(s) && (
                        <Chip className="border-amber-500/40 bg-amber-500/15 text-amber-300">
                          Overdue {daysOverdue(s)}d
                        </Chip>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(s.start_date)} → {formatDate(s.end_date)}
                      {s.department_id ? ` · ${departmentById(s.department_id)?.name ?? 'Unknown department'}` : ' · Organisation wide'}
                    </p>
                    {isSprintOverdue(s) && (
                      <p className="mt-1 text-xs text-amber-300/80">
                        Ended {formatDate(s.end_date, 'dd MMM')} but is still marked active. Starting another sprint
                        will move this one to history.
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1.5">
                      {s.status === 'PLANNED' && (
                        <Button size="sm" onClick={() => void onStatus(s, 'ACTIVE')} icon={<PlayCircle className="h-3.5 w-3.5" />}>
                          Start
                        </Button>
                      )}
                      {s.status === 'ACTIVE' && (
                        <Button size="sm" variant="secondary" onClick={() => void onStatus(s, 'COMPLETED')} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                          Complete
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Delete sprint" onClick={() => void onDelete(s)}>
                        <Trash2 className="h-4 w-4 text-rose-400" />
                      </Button>
                    </div>
                  )}
                </div>

                {s.goal && <p className="mb-3 text-sm text-slate-400">{s.goal}</p>}

                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {progress?.done_tasks ?? 0} of {progress?.total_tasks ?? sprintTasks.length} done
                  </span>
                  <span className="tabular-nums">
                    {formatHours(progress?.actual_hours ?? 0)} actual / {formatHours(progress?.planned_hours ?? 0)} planned
                  </span>
                </div>
                <ProgressBar
                  value={progress?.done_tasks ?? 0}
                  max={progress?.total_tasks ?? (sprintTasks.length || 1)}
                  barClassName={s.status === 'COMPLETED' ? 'bg-brand-500' : 'bg-emerald-500'}
                />

                {statusCounts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {statusCounts.map((sc) => (
                      <span key={sc.status} className={clsx('chip', STATUS_META[sc.status].chip)}>
                        {STATUS_META[sc.status].label} {sc.count}
                      </span>
                    ))}
                  </div>
                )}

                {sprintTasks.length > 0 && (
                  <div className="mt-3 border-t border-surface-300 pt-3">
                    <p className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Tasks</p>
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {sprintTasks.slice(0, 20).map((t) => (
                        <li key={t.id}>
                          <Link
                            to={`/tasks/${t.id}`}
                            className="flex items-center gap-2 rounded px-1.5 py-1 text-xs transition hover:bg-surface-200"
                          >
                            <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[t.status].dot)} />
                            <span className="font-mono text-[10px] text-brand-300">{t.task_key}</span>
                            <span className="min-w-0 flex-1 truncate text-slate-300">{t.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {sprintTasks.length > 20 && (
                      <p className="mt-1 text-[10px] text-slate-600">+{sprintTasks.length - 20} more</p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

