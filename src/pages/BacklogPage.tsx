import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Inbox, Plus, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useToast } from '@/context/ToastContext'
import { api } from '@/lib/api'
import { PRIORITY_META } from '@/lib/constants'
import { formatHours, isOverdue } from '@/lib/format'
import type { Task } from '@/types/database'
import { Button, Card, EmptyState, PageHeader, Select, Skeleton } from '@/components/ui'
import { TaskFormModal } from '@/components/tasks/TaskFormModal'
import { FilterBar } from '@/components/tasks/FilterBar'
import { applyFilters } from '@/lib/api'
import { EMPTY_FILTERS } from '@/types/database'
import type { TaskFilters } from '@/types/database'

export default function BacklogPage() {
  const { tasks, sprints, canCreate, canManageSprints, loading, refreshTasks, refreshAuditLogs, departmentById, profileById } = useData()
  const toast = useToast()
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [createOpen, setCreateOpen] = useState(false)
  const [targetSprint, setTargetSprint] = useState('')

  const backlog = useMemo(() => tasks.filter((t) => t.status === 'BACKLOG'), [tasks])
  const filtered = useMemo(() => applyFilters(backlog, filters), [backlog, filters])

  const openSprints = sprints.filter((s) => s.status !== 'COMPLETED')

  const moveToSprint = async (task: Task) => {
    if (!targetSprint) {
      toast.error('Pick a sprint first', 'Choose the sprint this task should be added to.')
      return
    }
    try {
      // A backlog task cannot belong to a sprint (database constraint), so the
      // status is moved in the same update that attaches it.
      await api.updateTask(task.id, { sprint_id: targetSprint, status: 'TO_DO' }, task.version)
      toast.success('Moved to sprint', `${task.task_key} is now in the sprint backlog.`)
      await refreshTasks()
      await refreshAuditLogs()
    } catch (err) {
      toast.error('Could not move the task', err instanceof Error ? err.message : undefined)
      await refreshTasks()
    }
  }

  const unassignedCount = backlog.filter((t) => !t.assignee_id).length
  const unplannedCount = backlog.filter((t) => Number(t.planned_hours) === 0).length
  const totalPlanned = backlog.reduce((s, t) => s + Number(t.planned_hours ?? 0), 0)

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Backlog"
        subtitle="Work waiting to be scheduled into a sprint."
        actions={
          canCreate && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New backlog item
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Backlog items', value: backlog.length, tone: 'text-white' },
          { label: 'Unassigned', value: unassignedCount, tone: 'text-amber-300' },
          { label: 'Without estimate', value: unplannedCount, tone: 'text-orange-300' },
          { label: 'Planned hours', value: `${totalPlanned.toFixed(1)}h`, tone: 'text-slate-200' },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <p className={clsx('text-xl font-bold tabular-nums', s.tone)}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {canManageSprints && openSprints.length > 0 && (
        <Card title="Add backlog items to a sprint" className="mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={targetSprint} onChange={(e) => setTargetSprint(e.target.value)} className="sm:max-w-xs">
              <option value="">Select a sprint…</option>
              {openSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">
              {targetSprint
                ? 'Pick a task below to move it into this sprint.'
                : 'Select a sprint to enable the move buttons.'}
            </p>
          </div>
        </Card>
      )}

      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        totalCount={backlog.length}
        showStatusFilter={false}
      />

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title={backlog.length === 0 ? 'The backlog is empty' : 'No items match these filters'}
            description={
              backlog.length === 0
                ? 'Create backlog items to collect future work before planning a sprint.'
                : 'Clear a filter to see the rest of the backlog.'
            }
            action={
              canCreate ? (
                <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Add a backlog item
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead>
                <tr className="border-b border-surface-300">
                  <th className="table-head">Task</th>
                  <th className="table-head">Priority</th>
                  <th className="table-head">Department</th>
                  <th className="table-head">Assignee</th>
                  <th className="table-head text-right">Planned</th>
                  <th className="table-head">Created</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const dept = departmentById(t.department_id)?.name ?? '—'
                  const assignee = t.assignee_id ? (profileById(t.assignee_id)?.name ?? 'Unknown') : 'Unassigned'
                  return (
                    <tr key={t.id} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                      <td className="table-cell">
                        <Link to={`/tasks/${t.id}`} className="block max-w-md">
                          <span className="font-mono text-[10px] text-brand-300">{t.task_key}</span>
                          <p className="truncate text-sm font-medium text-white">{t.title}</p>
                        </Link>
                      </td>
                      <td className="table-cell">
                        <span className={clsx('chip', PRIORITY_META[t.priority].chip)}>
                          {PRIORITY_META[t.priority].label}
                        </span>
                      </td>
                      <td className="table-cell">{dept}</td>
                      <td className="table-cell">{assignee}</td>
                      <td className="table-cell text-right tabular-nums">{formatHours(t.planned_hours)}</td>
                      <td className="table-cell whitespace-nowrap text-xs text-slate-500">
                        {t.due_date ? (
                          <span className={clsx(isOverdue(t.due_date, t.status) && 'text-rose-400')}>{t.due_date}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1.5">
                          {canManageSprints && targetSprint && (
                            <Button size="sm" variant="secondary" onClick={() => void moveToSprint(t)}>
                              <Sparkles className="h-3.5 w-3.5" />
                              Sprint
                            </Button>
                          )}
                          <Link to={`/tasks/${t.id}`} className="btn-secondary h-8 px-2.5 text-xs">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TaskFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultStatus="BACKLOG"
        defaultSprintId={null}
      />    </div>
  )
}

