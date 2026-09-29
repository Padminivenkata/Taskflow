import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Filter, Plus, RefreshCw, Smartphone, Columns3 } from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useTaskActions } from '@/hooks/useTaskActions'
import { applyFilters, api } from '@/lib/api'
import { BOARD_STATUSES, STATUS_META } from '@/lib/constants'
import { EMPTY_FILTERS } from '@/types/database'
import type { Task, TaskFilters, TaskStatus } from '@/types/database'
import { Button, EmptyState, PageHeader, Select, Skeleton } from '@/components/ui'
import { TaskCard, SortableTaskCard } from '@/components/tasks/TaskCard'
import { FilterBar } from '@/components/tasks/FilterBar'
import { TaskFormModal } from '@/components/tasks/TaskFormModal'

export default function BoardPage() {
  const { tasks, sprints, loading, canCreate, refresh, profile } = useData()
  const { changeStatus } = useTaskActions()

  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState<TaskStatus>('TO_DO')
  const [dragging, setDragging] = useState<Task | null>(null)
  const [mobileView, setMobileView] = useState<'columns' | 'list'>('columns')
  const [onlyMine, setOnlyMine] = useState(false)
  const [sprintFilter, setSprintFilter] = useState<string>('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const scoped = useMemo(() => {
    let list = tasks
    if (onlyMine && profile) list = list.filter((t) => t.assignee_id === profile.id || t.created_by === profile.id)
    return list
  }, [tasks, onlyMine, profile])

  const visible = useMemo(() => {
    const base = applyFilters(scoped, filters)
    if (sprintFilter === 'none') return base.filter((t) => !t.sprint_id)
    if (sprintFilter) return base.filter((t) => t.sprint_id === sprintFilter)
    return base
  }, [scoped, filters, sprintFilter])

  const byStatus = useMemo(() => {
    const map = {} as Record<TaskStatus, Task[]>
    for (const s of BOARD_STATUSES) map[s] = []
    for (const t of visible) {
      if (t.status !== 'BACKLOG') map[t.status].push(t)
    }
    for (const s of BOARD_STATUSES) {
      map[s].sort((a, b) => {
        const pr = a.priority === b.priority ? 0 : a.priority === 'URGENT' ? -1 : b.priority === 'URGENT' ? 1 : 0
        return pr !== 0 ? pr : a.position - b.position || a.created_at.localeCompare(b.created_at)
      })
    }
    return map
  }, [visible])

  const handleDragEnd = useCallback(
    async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const { active, over } = event
      setDragging(null)
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const task = tasks.find((t) => t.id === activeId)
      if (!task) return

      const targetStatus: TaskStatus | undefined = BOARD_STATUSES.includes(overId as TaskStatus)
        ? (overId as TaskStatus)
        : tasks.find((t) => t.id === overId)?.status

      if (!targetStatus || targetStatus === task.status) {
        // same column -> persist the new ordering so everyone sees the same sequence
        const column = byStatus[task.status]
        const oldIndex = column.findIndex((t) => t.id === activeId)
        const newIndex = column.findIndex((t) => t.id === overId)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = [...column]
          const [moved] = reordered.splice(oldIndex, 1)
          reordered.splice(newIndex, 0, moved)
          for (let i = 0; i < reordered.length; i++) {
            const nextPosition = (i + 1) * 1000
            if (reordered[i].position !== nextPosition) {
              void api
                .updateTask(reordered[i].id, { position: nextPosition })
                .then(() => refresh(true))
                .catch(() => refresh(true))
            }
          }
        }
        return
      }

      const count = byStatus[targetStatus]?.length ?? 0
      await changeStatus(task, targetStatus, (count + 1) * 1000)
    },
    [tasks, byStatus, changeStatus, refresh],
  )

  useEffect(() => {
    if (!createOpen) setCreateStatus('TO_DO')
  }, [createOpen])

  if (loading && tasks.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton className="mb-4 h-8 w-56" />
        <Skeleton className="mb-4 h-20 w-full" />
        <div className="flex gap-3 overflow-hidden">
          {BOARD_STATUSES.map((s) => (
            <Skeleton key={s} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <PageHeader
        title="Task Board"
        subtitle="Drag a card to move it. Every change is saved to the shared database instantly."
        actions={
          <>
            <div className="hidden items-center gap-1 rounded-lg border border-surface-400 p-0.5 sm:flex">
              <button
                onClick={() => setOnlyMine((v) => !v)}
                className={clsx(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  onlyMine ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white',
                )}
              >
                My tasks
              </button>
              <button
                onClick={() => setOnlyMine(false)}
                className={clsx(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  !onlyMine ? 'bg-surface-300 text-white' : 'text-slate-400 hover:text-white',
                )}
              >
                All
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-surface-400 p-0.5 sm:hidden">
              <button
                onClick={() => setMobileView('columns')}
                className={clsx('rounded-md p-1.5', mobileView === 'columns' ? 'bg-surface-300 text-white' : 'text-slate-400')}
                aria-label="Column view"
              >
                <Columns3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMobileView('list')}
                className={clsx('rounded-md p-1.5', mobileView === 'list' ? 'bg-surface-300 text-white' : 'text-slate-400')}
                aria-label="List view"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
            <Select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="h-9 w-40 py-1 text-xs">
              <option value="">All sprints</option>
              <option value="none">Not in a sprint</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canCreate && (
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setCreateStatus('TO_DO')
                  setCreateOpen(true)
                }}
              >
                New task
              </Button>
            )}
          </>
        }
      />

      <div className="mb-1 sm:hidden">
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={clsx(
            'rounded-lg border px-3 py-1.5 text-xs font-medium',
            onlyMine ? 'border-brand-500 bg-brand-500/20 text-brand-200' : 'border-surface-400 text-slate-400',
          )}
        >
          {onlyMine ? 'Showing my tasks' : 'Showing all tasks'}
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={visible.length}
        totalCount={tasks.length}
      />

      {visible.length === 0 ? (
        <div className="card flex-1">
          <EmptyState
            icon={<Filter className="h-6 w-6" />}
            title="No tasks match these filters"
            description="Try clearing a filter, or create the first task to get the board moving."
            action={
              canCreate ? (
                <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Create a task
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : mobileView === 'list' ? (
        <div className="flex-1 space-y-2 overflow-y-auto pb-24 lg:hidden">
          {BOARD_STATUSES.map((s) =>
            byStatus[s].length === 0 ? null : (
              <div key={s} className="card overflow-hidden">
                <div className={clsx('flex items-center gap-2 border-b border-surface-300 px-3 py-2', STATUS_META[s].column)}>
                  <span className={clsx('h-2 w-2 rounded-full', STATUS_META[s].dot)} />
                  <span className="text-sm font-semibold text-white">{STATUS_META[s].label}</span>
                  <span className="ml-auto text-xs tabular-nums text-slate-400">{byStatus[s].length}</span>
                </div>
                <div className="space-y-2 p-2">
                  {byStatus[s].map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setDragging(tasks.find((t) => t.id === String(e.active.id)) ?? null)}
          onDragCancel={() => setDragging(null)}
          onDragEnd={handleDragEnd}
        >
          <div className="no-scrollbar -mx-4 flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:pb-6">
            {BOARD_STATUSES.map((status) => (
              <KanbanColumn key={status} status={status} tasks={byStatus[status]} onCreate={() => {
                setCreateStatus(status)
                setCreateOpen(true)
              }} canCreate={canCreate} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging ? (
              <div className="w-72 rotate-2">
                <TaskCard task={dragging} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultStatus={createStatus} />
    </div>
  )
}

function KanbanColumn({
  status,
  tasks,
  onCreate,
  canCreate,
}: {
  status: TaskStatus
  tasks: Task[]
  onCreate: () => void
  canCreate: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = STATUS_META[status]
  const planned = tasks.reduce((sum, t) => sum + Number(t.planned_hours ?? 0), 0)
  const actual = tasks.reduce((sum, t) => sum + Number(t.actual_hours ?? 0), 0)

  return (
    <section
      className={clsx(
        'flex w-[85vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-xl border bg-surface-50 transition sm:w-72 sm:max-w-none',
        isOver ? 'border-brand-500/70 bg-brand-500/5' : 'border-surface-300',
      )}
    >
      <header className={clsx('rounded-t-xl border-b border-surface-300 bg-gradient-to-r to-transparent px-3 py-2.5', meta.column)}>
        <div className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 rounded-full', meta.dot)} />
          <h2 className="text-sm font-semibold text-white">{meta.label}</h2>
          <span className="ml-auto rounded-md bg-surface-300 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-300">
            {tasks.length}
          </span>
        </div>
        {tasks.length > 0 && (
          <p className="mt-1 text-[10px] tabular-nums text-slate-500">
            planned {planned.toFixed(1)}h · actual {actual.toFixed(1)}h
          </p>
        )}
      </header>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="min-h-[8rem] flex-1 space-y-2 overflow-y-auto p-2">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && (
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-surface-400 text-[11px] text-slate-600">
              {isOver ? 'Drop here' : 'Empty'}
            </div>
          )}
        </div>
      </SortableContext>

      {canCreate && (
        <div className="border-t border-surface-300 p-2">
          <button
            onClick={onCreate}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-slate-500 transition hover:bg-surface-200 hover:text-slate-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Add task
          </button>
        </div>
      )}
    </section>
  )
}
