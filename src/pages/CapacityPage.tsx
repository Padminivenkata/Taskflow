import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertTriangle, RefreshCw, Users } from 'lucide-react'
import clsx from 'clsx'
import { addDaysIso, endOfWeekIso, formatDate, formatHours, startOfWeekIso } from '@/lib/format'
import { api } from '@/lib/api'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { isIsoDate, isString, usePersistentState } from '@/hooks/usePersistentState'
import type { CapacityResult, UserWorkload } from '@/types/database'
import { Avatar, Button, Card, EmptyState, PageHeader, ProgressBar, Select, Skeleton } from '@/components/ui'

export default function CapacityPage() {
  const { profiles, departments, loading, profile } = useData()
  const { user } = useAuth()
  const toast = useToast()

  const [weekStart, setWeekStart] = usePersistentState<string>('capacity.weekStart', startOfWeekIso(), isIsoDate)
  const [departmentFilter, setDepartmentFilter] = usePersistentState<string>('capacity.departmentFilter', '', isString)
  const [workload, setWorkload] = useState<UserWorkload[] | null>(null)
  const [capacities, setCapacities] = useState<Record<string, CapacityResult | null>>({})
  const [busy, setBusy] = useState(false)

  const weekEnd = useMemo(() => endOfWeekIso(new Date(weekStart)), [weekStart])

  const load = async () => {
    setBusy(true)
    try {
      const wl = await api.listUserWorkload()
      setWorkload(wl)
      const entries = await Promise.all(
        wl.map(async (w) => [w.user_id, await api.calculateCapacity(w.user_id, weekStart, weekEnd)] as const),
      )
      setCapacities(Object.fromEntries(entries))
    } catch (err) {
      toast.error('Could not load workload', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  const rows = useMemo(() => {
    if (!workload) return []
    const byId = new Map(profiles.map((p) => [p.id, p]))
    return workload
      .filter((w) => (departmentFilter ? w.department_id === departmentFilter : true))
      .map((w) => {
        const cap = capacities[w.user_id]
        const p = byId.get(w.user_id)
        const capacity = cap?.capacity_hours ?? w.daily_working_hours * w.weekly_working_days
        const planned = Number(w.planned_hours ?? 0)
        const actual = Number(w.actual_hours ?? 0)
        const available = Math.round((capacity - planned) * 100) / 100
        const utilisation = capacity > 0 ? Math.round((planned / capacity) * 100) : 0
        return { ...w, profile: p ?? null, capacity, planned, actual, available, utilisation }
      })
      .sort((a, b) => b.utilisation - a.utilisation)
  }, [workload, capacities, departmentFilter, profiles])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          capacity: acc.capacity + r.capacity,
          planned: acc.planned + r.planned,
          actual: acc.actual + r.actual,
          tasks: acc.tasks + r.open_tasks,
          blocked: acc.blocked + r.blocked_tasks,
          overdue: acc.overdue + r.overdue_tasks,
        }),
        { capacity: 0, planned: 0, actual: 0, tasks: 0, blocked: 0, overdue: 0 },
      ),
    [rows],
  )

  if (loading && !workload) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Capacity & Workload"
        subtitle="Capacity = working days in the period × daily working hours, read from the working calendar."
        actions={
          <>
            <Select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="h-9 w-40 py-1 text-xs">
              {[0, 7, 14, 21].map((offset) => {
                const d = addDaysIso(startOfWeekIso(), offset)
                return (
                  <option key={d} value={d}>
                    Week of {d}
                  </option>
                )
              })}
            </Select>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()} loading={busy}>
              Recalculate
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-slate-500">
        Period: {formatDate(weekStart)} → {formatDate(weekEnd)}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Team capacity', value: formatHours(totals.capacity), tone: 'text-white' },
          { label: 'Planned', value: formatHours(totals.planned), tone: 'text-sky-300' },
          { label: 'Actual', value: formatHours(totals.actual), tone: 'text-emerald-300' },
          { label: 'Open tasks', value: totals.tasks, tone: 'text-slate-200' },
          { label: 'Blocked', value: totals.blocked, tone: 'text-rose-300' },
          { label: 'Overdue', value: totals.overdue, tone: 'text-orange-300' },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <p className={clsx('text-xl font-bold tabular-nums', s.tone)}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="h-9 w-52 py-1 text-xs">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <span className="text-xs text-slate-500">{rows.length} employees</span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No employees to report on"
            description="Workload appears once employees exist and tasks are assigned."
          />
        </div>
      ) : (
        <>
          {/* desktop table */}
          <Card className="hidden lg:block" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[62rem]">
                <thead>
                  <tr className="border-b border-surface-300">
                    <th className="table-head">Employee</th>
                    <th className="table-head">Department</th>
                    <th className="table-head text-right">Working days</th>
                    <th className="table-head text-right">Capacity</th>
                    <th className="table-head text-right">Planned</th>
                    <th className="table-head text-right">Actual</th>
                    <th className="table-head text-right">Available</th>
                    <th className="table-head w-40">Utilisation</th>
                    <th className="table-head text-right">Active</th>
                    <th className="table-head text-right">Blocked</th>
                    <th className="table-head text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.user_id}
                      className={clsx(
                        'border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40',
                        r.user_id === user?.id && 'bg-brand-500/5',
                      )}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} id={r.user_id} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{r.name}</p>
                            <p className="truncate text-[11px] text-slate-500">{r.profile?.job_title || r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-xs">
                        {departments.find((d) => d.id === r.department_id)?.name ?? '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {capacities[r.user_id]?.working_days ?? r.weekly_working_days}
                      </td>
                      <td className="table-cell text-right font-semibold tabular-nums text-white">
                        {formatHours(r.capacity)}
                      </td>
                      <td className="table-cell text-right tabular-nums text-sky-300">{formatHours(r.planned)}</td>
                      <td className="table-cell text-right tabular-nums text-emerald-300">{formatHours(r.actual)}</td>
                      <td
                        className={clsx(
                          'table-cell text-right font-semibold tabular-nums',
                          r.available < 0 ? 'text-rose-400' : 'text-white',
                        )}
                      >
                        {formatHours(r.available)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={Math.min(r.utilisation, 100)}
                            barClassName={r.utilisation > 100 ? 'bg-rose-500' : r.utilisation > 85 ? 'bg-amber-500' : 'bg-emerald-500'}
                            className="flex-1"
                          />
                          <span
                            className={clsx(
                              'w-10 text-right text-[11px] font-semibold tabular-nums',
                              r.utilisation > 100 ? 'text-rose-400' : r.utilisation > 85 ? 'text-amber-400' : 'text-emerald-400',
                            )}
                          >
                            {r.utilisation}%
                          </span>
                        </div>
                      </td>
                      <td className="table-cell text-right tabular-nums">{r.active_tasks}</td>
                      <td className="table-cell text-right tabular-nums text-rose-300">{r.blocked_tasks}</td>
                      <td className="table-cell text-right tabular-nums text-orange-300">{r.overdue_tasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* mobile cards */}
          <div className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <Card key={r.user_id}>
                <div className="mb-3 flex items-center gap-2.5">
                  <Avatar name={r.name} id={r.user_id} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{r.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {departments.find((d) => d.id === r.department_id)?.name ?? 'No department'}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      'chip',
                      r.utilisation > 100
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                        : r.utilisation > 85
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
                    )}
                  >
                    {r.utilisation}%
                  </span>
                </div>
                <ProgressBar
                  value={Math.min(r.utilisation, 100)}
                  barClassName={r.utilisation > 100 ? 'bg-rose-500' : r.utilisation > 85 ? 'bg-amber-500' : 'bg-emerald-500'}
                />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: 'Capacity', v: formatHours(r.capacity) },
                    { l: 'Planned', v: formatHours(r.planned) },
                    { l: 'Available', v: formatHours(r.available) },
                    { l: 'Active', v: String(r.active_tasks) },
                    { l: 'Blocked', v: String(r.blocked_tasks) },
                    { l: 'Overdue', v: String(r.overdue_tasks) },
                  ].map((x) => (
                    <div key={x.l} className="rounded-lg border border-surface-300 bg-surface-50 py-1.5">
                      <dd className="text-sm font-bold tabular-nums text-white">{x.v}</dd>
                      <dt className="text-[9px] uppercase tracking-wider text-slate-500">{x.l}</dt>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-slate-600">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Available = Capacity − Planned hours. Utilisation = Planned ÷ Capacity × 100. Values above 100% indicate
        over-allocation.
      </p>

      {profile?.role === 'EMPLOYEE' && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          You can see your own row in full. Organisation-wide workload figures are limited to Department Heads and
          Admins by database policy.
          <Link to="/board" className="link ml-1">
            Back to board
          </Link>
        </p>
      )}
    </div>
  )
}
