import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Loader2, Play, Square } from 'lucide-react'
import { useData } from '@/context/DataContext'
import { useToast, useConfirm } from '@/context/ToastContext'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { Sprint } from '@/types/database'
import { Button, Field, Input, Modal } from '@/components/ui'

const today = () => new Date().toISOString().slice(0, 10)

const addDays = (from: string, days: number) => {
  const d = new Date(`${from}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const PRESETS: { label: string; days: number }[] = [
  { label: '1 week', days: 6 },
  { label: '2 weeks', days: 13 },
  { label: '4 weeks', days: 27 },
]

export function SprintControl() {
  const { sprints, canManageSprints, loading, refresh, refreshTasks, refreshAuditLogs } = useData()
  const toast = useToast()
  const { confirm } = useConfirm()

  const active = useMemo(() => sprints.find((s) => s.status === 'ACTIVE') ?? null, [sprints])
  const planned = useMemo(() => sprints.filter((s) => s.status !== 'COMPLETED'), [sprints])

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sprintId, setSprintId] = useState<string>('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(addDays(today(), 11))

  useEffect(() => {
    if (!open) return
    if (active) {
      setSprintId(active.id)
      setStartDate(active.start_date ?? today())
      setEndDate(active.end_date ?? addDays(active.start_date ?? today(), 11))
    } else {
      const next = planned[0]?.id ?? ''
      setSprintId(next)
      setStartDate(today())
      setEndDate(addDays(today(), 11))
    }
  }, [open, active, planned])

  const selected = useMemo(() => sprints.find((s) => s.id === sprintId) ?? null, [sprints, sprintId])
  const rangeError = endDate && startDate && endDate < startDate
  const otherActive = active && selected && active.id !== selected.id ? active : null

  const applyPreset = (days: number) => {
    const from = startDate || today()
    setStartDate(from)
    setEndDate(addDays(from, days))
  }

  const persist = async (status: 'ACTIVE' | 'COMPLETED') => {
    if (rangeError) {
      toast.error('End date cannot be before the start date')
      return
    }
    setBusy(true)
    try {
      if (otherActive) {
        const ok = await confirm({
          title: `Complete "${otherActive.name}" first?`,
          description: `Only one sprint can be active at a time, so "${otherActive.name}" will be completed before "${selected?.name}" starts.`,
          confirmLabel: 'Complete it and start the new sprint',
        })
        if (!ok) {
          setBusy(false)
          return
        }
        await api.updateSprint(otherActive.id, {
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
        })
      }
      if (status === 'ACTIVE') {
        if (selected) {
          await api.updateSprint(selected.id, { status: 'ACTIVE', start_date: startDate, end_date: endDate, completed_at: null })
        } else {
          await api.createSprint({
            name: `Sprint ${sprints.filter((s) => /^Sprint \d+$/.test(s.name)).length + 1}`,
            start_date: startDate,
            end_date: endDate,
            status: 'ACTIVE',
          })
        }
      } else if (selected) {
        await api.updateSprint(selected.id, { status: 'COMPLETED', completed_at: new Date().toISOString() })
      }
      toast.success(status === 'ACTIVE' ? 'Sprint started' : 'Sprint completed')
      setOpen(false)
      await refresh()
      await refreshTasks()
      await refreshAuditLogs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the sprint')
    } finally {
      setBusy(false)
    }
  }

  if (!canManageSprints) return null

  const label = loading
    ? 'Sprint'
    : active
      ? `${active.name} · ${formatDate(active.start_date, 'd MMM')} – ${formatDate(active.end_date, 'd MMM')}`
      : 'No active sprint'

  return (
    <>
      <Button
        size="sm"
        variant={active ? 'primary' : 'secondary'}
        icon={<CalendarRange className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sprint control"
        description="Pick the sprint dates on the calendar, then start or stop it."
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {active && (
              <Button
                variant="danger"
                size="sm"
                icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                onClick={() => void persist('COMPLETED')}
                disabled={busy}
              >
                Stop sprint
              </Button>
            )}
            <Button
              size="sm"
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              onClick={() => void persist('ACTIVE')}
              disabled={busy || Boolean(rangeError)}
            >
              Start sprint
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div
            className={
              active
                ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200'
                : 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'
            }
          >
            {active ? (
              <>
                <span className="font-semibold">{active.name} is active</span>
                <span className="ml-1 text-slate-300">
                  {formatDate(active.start_date, 'dd MMM yyyy')} to {formatDate(active.end_date, 'dd MMM yyyy')}
                </span>
              </>
            ) : (
              <span className="font-semibold">No active sprint. Nothing is running until you press Start sprint.</span>
            )}
          </div>

          <Field label="Sprint" hint={planned.length ? 'Existing non-completed sprints' : 'A new sprint will be created'}>
            <select
              value={sprintId}
              onChange={(e) => {
                setSprintId(e.target.value)
                const s = sprints.find((x) => x.id === e.target.value)
                if (s?.start_date) {
                  setStartDate(s.start_date)
                  setEndDate(s.end_date ?? addDays(s.start_date, 11))
                }
              }}
              className="input"
            >
              {planned.length === 0 && <option value="">Create a new sprint</option>}
              {planned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.start_date ? ` (${formatDate(s.start_date, 'd MMM')} – ${formatDate(s.end_date, 'd MMM')})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date" invalid={Boolean(rangeError)}>
              <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          {rangeError && <p className="text-xs text-rose-400">The end date is before the start date.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Quick length</span>
            {PRESETS.map((p) => (
              <Button key={p.days} variant="ghost" size="sm" onClick={() => applyPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>

          <p className="rounded-lg border border-surface-300 bg-surface-200 px-3 py-2 text-xs text-slate-400">
            The status only changes when you press Start or Stop. The calendar dates never change the status on their own, so
            a sprint cannot quietly become active because a date passed.
          </p>
        </div>
      </Modal>
    </>
  )
}

export type { Sprint }
