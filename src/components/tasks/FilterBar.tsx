import { useMemo } from 'react'
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { PRIORITY_META, STATUS_META, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import { EMPTY_FILTERS } from '@/types/database'
import type { TaskFilters, TaskPriority, TaskStatus } from '@/types/database'
import { Button, Input } from '@/components/ui'

export function FilterBar({
  filters,
  onChange,
  lockedDepartments,
  showStatusFilter = true,
  resultCount,
  totalCount,
}: {
  filters: TaskFilters
  onChange: (f: TaskFilters) => void
  lockedDepartments?: string[]
  showStatusFilter?: boolean
  resultCount: number
  totalCount: number
}) {
  const { departments, profiles, sprints } = useData()

  const activeDepartments = useMemo(
    () => (lockedDepartments && lockedDepartments.length ? departments.filter((d) => lockedDepartments.includes(d.id)) : departments.filter((d) => d.active)),
    [departments, lockedDepartments],
  )

  const set = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => onChange({ ...filters, [key]: value })

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const activeCount =
    filters.departmentIds.length +
    filters.assigneeIds.length +
    filters.statuses.length +
    filters.priorities.length +
    filters.sprintIds.length +
    (filters.overdueOnly ? 1 : 0) +
    (filters.unassignedOnly ? 1 : 0) +
    (filters.search ? 1 : 0)

  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            style={{ width: 16, height: 16 }}
          />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search by task ID, title or description…"
            className="pl-9"
            aria-label="Search tasks"
          />
          {filters.search && (
            <button
              onClick={() => set('search', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="tabular-nums">
              {resultCount}
              {resultCount !== totalCount && <span className="text-slate-600"> / {totalCount}</span>}
            </span>
          </span>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onChange(EMPTY_FILTERS)}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterGroup label="Department">
          {activeDepartments.map((d) => (
            <FilterPill
              key={d.id}
              active={filters.departmentIds.includes(d.id)}
              onClick={() => set('departmentIds', toggleIn(filters.departmentIds, d.id))}
            >
              {d.name}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterGroup label="Assignee">
          {profiles
            .filter((p) => p.active)
            .slice(0, 40)
            .map((p) => (
              <FilterPill
                key={p.id}
                active={filters.assigneeIds.includes(p.id)}
                onClick={() => set('assigneeIds', toggleIn(filters.assigneeIds, p.id))}
              >
                {p.name}
              </FilterPill>
            ))}
        </FilterGroup>

        {showStatusFilter && (
          <FilterGroup label="Status">
            {TASK_STATUSES.filter((s) => s !== 'BACKLOG').map((s) => (
              <FilterPill
                key={s}
                active={filters.statuses.includes(s)}
                dot={STATUS_META[s].dot}
                onClick={() => set('statuses', toggleIn<TaskStatus>(filters.statuses, s))}
              >
                {STATUS_META[s].label}
              </FilterPill>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="Priority">
          {TASK_PRIORITIES.map((p) => (
            <FilterPill
              key={p}
              active={filters.priorities.includes(p)}
              dot={PRIORITY_META[p].bar}
              onClick={() => set('priorities', toggleIn<TaskPriority>(filters.priorities, p))}
            >
              {PRIORITY_META[p].label}
            </FilterPill>
          ))}
        </FilterGroup>

        {sprints.length > 0 && (
          <FilterGroup label="Sprint">
            {sprints.slice(0, 12).map((s) => (
              <FilterPill
                key={s.id}
                active={filters.sprintIds.includes(s.id)}
                onClick={() => set('sprintIds', toggleIn(filters.sprintIds, s.id))}
              >
                {s.name}
              </FilterPill>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="Flags">
          <FilterPill active={filters.overdueOnly} onClick={() => set('overdueOnly', !filters.overdueOnly)}>
            Overdue
          </FilterPill>
          <FilterPill active={filters.unassignedOnly} onClick={() => set('unassignedOnly', !filters.unassignedOnly)}>
            Unassigned
          </FilterPill>
        </FilterGroup>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function FilterPill({
  children,
  active,
  onClick,
  dot,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  dot?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'border-brand-500 bg-brand-500/20 text-brand-200'
          : 'border-surface-400 bg-surface-200/60 text-slate-400 hover:border-surface-500 hover:text-slate-200',
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </button>
  )
}
