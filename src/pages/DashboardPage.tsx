import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  Hourglass,
  Inbox,
  Layers,
  Timer,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { PRIORITY_META, STATUS_META, TASK_STATUSES } from '@/lib/constants'
import { agingDays, cycleTimeDays, formatDate, formatHours, isOverdue, isSprintOverdue } from '@/lib/format'
import type { TaskStatus } from '@/types/database'
import { Card, EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/ui'
const CHART_COLORS: Record<TaskStatus, string> = {
  BACKLOG: '#64748b',
  TO_DO: '#38bdf8',
  IN_PROGRESS: '#3b82f6',
  REVIEW: '#a78bfa',
  BLOCKED: '#f43f5e',
  DONE: '#10b981',
}

export default function DashboardPage() {
  const { tasks, departments, profiles, sprints, sprintProgress, activeTimeLogs, loading } = useData()
  const { profile } = useAuth()

  const stats = useMemo(() => {
    const byStatus = {} as Record<TaskStatus, number>
    for (const s of TASK_STATUSES) byStatus[s] = 0
    let overdue = 0
    let planned = 0
    let actual = 0
    let open = 0

    for (const t of tasks) {
      byStatus[t.status] += 1
      if (t.status !== 'DONE') {
        open += 1
        planned += Number(t.planned_hours ?? 0)
        actual += Number(t.actual_hours ?? 0)
      }
      if (isOverdue(t.due_date, t.status)) overdue += 1
    }

    const byDepartment = departments
      .map((d) => ({
        name: d.name,
        total: tasks.filter((t) => t.department_id === d.id).length,
        done: tasks.filter((t) => t.department_id === d.id && t.status === 'DONE').length,
        inProgress: tasks.filter((t) => t.department_id === d.id && t.status === 'IN_PROGRESS').length,
        blocked: tasks.filter((t) => t.department_id === d.id && t.status === 'BLOCKED').length,
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)

    const byAssignee = profiles
      .map((p) => ({
        name: p.name,
        open: tasks.filter((t) => t.assignee_id === p.id && t.status !== 'DONE' && t.status !== 'BACKLOG').length,
        planned: tasks.filter((t) => t.assignee_id === p.id && t.status !== 'DONE').reduce((s, t) => s + Number(t.planned_hours ?? 0), 0),
        actual: tasks.filter((t) => t.assignee_id === p.id && t.status !== 'DONE').reduce((s, t) => s + Number(t.actual_hours ?? 0), 0),
      }))
      .filter((p) => p.open > 0)
      .sort((a, b) => b.open - a.open)
      .slice(0, 10)

    const completed = tasks.filter((t) => t.completed_at)
    const cycleTimes = completed
      .map((t) => cycleTimeDays(t))
      .filter((v): v is number => v !== null)
    const openAging = tasks.filter((t) => t.status !== 'DONE').map((t) => agingDays(t))

    // 8-week completion trend
    const trend = Array.from({ length: 8 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (7 - i) * 7)
      const weekStart = new Date(d)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      return {
        week: weekStart.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
        completed: completed.filter((t) => {
          const c = new Date(t.completed_at!)
          return c >= weekStart && c <= weekEnd
        }).length,
        created: tasks.filter((t) => {
          const c = new Date(t.created_at)
          return c >= weekStart && c <= weekEnd
        }).length,
      }
    })

    return {
      byStatus,
      overdue,
      planned,
      actual,
      open,
      byDepartment,
      byAssignee,
      avgCycleTime: cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0,
      avgAging: openAging.length ? openAging.reduce((a, b) => a + b, 0) / openAging.length : 0,
      completedCount: completed.length,
      trend,
    }
  }, [tasks, departments, profiles])

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE') ?? null
  const activeProgress = activeSprint ? sprintProgress.find((p) => p.sprint_id === activeSprint.id) : null
  const myOpen = tasks.filter((t) => t.assignee_id === profile?.id && t.status !== 'DONE' && t.status !== 'BACKLOG')
  const myBlocked = tasks.filter((t) => t.assignee_id === profile?.id && t.status === 'BLOCKED')

  const pieData = TASK_STATUSES.map((s) => ({ name: STATUS_META[s].label, value: stats.byStatus[s], color: CHART_COLORS[s] })).filter(
    (d) => d.value > 0,
  )

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  const CARDS = [
    { label: 'Total tasks', value: tasks.length, icon: ClipboardList, cls: 'text-slate-200', to: '/board' },
    { label: 'Backlog', value: stats.byStatus.BACKLOG, icon: Inbox, cls: 'text-slate-300', to: '/backlog' },
    { label: 'To do', value: stats.byStatus.TO_DO, icon: CircleDot, cls: 'text-sky-300', to: '/board' },
    { label: 'In progress', value: stats.byStatus.IN_PROGRESS, icon: TrendingUp, cls: 'text-blue-300', to: '/board' },
    { label: 'Review', value: stats.byStatus.REVIEW, icon: Layers, cls: 'text-violet-300', to: '/board' },
    { label: 'Blocked', value: stats.byStatus.BLOCKED, icon: AlertTriangle, cls: 'text-rose-300', to: '/board' },
    { label: 'Done', value: stats.byStatus.DONE, icon: CheckCircle2, cls: 'text-emerald-300', to: '/board' },
    { label: 'Overdue', value: stats.overdue, icon: Hourglass, cls: 'text-orange-300', to: '/board' },
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={`Welcome back${profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}`}
        subtitle="Every figure below is calculated live from the shared PostgreSQL database."
        actions={
          <Link to="/board" className="btn-primary">
            Open board
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {/* ---------------- stat cards ---------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="card group p-3.5 transition hover:border-brand-500/50 hover:bg-surface-200"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
              <c.icon className={clsx('h-4 w-4 shrink-0 opacity-70', c.cls)} />
            </div>
            <p className={clsx('mt-1.5 text-2xl font-bold tabular-nums', c.cls)}>{c.value}</p>
          </Link>
        ))}
      </div>

      {/* ---------------- sprint + personal ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Active sprint"
          description={activeSprint ? `${formatDate(activeSprint.start_date)} → ${formatDate(activeSprint.end_date)}` : undefined}
          actions={
            <Link to="/sprints" className="link text-xs">
              Manage
            </Link>
          }
        >
          {activeSprint && activeProgress ? (
            <div className="space-y-3">
              {isSprintOverdue(activeSprint) && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
                  Overdue — ended {formatDate(activeSprint.end_date, 'dd MMM yyyy')}.{' '}
                  <Link to="/sprints" className="underline">
                    Start a new sprint
                  </Link>{' '}
                  to move this one to history.
                </p>
              )}
              <div>
                <p className="text-base font-semibold text-white">{activeSprint.name}</p>
                {activeSprint.goal && <p className="mt-0.5 text-xs text-slate-400">{activeSprint.goal}</p>}
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>
                    {activeProgress.done_tasks} of {activeProgress.total_tasks} done
                  </span>
                  <span className="tabular-nums">
                    {activeProgress.total_tasks > 0
                      ? Math.round((activeProgress.done_tasks / activeProgress.total_tasks) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <ProgressBar value={activeProgress.done_tasks} max={activeProgress.total_tasks || 1} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="In progress" value={activeProgress.total_tasks - activeProgress.done_tasks - activeProgress.blocked_tasks} />
                <MiniStat label="Blocked" value={activeProgress.blocked_tasks} tone="rose" />
                <MiniStat label="Points" value={activeProgress.planned_hours} suffix="h" />
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No sprint is active right now.</p>
          )}
        </Card>

        <Card title="My work" description={`${myOpen.length} open tasks assigned to you`}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Open" value={myOpen.length} />
              <MiniStat label="Blocked" value={myBlocked.length} tone="rose" />
              <MiniStat label="Overdue" value={myOpen.filter((t) => isOverdue(t.due_date, t.status)).length} tone="amber" />
            </div>
            <ul className="space-y-1.5">
              {myOpen.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/tasks/${t.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-surface-200"
                  >
                    <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[t.status].dot)} />
                    <span className="font-mono text-[10px] text-brand-300">{t.task_key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{t.title}</span>
                  </Link>
                </li>
              ))}
              {myOpen.length === 0 && (
                <li className="py-4 text-center text-xs text-slate-500">Nothing assigned to you right now.</li>
              )}
            </ul>
          </div>
        </Card>

        <Card title="Running timers" description="Live, derived from stored timestamps">
          {activeTimeLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No timers are running.</p>
          ) : (
            <ul className="space-y-2">
              {activeTimeLogs.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 rounded-lg border border-surface-300 bg-surface-50 p-2.5">
                  <Timer className="h-4 w-4 shrink-0 animate-pulse text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/tasks/${t.task_id}`} className="block truncate text-xs font-medium text-slate-200 hover:text-white">
                      {t.task_key} — {t.task_title}
                    </Link>
                    <p className="text-[10px] text-slate-500">
                      {t.segment_type} · started {formatDate(t.start_time, 'dd MMM HH:mm')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-400">
                    {formatHours(t.elapsed_hours)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------- charts ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tasks by status" className="lg:col-span-1">
          {pieData.length === 0 ? (
            <EmptyState title="No tasks yet" description="Create tasks to populate the dashboard." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2}>
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} stroke="#151b28" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1b2333',
                      border: '1px solid #2e3a50',
                      borderRadius: 12,
                      fontSize: 12,
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Tasks by department" className="lg:col-span-2">
          {stats.byDepartment.length === 0 ? (
            <EmptyState title="No department data yet" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byDepartment} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232d40" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#1b2333' }}
                    contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>} />
                  <Bar dataKey="total" name="Total" fill="#3b4860" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inProgress" name="In progress" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="done" name="Done" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blocked" name="Blocked" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Weekly throughput" description="Created vs completed" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232d40" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1b2333', border: '1px solid #2e3a50', borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-400">{v}</span>} />
                <Line type="monotone" dataKey="created" name="Created" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Flow metrics">
          <div className="space-y-3">
            <MetricRow
              icon={<Clock3 className="h-4 w-4" />}
              label="Avg. cycle time"
              value={stats.avgCycleTime > 0 ? `${stats.avgCycleTime.toFixed(1)} days` : 'n/a'}
            />
            <MetricRow
              icon={<Hourglass className="h-4 w-4" />}
              label="Avg. aging (open)"
              value={stats.avgAging > 0 ? `${stats.avgAging.toFixed(1)} days` : 'n/a'}
            />
            <MetricRow
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Completed all time"
              value={String(stats.completedCount)}
            />
            <MetricRow
              icon={<Clock3 className="h-4 w-4" />}
              label="Planned (open work)"
              value={formatHours(stats.planned)}
            />
            <MetricRow
              icon={<Timer className="h-4 w-4" />}
              label="Actual (open work)"
              value={formatHours(stats.actual)}
            />
            <div className="pt-1">
              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                <span>Effort consumed</span>
                <span className="tabular-nums">
                  {stats.planned > 0 ? Math.round((stats.actual / stats.planned) * 100) : 0}%
                </span>
              </div>
              <ProgressBar
                value={stats.actual}
                max={stats.planned || 1}
                barClassName={stats.actual > stats.planned ? 'bg-rose-500' : 'bg-emerald-500'}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Workload — top assignees" description="Open tasks and effort per person" padded={false}>
        {stats.byAssignee.length === 0 ? (
          <EmptyState title="Nothing assigned yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-surface-300">
                  <th className="table-head">Employee</th>
                  <th className="table-head text-right">Open tasks</th>
                  <th className="table-head text-right">Planned</th>
                  <th className="table-head text-right">Actual</th>
                  <th className="table-head w-40">Priority mix</th>
                </tr>
              </thead>
              <tbody>
                {stats.byAssignee.map((a) => {
                  const personTasks = tasks.filter((t) => t.assignee_id && profiles.find((p) => p.id === t.assignee_id)?.name === a.name)
                  return (
                    <tr key={a.name} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                      <td className="table-cell font-medium text-white">{a.name}</td>
                      <td className="table-cell text-right tabular-nums">{a.open}</td>
                      <td className="table-cell text-right tabular-nums">{formatHours(a.planned)}</td>
                      <td className="table-cell text-right tabular-nums">{formatHours(a.actual)}</td>
                      <td className="table-cell">
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-300">
                          {TASK_PRIORITY_ORDER.map((p) => {
                            const count = personTasks.filter((t) => t.priority === p && t.status !== 'DONE').length
                            if (!count) return null
                            return (
                              <div
                                key={p}
                                style={{ width: `${(count / Math.max(1, a.open)) * 100}%` }}
                                className={PRIORITY_META[p].bar}
                                title={`${count} ${PRIORITY_META[p].label}`}
                              />
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const TASK_PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

function MiniStat({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone?: 'rose' | 'amber' }) {
  return (
    <div className="rounded-lg border border-surface-300 bg-surface-50 py-2">
      <p
        className={clsx(
          'text-lg font-bold tabular-nums',
          tone === 'rose' ? 'text-rose-400' : tone === 'amber' ? 'text-amber-400' : 'text-white',
        )}
      >
        {value}
        {suffix}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}

function MetricRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-slate-500">{icon}</span>
      <span className="flex-1 text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
    </div>
  )
}
