import { useState } from 'react'
import { KeyRound, Save, ShieldCheck, Timer, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { useToast } from '@/context/ToastContext'
import { api } from '@/lib/api'
import { ROLE_META } from '@/lib/constants'
import { formatDateTime, formatHours, formatTimer, relativeTime } from '@/lib/format'
import { Avatar, Button, Card, Chip, Field, Input, PageHeader } from '@/components/ui'
import { useEffect } from 'react'

export default function ProfilePage() {
  const { profile, user, updatePassword, refreshProfile } = useAuth()
  const { departments, departmentById, activeTimeLogs, tasks } = useData()
  const toast = useToast()

  const [name, setName] = useState(profile?.name ?? '')
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saving, setSaving] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setJobTitle(profile.job_title ?? '')
      setPhone(profile.phone ?? '')
    }
  }, [profile])

  if (!profile) return null

  const myTasks = tasks.filter((t) => t.assignee_id === profile.id)
  const myTimers = activeTimeLogs.filter((t) => t.user_id === profile.id)
  const totalLogged = myTasks.reduce((s, t) => s + Number(t.actual_hours ?? 0), 0)
  const totalPlanned = myTasks.filter((t) => t.status !== 'DONE').reduce((s, t) => s + Number(t.planned_hours ?? 0), 0)

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateProfile(profile.id, {
        name: name.trim(),
        job_title: jobTitle.trim() || null,
        phone: phone.trim() || null,
      })
      await refreshProfile()
      toast.success('Profile saved')
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setPwError('Use at least 8 characters')
      return
    }
    if (password !== confirmPw) {
      setPwError('Passwords do not match')
      return
    }
    setPwError('')
    setPwBusy(true)
    try {
      await updatePassword(password)
      setPassword('')
      setConfirmPw('')
      toast.success('Password changed', 'Use the new password the next time you sign in.')
    } catch (err) {
      toast.error('Could not change the password', err instanceof Error ? err.message : undefined)
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <PageHeader title="My profile" subtitle="Your account details, permissions and time record." />

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={profile.name} id={profile.id} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white">{profile.name}</h2>
            <p className="text-sm text-slate-400">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip className={ROLE_META[profile.role].chip}>{ROLE_META[profile.role].label}</Chip>
              {profile.department_id && (
                <Chip className="border-surface-400 bg-surface-200 text-slate-300">
                  {departmentById(profile.department_id)?.name ?? 'Unknown department'}
                </Chip>
              )}
              <Chip
                className={
                  profile.active
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }
              >
                {profile.active ? 'Active' : 'Inactive'}
              </Chip>
            </div>
            <p className="mt-2 text-xs text-slate-500">{ROLE_META[profile.role].description}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Assigned tasks', value: myTasks.filter((t) => t.status !== 'DONE').length },
          { label: 'Completed', value: myTasks.filter((t) => t.status === 'DONE').length },
          { label: 'Planned hours', value: formatHours(totalPlanned) },
          { label: 'Logged hours', value: formatHours(totalLogged) },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <p className="text-xl font-bold tabular-nums text-white">{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {myTimers.length > 0 && (
        <Card title="Running timers" description="Calculated from timestamps stored in PostgreSQL.">
          <ul className="space-y-2">
            {myTimers.map((t) => {
              const seconds = Math.max(0, Math.floor((now - new Date(t.start_time).getTime()) / 1000))
              return (
                <li key={t.id} className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <Timer className="h-4 w-4 shrink-0 animate-pulse text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {t.task_key} — {t.task_title}
                    </p>
                    <p className="text-[11px] text-slate-500">Started {formatDateTime(t.start_time)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-emerald-400">
                    {formatTimer(seconds)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Personal details">
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Full name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Job title">
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Engineer" />
            </Field>
            <Field label="Phone" hint="Optional, for internal coordination.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
            </Field>
            <Field label="Email" hint="Only a System Admin can change your email address.">
              <Input value={profile.email} disabled />
            </Field>
            <Field
              label="Working hours"
              hint="Daily hours and working days are set by an administrator because they drive team capacity."
            >
              <div className="flex gap-2">
                <Input value={`${profile.daily_working_hours} h/day`} disabled className="flex-1" />
                <Input value={`${profile.weekly_working_days} days/week`} disabled className="flex-1" />
              </div>
            </Field>
            <Field label="Department" hint="Only a System Admin can move you between departments.">
              <Input
                value={departments.find((d) => d.id === profile.department_id)?.name ?? 'No department'}
                disabled
              />
            </Field>
            <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
              Save changes
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card title="Change password">
            <form onSubmit={savePassword} className="space-y-4">
              <Field label="New password" required hint="Minimum 8 characters.">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm new password" required error={pwError}>
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  invalid={Boolean(pwError)}
                />
              </Field>
              <Button type="submit" loading={pwBusy} icon={<KeyRound className="h-4 w-4" />}>
                Update password
              </Button>
            </form>
          </Card>

          <Card title="Account information">
            <dl className="space-y-2.5 text-sm">
              {[
                { label: 'User ID', value: profile.id },
                { label: 'Joined', value: relativeTime(profile.created_at) },
                { label: 'Last updated', value: relativeTime(profile.updated_at) },
                { label: 'Last seen', value: profile.last_seen_at ? relativeTime(profile.last_seen_at) : 'Not recorded' },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3">
                  <dt className="text-xs text-slate-500">{r.label}</dt>
                  <dd className="truncate font-mono text-[11px] text-slate-400">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Your permissions">
            <ul className="space-y-2 text-xs text-slate-400">
              {[
                { ok: profile.can_create_tasks, label: 'Can create tasks' },
                { ok: profile.can_assign_tasks, label: 'Can assign work to others' },
                { ok: profile.role !== 'EMPLOYEE', label: 'Can manage sprint activity' },
                { ok: profile.role === 'ADMIN', label: 'Can manage users, departments and settings' },
              ].map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  <ShieldCheck
                    className={p.ok ? 'h-3.5 w-3.5 shrink-0 text-emerald-400' : 'h-3.5 w-3.5 shrink-0 text-slate-600'}
                  />
                  <span className={p.ok ? '' : 'text-slate-600'}>{p.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-600">
              These are enforced by PostgreSQL Row Level Security. Changing them in the interface is not possible and
              attempting it through the API is rejected by the database.
            </p>
          </Card>

          <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-600">
            <User className="h-3.5 w-3.5" />
            Your session is managed by Supabase Auth and refreshes automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
