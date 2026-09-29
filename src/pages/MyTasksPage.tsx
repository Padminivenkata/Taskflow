import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ListTodo, Plus, Timer } from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useTaskActions } from '@/hooks/useTaskActions'
import { PRIORITY_META, STATUS_META, TASK_STATUSES } from '@/lib/constants'
import { formatHours, isOverdue } from '@/lib/format'
import type { TaskStatus } from '@/types/database'
import { Button, Card, EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/ui'
import { TaskFormModal } from '@/components/tasks/TaskFormModal'
import { FilterBar } from '@/components/tasks/FilterBar'
import { applyFilters } from '@/lib/api'
import { EMPTY_FILTERS } from '@/types/database'
import type { TaskFilters } from '@/types/database'

const GROUPS: TaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE']

export default function MyTasksPage() {
  const { tasks, comments, activeTimeLogs, loading, canCreate, isEditable } = useData()
  const { profile } = useAuth()
  const { changeStatus } = useTaskActions()
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [createOpen, setCreateOpen] = useState(false)

  const mine = useMemo(
    () => tasks.filter((t) => t.assignee_id === profile?.id || t.created_by === profile?.id),
    [tasks, profile?.id],
  )
  const filtered = useMemo(() => applyFilters(mine, filters), [mine, filters])

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {}
    for (const g of GROUPS) map[g] = []
    for (const t of filtered) {
      if (t.status === 'BACKLOG') continue
      map[t.status].push(t)
    }
    return map
  }, [filtered])

  const stats = useMemo(() => {
    const open = mine.filter((t) => t.status !== 'DONE' && t.status !== 'BACKLOG')
    return {
      open: open.length,
      inProgress: mine.filter((t) => t.status === 'IN_PROGRESS').length,
      blocked: mine.filter((t) => t.status === 'BLOCKED').length,
      overdue: open.filter((t) => isOverdue(t.due_date, t.status)).length,
      planned: open.reduce((s, t) => s + Number(t.planned_hours ?? 0), 0),
      actual: open.reduce((s, t) => s + Number(t.actual_hours ?? 0), 0),
    }
  }, [mine])

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="My Tasks"
        subtitle="Everything assigned to you, plus the tasks you created."
        actions={
          canCreate && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New task
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Open', value: stats.open, tone: 'text-white' },
          { label: 'In progress', value: stats.inProgress, tone: 'text-blue-300' },
          { label: 'Blocked', value: stats.blocked, tone: 'text-rose-300' },
          { label: 'Overdue', value: stats.overdue, tone: 'text-orange-300' },
          { label: 'Planned', value: `${stats.planned.toFixed(1)}h`, tone: 'text-slate-200' },
          { label: 'Actual', value: `${stats.actual.toFixed(1)}h`, tone: 'text-emerald-300' },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <p className={clsx('text-xl font-bold tabular-nums', s.tone)}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        totalCount={mine.length}
        showStatusFilter={false}
      />

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ListTodo className="h-6 w-6" />}
            title={mine.length === 0 ? 'No tasks assigned to you yet' : 'No tasks match these filters'}
            description={
              mine.length === 0
                ? 'When a lead assigns you work it will appear here instantly.'
                : 'Try clearing a filter to see more.'
            }
            action={
              canCreate ? (
                <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Create a task
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {GROUPS.map((status) =>
            grouped[status].length === 0 ? null : (
              <Card
                key={status}
                title={
                  <span className="flex items-center gap-2">
                    <span className={clsx('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
                    {STATUS_META[status].label}
                    <span className="rounded bg-surface-300 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                      {grouped[status].length}
                    </span>
                  </span>
                }
                padded={false}
              >
                <ul className="divide-y divide-surface-200/60">
                  {grouped[status].map((t) => {
                    const timer = activeTimeLogs.find((a) => a.task_id === t.id)
                    const commentCount = comments.filter((c) => c.task_id === t.id).length
                    return (
                      <li key={t.id} className="p-3 transition hover:bg-surface-200/40">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/tasks/${t.id}`} className="min-w-0 flex-1">
                            <p className="font-mono text-[10px] text-brand-300">{t.task_key}</p>
                            <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-100">{t.title}</p>
                          </Link>
                          <span className={clsx('chip shrink-0', PRIORITY_META[t.priority].chip)}>
                            {PRIORITY_META[t.priority].label}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          {t.due_date && (
                            <span className={clsx(isOverdue(t.due_date, t.status) && 'font-semibold text-rose-400')}>
                              Due {t.due_date}
                            </span>
                          )}
                          <span>{formatHours(t.planned_hours)} planned</span>
                          {commentCount > 0 && <span>· {commentCount} comments</span>}
                          {timer && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Timer className="h-3 w-3 animate-pulse" /> {formatHours(timer.elapsed_hours)}
                            </span>
                          )}
                        </div>

                        {isEditable(t) && status !== 'DONE' && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {TASK_STATUSES.filter((s) => s !== status && s !== 'BACKLOG').map((s) => (
                              <button
                                key={s}
                                onClick={() => void changeStatus(t, s)}
                                className="rounded border border-surface-400 px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:border-brand-500 hover:text-brand-300"
                              >
                                → {STATUS_META[s].short}
                              </button>
                            ))}
                          </div>
                        )}
                        {status === 'DONE' && (
                          <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ),
          )}
        </div>
      )}

      {stats.open > 0 && (
        <Card title="Effort remaining" className="mt-4">
          <ProgressBar
            value={stats.actual}
            max={stats.planned || 1}
            barClassName={stats.actual > stats.planned ? 'bg-rose-500' : 'bg-emerald-500'}
          />
          <p className="mt-2 text-xs text-slate-500">
            {formatHours(Math.max(0, stats.planned - stats.actual))} of planned work remaining across your{' '}
            {stats.open} open tasks.
          </p>
        </Card>
      )}

      <TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultStatus="TO_DO" />
    </div>
  )
}

