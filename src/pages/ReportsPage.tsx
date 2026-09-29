import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, Download, Timer, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '@/context/DataContext'
import { PRIORITY_META, STATUS_META, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import { agingDays, formatHours, isOverdue, toISODate } from '@/lib/format'
import { Button, Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui'

const PALETTE = ['#3b82f6', '#10b981', '#f43f5e', '#a78bfa', '#38bdf8', '#f59e0b', '#64748b', '#ec4899']

export default function ReportsPage() {
  const { tasks, departments, profiles, sprints, sprintProgress } = useData()
  const [window, setWindow] = useState<30 | 60 | 90 | 0>(30)

  const cutoff = useMemo(() => {
    if (window === 0) return null
    const d = new Date()
    d.setDate(d.getDate() - window)
    return d
  }, [window])

  const scoped = useMemo(() => {
    if (!cutoff) return tasks
    return tasks.filter((t) => new Date(t.created_at) >= cutoff)
  }, [tasks, cutoff])

  const byStatus = useMemo(
    () =>
      TASK_STATUSES.map((s) => ({
        key: s,
        name: STATUS_META[s].label,
        value: scoped.filter((t) => t.status === s).length,
        color:
          s === 'BACKLOG'
            ? '#64748b'
            : s === 'TO_DO'
              ? '#38bdf8'
              : s === 'IN_PROGRESS'
                ? '#3b82f6'
                : s === 'REVIEW'
                  ? '#a78bfa'
                  : s === 'BLOCKED'
                    ? '#f43f5e'
                    : '#10b981',
      })),
    [scoped],
  )

  const byPriority = useMemo(
    () =>
      TASK_PRIORITIES.map((p) => ({
        name: PRIORITY_META[p].label,
        value: scoped.filter((t) => t.priority === p).length,
        color: PRIORITY_META[p].bar.replace('bg-', ''),
      })),
    [scoped],
  )

  const priorityPie = useMemo(
    () =>
      TASK_PRIORITIES.map((p) => ({
        name: PRIORITY_META[p].label,
        value: scoped.filter((t) => t.priority === p).length,
        fill:
          p === 'URGENT' ? '#f43f5e' : p === 'HIGH' ? '#f97316' : p === 'MEDIUM' ? '#f59e0b' : '#10b981',
      })),
    [scoped],
  )

  const byDepartment = useMemo(
    () =>
      departments
        .map((d) => {
          const list = scoped.filter((t) => t.department_id === d.id)
          const done = list.filter((t) => t.status === 'DONE')
          return {
            name: d.name,
            total: list.length,
            done: done.length,
            completion: list.length ? Math.round((done.length / list.length) * 100) : 0,
            planned: list.reduce((s, t) => s + Number(t.planned_hours ?? 0), 0),
            actual: list.reduce((s, t) => s + Number(t.actual_hours ?? 0), 0),
            blocked: list.filter((t) => t.status === 'BLOCKED').length,
          }
        })
        .filter((d) => d.total > 0)
        .sort((a, b) => b.total - a.total),
    [departments, scoped],
  )

  const byAssignee = useMemo(
    () =>
      profiles
        .map((p) => {
          const list = scoped.filter((t) => t.assignee_id === p.id)
          return {
            name: p.name,
            total: list.length,
            open: list.filter((t) => t.status !== 'DONE').length,
            planned: list.reduce((s, t) => s + Number(t.planned_hours ?? 0), 0),
            actual: list.reduce((s, t) => s + Number(t.actual_hours ?? 0), 0),
            overdue: list.filter((t) => isOverdue(t.due_date, t.status)).length,
          }
        })
        .filter((p) => p.total > 0)
        .sort((a, b) => b.open - a.open)
        .slice(0, 12),
    [profiles, scoped],
  )

  const agingBuckets = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'BACKLOG')
    const buckets = [
      { label: '0–2 days', min: 0, max: 2, count: 0 },
      { label: '3–7 days', min: 3, max: 7, count: 0 },
      { label: '8–14 days', min: 8, max: 14, count: 0 },
      { label: '15–30 days', min: 15, max: 30, count: 0 },
      { label: '30+ days', min: 31, max: 100000, count: 0 },
    ]
    for (const t of open) {
      const age = agingDays(t)
      const bucket = buckets.find((b) => age >= b.min && age <= b.max)
      if (bucket) bucket.count += 1
    }
    return buckets
  }, [tasks])

  const blocked = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'BLOCKED')
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
    [tasks],
  )

  const overdue = useMemo(() => tasks.filter((t) => isOverdue(t.due_date, t.status)), [tasks])

  const exportCsv = () => {
    const header = [
      'task_key',
      'title',
      'status',
      'priority',
      'department',
      'assignee',
      'sprint',
      'due_date',
      'planned_hours',
      'actual_hours',
      'blocked_hours',
      'created_at',
      'completed_at',
    ]
    const rows = tasks.map((t) => [
      t.task_key,
      `"${t.title.replace(/"/g, '""')}"`,
      t.status,
      t.priority,
      departments.find((d) => d.id === t.department_id)?.name ?? '',
      profiles.find((p) => p.id === t.assignee_id)?.name ?? '',
      sprints.find((s) => s.id === t.sprint_id)?.name ?? '',
      t.due_date ?? '',
      t.planned_hours,
      t.actual_hours,
      t.blocked_hours,
      t.created_at,
      t.completed_at ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taskflow-tasks-${toISODate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Reports" />
        <div className="card">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="No data to report yet"
            description="Once tasks are created, this page shows live department, workload, aging and throughput analytics."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Reports"
        subtitle="Every number is aggregated from live database queries — nothing is precomputed or hardcoded."
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-surface-400 p-0.5">
              {([30, 60, 90, 0] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindow(w)}
                  className={clsx(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    window === w ? 'bg-surface-300 text-white' : 'text-slate-400 hover:text-white',
                  )}
                >
                  {w === 0 ? 'All' : `${w}d`}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Status distribution">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byStatus.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%">
                  {byStatus.map((d) => (
                    <Cell key={d.key} fill={d.color} stroke="#151b28" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Priority mix">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityPie.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%">
                  {priorityPie.map((d) => (
                    <Cell key={d.name} fill={d.fill} stroke="#151b28" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Task aging" description="How long open tasks have existed">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingBuckets} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232d40" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]}>
                  {agingBuckets.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Department performance" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">Department</th>
                <th className="table-head text-right">Total</th>
                <th className="table-head text-right">Done</th>
                <th className="table-head text-right">Blocked</th>
                <th className="table-head text-right">Planned</th>
                <th className="table-head text-right">Actual</th>
                <th className="table-head w-44">Completion</th>
              </tr>
            </thead>
            <tbody>
              {byDepartment.map((d, i) => (
                <tr key={d.name} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="font-medium text-white">{d.name}</span>
                    </div>
                  </td>
                  <td className="table-cell text-right tabular-nums">{d.total}</td>
                  <td className="table-cell text-right tabular-nums text-emerald-300">{d.done}</td>
                  <td className="table-cell text-right tabular-nums text-rose-300">{d.blocked}</td>
                  <td className="table-cell text-right tabular-nums text-sky-300">{formatHours(d.planned)}</td>
                  <td className="table-cell text-right tabular-nums text-emerald-300">{formatHours(d.actual)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={d.completion} className="flex-1" barClassName="bg-emerald-500" />
                      <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">{d.completion}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Planned vs actual hours by employee" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAssignee} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232d40" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>} />
                <Bar dataKey="planned" name="Planned hours" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual hours" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Sprint progress" padded={false}>
          {sprintProgress.length === 0 ? (
            <EmptyState title="No sprints yet" />
          ) : (
            <ul className="divide-y divide-surface-200/60">
              {sprintProgress.slice(0, 8).map((s) => (
                <li key={s.sprint_id} className="p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">{s.sprint_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {s.done_tasks}/{s.total_tasks}
                    </span>
                  </div>
                  <ProgressBar value={s.done_tasks} max={s.total_tasks || 1} barClassName="bg-emerald-500" />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatHours(s.actual_hours)} actual · {formatHours(s.planned_hours)} planned
                    {s.blocked_tasks > 0 && <span className="text-rose-400"> · {s.blocked_tasks} blocked</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Needs attention" padded={false}>
          <div className="max-h-80 overflow-y-auto">
            {blocked.length === 0 && overdue.length === 0 ? (
              <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Nothing blocked or overdue" />
            ) : (
              <ul className="divide-y divide-surface-200/60">
                {blocked.slice(0, 6).map((t) => (
                  <li key={`b-${t.id}`} className="flex items-center gap-2.5 p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                    <Link to={`/tasks/${t.id}`} className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-brand-300">{t.task_key}</span>
                      <p className="truncate text-xs text-slate-200">{t.title}</p>
                    </Link>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {formatHours(t.blocked_hours)} blocked
                    </span>
                  </li>
                ))}
                {overdue.slice(0, 6).map((t) => (
                  <li key={`o-${t.id}`} className="flex items-center gap-2.5 p-3">
                    <Timer className="h-4 w-4 shrink-0 text-orange-400" />
                    <Link to={`/tasks/${t.id}`} className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-brand-300">{t.task_key}</span>
                      <p className="truncate text-xs text-slate-200">{t.title}</p>
                    </Link>
                    <span className="shrink-0 text-[10px] text-orange-400">due {t.due_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card title="Per-employee summary" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">Employee</th>
                <th className="table-head text-right">Total</th>
                <th className="table-head text-right">Open</th>
                <th className="table-head text-right">Planned</th>
                <th className="table-head text-right">Actual</th>
                <th className="table-head text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {byAssignee.map((a) => (
                <tr key={a.name} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                  <td className="table-cell font-medium text-white">{a.name}</td>
                  <td className="table-cell text-right tabular-nums">{a.total}</td>
                  <td className="table-cell text-right tabular-nums">{a.open}</td>
                  <td className="table-cell text-right tabular-nums text-sky-300">{formatHours(a.planned)}</td>
                  <td className="table-cell text-right tabular-nums text-emerald-300">{formatHours(a.actual)}</td>
                  <td className="table-cell text-right tabular-nums text-orange-300">{a.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-slate-600">
        Window: {window === 0 ? 'all time' : `last ${window} days`} · {byPriority.reduce((s, p) => s + p.value, 0)} tasks
        analysed.
      </p>
    </div>
  )
}
