import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import clsx from 'clsx'
import { format, isToday, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useData } from '@/context/DataContext'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { startOfWeekIso, endOfWeekIso, addDaysIso } from '@/lib/format'
import type { WorkingCalendarDay, EmployeeCalendarDay } from '@/types/database'
import { Button, Card, Chip, Modal, PageHeader, Select, Skeleton } from '@/components/ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarPage() {
  const { profiles, profile } = useData()
  const toast = useToast()
  const { user } = useAuth()

  const [weekStart, setWeekStart] = useState(() => startOfWeekIso())
  const [workingDays, setWorkingDays] = useState<Record<string, WorkingCalendarDay>>({})
  const [employeeDays, setEmployeeDays] = useState<Record<string, EmployeeCalendarDay>>({})
  const [weekendDays, setWeekendDays] = useState<number[]>([0, 6])
  const [defaultDailyHours, setDefaultDailyHours] = useState(6)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const weekEnd = useMemo(() => endOfWeekIso(parseISO(weekStart)), [weekStart])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  )

  const isAdmin = profile?.role === 'ADMIN'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [wc, ec, settings] = await Promise.all([
        api.listWorkingCalendar(weekStart, weekEnd),
        api.listEmployeeCalendar(weekStart, weekEnd),
        api.listSettings(),
      ])
      const wcMap: Record<string, WorkingCalendarDay> = {}
      for (const d of wc) wcMap[d.calendar_date] = d
      const ecMap: Record<string, EmployeeCalendarDay> = {}
      for (const d of ec) ecMap[`${d.user_id}:${d.calendar_date}`] = d
      setWorkingDays(wcMap)
      setEmployeeDays(ecMap)

      // The working week is a System Admin setting, never hardcoded here.
      const weekend = settings.weekend_days
      if (Array.isArray(weekend)) {
        setWeekendDays(weekend.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))
      }
      const daily = Number(settings.default_daily_hours)
      if (Number.isFinite(daily) && daily > 0) setDefaultDailyHours(daily)
    } catch (err) {
      toast.error('Could not load the calendar', err instanceof Error ? err.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [weekStart, weekEnd, toast])

  useEffect(() => {
    void load()
  }, [load])

  // Precedence: per-employee override > per-date org override > admin weekend setting.
  const isWorking = (iso: string, userId?: string) => {
    const empDay = userId ? employeeDays[`${userId}:${iso}`] : undefined
    if (empDay) return empDay.is_available
    const orgDay = workingDays[iso]
    if (orgDay) return orgDay.is_working_day
    return !weekendDays.includes(parseISO(iso).getDay())
  }

  const toggleOrgDay = async (iso: string) => {
    if (!isAdmin) return
    const current = isWorking(iso)
    try {
      const saved = await api.upsertWorkingDay(iso, !current, !current ? 'Holiday' : null)
      setWorkingDays((prev) => ({ ...prev, [iso]: saved }))
      toast.success('Calendar updated', `${format(parseISO(iso), 'EEE dd MMM')} is now ${saved.is_working_day ? 'a working day' : 'a non-working day'}.`)
    } catch (err) {
      toast.error('Could not update the calendar', err instanceof Error ? err.message : undefined)
      await load()
    }
  }

  const saveEmployeeDay = async (userId: string, iso: string, isAvailable: boolean) => {
    if (!user) return
    try {
      const saved = await api.upsertEmployeeDay({
        user_id: userId,
        calendar_date: iso,
        is_available: isAvailable,
        hours: null,
        reason: isAvailable ? null : 'Marked as unavailable',
      })
      setEmployeeDays((prev) => ({ ...prev, [`${userId}:${iso}`]: saved }))
      toast.success('Availability saved')
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
      await load()
    }
  }

  const myDailyHours = profile?.daily_working_hours ?? defaultDailyHours
  const weekCapacity = useMemo(() => {
    const count = days.filter((d) => isWorking(d, user?.id)).length
    const hours = Math.round(count * myDailyHours * 100) / 100
    return { days: count, hours }
  }, [days, workingDays, employeeDays, weekendDays, user?.id, myDailyHours])

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Working Calendar"
        subtitle="Holidays, weekends and employee availability. These values drive every capacity calculation."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border border-surface-400 p-0.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs font-medium tabular-nums text-slate-300">
                {format(parseISO(weekStart), 'dd MMM')} – {format(parseISO(weekEnd), 'dd MMM yyyy')}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeekIso())}>
              This week
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Working days (org)', value: days.filter((d) => isWorking(d)).length },
          { label: 'Working days (you)', value: weekCapacity.days },
          { label: 'Your daily hours', value: myDailyHours },
          { label: 'Your weekly capacity', value: `${weekCapacity.hours}h` },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <p className="text-xl font-bold tabular-nums text-white">{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {isAdmin && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Save className="h-3.5 w-3.5" />
          You are an administrator: click a day to toggle working / holiday for the whole organisation.
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((iso, idx) => {
            const date = parseISO(iso)
            const working = isWorking(iso)
            const myOverride = user ? employeeDays[`${user.id}:${iso}`] : undefined
            return (
              <button
                key={iso}
                onClick={() => (isAdmin ? void toggleOrgDay(iso) : setSelected(iso))}
                className={clsx(
                  'flex min-h-[7rem] flex-col rounded-xl border p-2 text-left transition sm:min-h-[9rem] sm:p-3',
                  working
                    ? 'border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/50'
                    : 'border-surface-300 bg-surface-100/60 hover:border-rose-500/40',
                  isToday(date) && 'ring-2 ring-brand-500/60',
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {WEEKDAYS[idx]}
                </span>
                <span className={clsx('mt-0.5 text-lg font-bold tabular-nums', isToday(date) ? 'text-brand-300' : 'text-white')}>
                  {format(date, 'd')}
                </span>
                <span
                  className={clsx(
                    'mt-1.5 text-[10px] font-medium',
                    working ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {workingDays[iso]?.label ?? (working ? 'Working' : 'Off')}
                </span>
                {myOverride && (
                  <Chip
                    className={clsx(
                      'mt-1',
                      myOverride.is_available
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                    )}
                  >
                    You: {myOverride.is_available ? 'available' : 'away'}
                  </Chip>
                )}
                {!isAdmin && <span className="mt-auto text-[10px] text-slate-600">Tap for options</span>}
              </button>
            )
          })}
        </div>
      )}

      <Card title="Team availability this week" className="mt-5" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">Employee</th>
                {days.map((iso, i) => (
                  <th key={iso} className="table-head text-center">
                    {WEEKDAYS[i]}
                    <span className="ml-1 text-slate-600">{iso.slice(8)}</span>
                  </th>
                ))}
                <th className="table-head text-right">Available days</th>
              </tr>
            </thead>
            <tbody>
              {profiles
                .filter((p) => p.active)
                .map((p) => {
                  const available = days.filter((d) => isWorking(d, p.id)).length
                  return (
                    <tr key={p.id} className="border-b border-surface-200/60 last:border-0">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              'h-2 w-2 rounded-full',
                              p.id === user?.id ? 'bg-brand-400' : 'bg-surface-500',
                            )}
                          />
                          <span className="truncate font-medium text-white">{p.name}</span>
                          {p.id === user?.id && <span className="text-[10px] text-slate-500">(you)</span>}
                        </div>
                      </td>
                      {days.map((iso) => {
                        const override = employeeDays[`${p.id}:${iso}`]
                        const w = isWorking(iso, p.id)
                        return (
                          <td key={iso} className="table-cell text-center">
                            <span
                              className={clsx(
                                'inline-block h-2.5 w-2.5 rounded-full',
                                override && !override.is_available
                                  ? 'bg-rose-500'
                                  : w
                                    ? 'bg-emerald-500'
                                    : 'bg-surface-500',
                              )}
                              title={override?.reason ?? (w ? 'Working' : 'Off')}
                            />
                          </td>
                        )
                      })}
                      <td className="table-cell text-right font-semibold tabular-nums text-white">
                        {available}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? format(parseISO(selected), 'EEEE dd MMMM yyyy') : ''}
        description="Set your own availability for this day."
        size="sm"
      >
        {selected && user && (
          <div className="space-y-3">
            <Button
              className="w-full"
              variant="secondary"
              onClick={async () => {
                await saveEmployeeDay(user.id, selected, true)
                setSelected(null)
              }}
            >
              Mark me as available
            </Button>
            <Button
              className="w-full"
              variant="danger"
              onClick={async () => {
                await saveEmployeeDay(user.id, selected, false)
                setSelected(null)
              }}
            >
              Mark me as on leave / unavailable
            </Button>
            <Select
              className="w-full"
              value={employeeDays[`${user.id}:${selected}`] ? 'override' : 'org'}
              onChange={() => undefined}
              disabled
            >
              <option value="org">Following the organisation calendar</option>
            </Select>
            <p className="text-xs text-slate-500">
              Availability affects your personal capacity calculation. Organisation-wide holidays can only be
              changed by a System Admin.
            </p>
          </div>
        )}
      </Modal>

      {!profiles.some((p) => p.active) && (
        <p className="mt-6 text-center text-xs text-slate-600">
          <CalendarDays className="mx-auto mb-2 h-5 w-5" />
          No employees yet. Invite them from the Administration page.
        </p>
      )}
    </div>
  )
}

