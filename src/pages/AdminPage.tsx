import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  History,
  Plus,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  Ban,
  CheckCircle2,
  Copy,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useToast, useConfirm } from '@/context/ToastContext'
import { api } from '@/lib/api'
import { APP_ROLES, AUDIT_ACTION_LABELS, ROLE_META } from '@/lib/constants'
import { formatDate, formatDateTime, titleCase } from '@/lib/format'
import type { AppRole, AuditLog, Department, PendingInvite, Profile } from '@/types/database'
import { Avatar, Button, Card, Chip, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from '@/components/ui'

type Tab = 'users' | 'departments' | 'audit' | 'settings'

export default function AdminPage() {
  const { profile, refresh, refreshAuditLogs, auditLogs } = useData()
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<Tab>('users')
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [userModal, setUserModal] = useState(false)
  const [deptModal, setDeptModal] = useState(false)
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  const isAdmin = profile?.role === 'ADMIN'

  const load = async () => {
    setLoading(true)
    try {
      const [d, p, s] = await Promise.all([api.listDepartments(), api.listProfiles(), api.listSettings()])
      setDepartments(d)
      setProfiles(p)
      setSettings(s)
      // Keep the shared app state in sync so a role or department change is
      // reflected on the board, in filters and in the sidebar immediately.
      await refresh()
      await refreshAuditLogs()
    } catch (err) {
      toast.error('Could not load administration data', err instanceof Error ? err.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="card">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Administration is restricted"
            description="Only System Admins can manage users, departments, roles and audit logs. This restriction is also enforced by Row Level Security in PostgreSQL, not just in the interface."
          />
        </div>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'users', label: 'Users & roles', icon: Users },
    { key: 'departments', label: 'Departments', icon: Building2 },
    { key: 'audit', label: 'Audit log', icon: History },
    { key: 'settings', label: 'System settings', icon: Settings2 },
  ]

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Administration"
        subtitle="System configuration. Every change here is recorded in the append-only audit log."
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === t.key ? 'bg-surface-300 text-white' : 'text-slate-400 hover:bg-surface-200',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : tab === 'users' ? (
        <UsersTab
          profiles={profiles}
          departments={departments}
          onChanged={load}
          onInvite={() => setUserModal(true)}
          currentUserId={user?.id}
        />
      ) : tab === 'departments' ? (
        <DepartmentsTab departments={departments} profiles={profiles} onChanged={load} onCreate={() => setDeptModal(true)} />
      ) : tab === 'audit' ? (
        <AuditTab logs={auditLogs} profiles={profiles} />
      ) : (
        <SettingsTab settings={settings} onChanged={load} />
      )}

      <InviteUserModal open={userModal} onClose={() => setUserModal(false)} departments={departments} onDone={load} />
      <CreateDepartmentModal open={deptModal} onClose={() => setDeptModal(false)} profiles={profiles} onDone={load} />
    </div>
  )
}

/* ========================================================================== */
/* Users                                                                      */
/* ========================================================================== */
function UsersTab({
  profiles,
  departments,
  onChanged,
  onInvite,
  currentUserId,
}: {
  profiles: Profile[]
  departments: Department[]
  onChanged: () => Promise<void>
  onInvite: () => void
  currentUserId?: string
}) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [savingId, setSavingId] = useState<string | null>(null)

  const update = async (id: string, patch: Partial<Profile>, message: string) => {
    setSavingId(id)
    try {
      await api.updateProfile(id, patch)
      toast.success(message)
      await onChanged()
    } catch (err) {
      toast.error('Could not update', err instanceof Error ? err.message : undefined)
      await onChanged()
    } finally {
      setSavingId(null)
    }
  }

  const toggleActive = async (p: Profile) => {
    const ok = await confirm({
      title: p.active ? `Deactivate ${p.name}?` : `Reactivate ${p.name}?`,
      description: p.active
        ? 'They will be signed out and will not be able to sign in again until reactivated.'
        : 'They will be able to sign in again immediately.',
      confirmLabel: p.active ? 'Deactivate' : 'Reactivate',
      danger: p.active,
    })
    if (!ok) return
    await update(p.id, { active: !p.active }, p.active ? 'User deactivated' : 'User reactivated')
  }

  return (
    <>
      {dialog}
      <Card
        title={`Users (${profiles.length})`}
        description="Role and department decide what each person can do. Both are enforced by the database."
        actions={
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onInvite}>
            Invite user
          </Button>
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">Employee</th>
                <th className="table-head">Role</th>
                <th className="table-head">Department</th>
                <th className="table-head text-right">Daily hours</th>
                <th className="table-head">Create</th>
                <th className="table-head">Assign</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                  <td className="table-cell">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name} id={p.id} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {p.name}
                          {p.id === currentUserId && <span className="ml-1.5 text-[10px] text-brand-300">you</span>}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <Select
                      value={p.role}
                      disabled={savingId === p.id}
                      onChange={(e) => void update(p.id, { role: e.target.value as AppRole }, 'Role updated')}
                      className="h-8 w-40 py-1 text-xs"
                    >
                      {APP_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_META[r].label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="table-cell">
                    <Select
                      value={p.department_id ?? ''}
                      disabled={savingId === p.id}
                      onChange={(e) => void update(p.id, { department_id: e.target.value || null }, 'Department updated')}
                      className="h-8 w-44 py-1 text-xs"
                    >
                      <option value="">None</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="table-cell text-right">
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      defaultValue={p.daily_working_hours}
                      disabled={savingId === p.id}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== p.daily_working_hours && !Number.isNaN(v)) void update(p.id, { daily_working_hours: v }, 'Working hours updated')
                      }}
                      className="h-8 w-20 py-1 text-right text-xs"
                    />
                  </td>
                  <td className="table-cell text-center">
                    <input
                      type="checkbox"
                      checked={p.can_create_tasks}
                      onChange={(e) => void update(p.id, { can_create_tasks: e.target.checked }, 'Permission updated')}
                      className="h-4 w-4 cursor-pointer rounded border-surface-400 bg-surface-50 accent-brand-500"
                    />
                  </td>
                  <td className="table-cell text-center">
                    <input
                      type="checkbox"
                      checked={p.can_assign_tasks}
                      onChange={(e) => void update(p.id, { can_assign_tasks: e.target.checked }, 'Permission updated')}
                      className="h-4 w-4 cursor-pointer rounded border-surface-400 bg-surface-50 accent-brand-500"
                    />
                  </td>
                  <td className="table-cell">
                    <Chip
                      className={p.active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}
                    >
                      {p.active ? 'Active' : 'Inactive'}
                    </Chip>
                  </td>
                  <td className="table-cell text-right">
                    <Button size="sm" variant="ghost" onClick={() => void toggleActive(p)}>
                      {p.active ? <Ban className="h-3.5 w-3.5 text-rose-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PendingInvitesCard onChanged={onChanged} />
    </>
  )
}

/** Invitations that have been recorded but not yet claimed at sign-up. */
function PendingInvitesCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const { departments } = useData()
  const [invites, setInvites] = useState<PendingInvite[]>([])

  useEffect(() => {
    void api
      .listInvites()
      .then(setInvites)
      .catch(() => {
        /* the users table above is still useful without this */
      })
  }, [])

  const removeInvite = async (invite: PendingInvite) => {
    const ok = await confirm({
      title: `Withdraw the invitation for ${invite.email}?`,
      description: 'They will sign up as a normal Employee with no department.',
      confirmLabel: 'Withdraw invitation',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteInvite(invite.id)
      setInvites((prev) => prev.filter((i) => i.id !== invite.id))
      toast.success('Invitation withdrawn')
      await onChanged()
    } catch (err) {
      toast.error('Could not withdraw', err instanceof Error ? err.message : undefined)
    }
  }

  if (invites.length === 0) return null

  return (
    <>
      {dialog}
      <Card
        title={`Pending invitations (${invites.length})`}
        description="The role and department are applied automatically the first time this person signs up with the matching email."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr>
                <th className="table-head">Email</th>
                <th className="table-head">Role</th>
                <th className="table-head">Department</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td className="table-cell">
                    <p className="font-medium text-white">{i.full_name || i.email.split('@')[0]}</p>
                    <p className="text-[11px] text-slate-500">{i.email}</p>
                  </td>
                  <td className="table-cell">
                    <Chip className={ROLE_META[i.role].chip}>{ROLE_META[i.role].label}</Chip>
                  </td>
                  <td className="table-cell text-slate-400">
                    {departments.find((d) => d.id === i.department_id)?.name ?? '—'}
                  </td>
                  <td className="table-cell">
                    <Chip
                      className={
                        i.accepted_at
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }
                    >
                      {i.accepted_at ? `Joined ${formatDate(i.accepted_at)}` : 'Awaiting sign-up'}
                    </Chip>
                  </td>
                  <td className="table-cell text-right">
                    {!i.accepted_at && (
                      <Button size="sm" variant="ghost" onClick={() => void removeInvite(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
function DepartmentsTab({
  departments,
  profiles,
  onChanged,
  onCreate,
}: {
  departments: Department[]
  profiles: Profile[]
  onChanged: () => Promise<void>
  onCreate: () => void
}) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const { tasks } = useData()

  const rename = async (d: Department, name: string) => {
    if (!name.trim() || name === d.name) return
    try {
      await api.updateDepartment(d.id, { name: name.trim() })
      toast.success('Department renamed')
      await onChanged()
    } catch (err) {
      toast.error('Could not rename', err instanceof Error ? err.message : undefined)
    }
  }

  const remove = async (d: Department) => {
    const ok = await confirm({
      title: `Delete "${d.name}"?`,
      description: 'Tasks keep working but lose their department. Consider deactivating it instead.',
      confirmLabel: 'Delete department',
    })
    if (!ok) return
    try {
      await api.deleteDepartment(d.id)
      toast.success('Department deleted')
      await onChanged()
    } catch (err) {
      toast.error('Could not delete', err instanceof Error ? err.message : undefined)
    }
  }

  return (
    <>
      {dialog}
      <Card
        title={`Departments (${departments.length})`}
        description="Fully configurable — nothing about departments is hardcoded in the application."
        actions={
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onCreate}>
            New department
          </Button>
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem]">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="table-head">Department</th>
                <th className="table-head">Head</th>
                <th className="table-head text-right">Members</th>
                <th className="table-head text-right">Tasks</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-b border-surface-200/60 last:border-0 hover:bg-surface-200/40">
                  <td className="table-cell">
                    <Input
                      defaultValue={d.name}
                      onBlur={(e) => void rename(d, e.target.value)}
                      className="h-8 w-56 py-1 text-sm"
                    />
                    {d.code && <span className="mt-0.5 block text-[10px] text-slate-500">{d.code}</span>}
                  </td>
                  <td className="table-cell">
                    <Select
                      value={d.head_user_id ?? ''}
                      onChange={async (e) => {
                        try {
                          await api.updateDepartment(d.id, { head_user_id: e.target.value || null })
                          toast.success('Department head updated')
                          await onChanged()
                        } catch (err) {
                          toast.error('Could not update', err instanceof Error ? err.message : undefined)
                        }
                      }}
                      className="h-8 w-48 py-1 text-xs"
                    >
                      <option value="">No head assigned</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    {profiles.filter((p) => p.department_id === d.id).length}
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    {tasks.filter((t) => t.department_id === d.id).length}
                  </td>
                  <td className="table-cell">
                    <button
                      onClick={async () => {
                        try {
                          await api.updateDepartment(d.id, { active: !d.active })
                          await onChanged()
                        } catch (err) {
                          toast.error('Could not update', err instanceof Error ? err.message : undefined)
                        }
                      }}
                    >
                      <Chip
                        className={
                          d.active
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                        }
                      >
                        {d.active ? 'Active' : 'Inactive'}
                      </Chip>
                    </button>
                  </td>
                  <td className="table-cell text-right">
                    <Button size="sm" variant="ghost" onClick={() => void remove(d)}>
                      <Ban className="h-3.5 w-3.5 text-rose-400" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ========================================================================== */
/* Audit                                                                      */
/* ========================================================================== */
function AuditTab({ logs, profiles }: { logs: AuditLog[]; profiles: Profile[] }) {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false
      if (!q) return true
      const who = profiles.find((p) => p.id === l.user_id)?.name ?? ''
      return `${l.action} ${l.entity_type} ${who} ${JSON.stringify(l.new_value ?? {})}`.toLowerCase().includes(q)
    })
  }, [logs, actionFilter, search, profiles])

  return (
    <Card
      title={`Audit log (${logs.length})`}
      description="Append-only. Triggers in PostgreSQL reject any UPDATE or DELETE, even from an admin connection."
      padded={false}
    >
      <div className="flex flex-col gap-2 border-b border-surface-300 p-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the audit log…"
          className="flex-1"
        />
        <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="sm:w-64">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {AUDIT_ACTION_LABELS[a] ?? a}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="No audit records yet" description="Actions appear here as soon as the system is used." />
      ) : (
        <div className="max-h-[36rem] overflow-y-auto">
          <table className="w-full min-w-[44rem]">
            <thead className="sticky top-0 bg-surface-100">
              <tr className="border-b border-surface-300">
                <th className="table-head">When</th>
                <th className="table-head">User</th>
                <th className="table-head">Action</th>
                <th className="table-head">Entity</th>
                <th className="table-head">Change</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const who = profiles.find((p) => p.id === l.user_id)
                return (
                  <tr key={l.id} className="border-b border-surface-200/60 last:border-0">
                    <td className="table-cell whitespace-nowrap text-xs text-slate-500">{formatDateTime(l.created_at)}</td>
                    <td className="table-cell whitespace-nowrap text-xs">{who?.name ?? 'System'}</td>
                    <td className="table-cell">
                      <span className="text-xs font-medium text-slate-200">
                        {AUDIT_ACTION_LABELS[l.action] ?? titleCase(l.action.toLowerCase())}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-slate-500">
                      {l.entity_type}
                      {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ''}
                    </td>
                    <td className="table-cell text-[11px] text-slate-500">
                      {l.old_value || l.new_value ? (
                        <span className="break-all">
                          {l.old_value ? JSON.stringify(l.old_value).slice(0, 60) : '—'} →{' '}
                          {l.new_value ? JSON.stringify(l.new_value).slice(0, 60) : '—'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/* ========================================================================== */
/* Settings                                                                   */
/* ========================================================================== */
function SettingsTab({ settings, onChanged }: { settings: Record<string, unknown>; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [prefix, setPrefix] = useState(String(settings.task_key_prefix ?? 'TF'))
  const [dailyHours, setDailyHours] = useState(String(settings.default_daily_hours ?? 6))
  const [weeklyDays, setWeeklyDays] = useState(String(settings.default_weekly_days ?? 5))
  const [weekend, setWeekend] = useState<string[]>((settings.weekend_days as string[]) ?? ['0', '6'])

  const save = async (key: string, value: unknown, label: string) => {
    try {
      await api.updateSetting(key, value)
      toast.success(`${label} saved`)
      await onChanged()
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Task identifiers">
        <Field label="Task key prefix" hint={`New tasks will be numbered ${prefix || 'TF'}-1, ${prefix || 'TF'}-2, …`}>
          <div className="flex gap-2">
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 6))} className="w-32" />
            <Button variant="secondary" onClick={() => void save('task_key_prefix', prefix || 'TF', 'Prefix')}>
              Save
            </Button>
          </div>
        </Field>
        <p className="mt-3 text-[11px] text-slate-500">
          Existing task IDs never change — they stay permanently attached to their task.
        </p>
      </Card>

      <Card title="Capacity defaults">
        <div className="space-y-3">
          <Field label="Default daily working hours">
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
                className="w-28"
              />
              <Button variant="secondary" onClick={() => void save('default_daily_hours', Number(dailyHours) || 6, 'Daily hours')}>
                Save
              </Button>
            </div>
          </Field>
          <Field label="Default working days per week">
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={7}
                value={weeklyDays}
                onChange={(e) => setWeeklyDays(e.target.value)}
                className="w-28"
              />
              <Button variant="secondary" onClick={() => void save('default_weekly_days', Number(weeklyDays) || 5, 'Working days')}>
                Save
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Working week">
        <div className="flex flex-wrap gap-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => {
            const iso = String(i === 6 ? 0 : i + 1)
            const active = weekend.includes(iso)
            return (
              <button
                key={d}
                onClick={() => {
                  const next = active ? weekend.filter((x) => x !== iso) : [...weekend, iso]
                  setWeekend(next)
                  void save('weekend_days', next, 'Working week')
                }}
                className={clsx(
                  'rounded-lg border px-3 py-2 text-xs font-medium transition',
                  active
                    ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Days marked in red are non-working by default. Individual holidays can be set on the Calendar page.
        </p>
      </Card>

      <Card title="Database & security">
        <ul className="space-y-2 text-xs text-slate-400">
          {[
            'Row Level Security is enabled on every table.',
            'audit_logs rejects UPDATE and DELETE at the database level.',
            'Task keys are immutable — enforced by a trigger.',
            'A user can never change their own role, department or permissions.',
            'Only one sprint can be ACTIVE per department (partial unique index).',
            'Duplicate active timers per task and user are impossible.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg border border-surface-300 bg-surface-50 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Invite a teammate
          </p>
          <p className="text-xs text-slate-400">
            Send them the sign-up link on the login page, then set their role and department on this page.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(window.location.origin + '/login')
              toast.success('Link copied', 'Paste it into your team chat or email.')
            }}
          >
            Copy sign-up link
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ========================================================================== */
/* Modals                                                                     */
/* ========================================================================== */
function InviteUserModal({
  open,
  onClose,
  departments,
  onDone,
}: {
  open: boolean
  onClose: () => void
  departments: Department[]
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const { refresh } = useData()
  const [form, setForm] = useState({ name: '', email: '', role: 'EMPLOYEE' as AppRole, department_id: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Enter the full name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid work email'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    const email = form.email.trim()
    const signupLink = `${window.location.origin}/login`
    try {
      // The browser cannot create an Auth user (that needs the service_role
      // key, which must never reach a client), so the invitation is recorded
      // in PostgreSQL. The signup trigger applies the role and department the
      // moment this person registers with the link below.
      await api.upsertInvite({
        email,
        full_name: form.name.trim(),
        role: form.role,
        department_id: form.department_id || null,
      })

      const message = [
        `You have been invited to join Taskflow.`,
        ``,
        `Name: ${form.name.trim()}`,
        `Email: ${email}`,
        `Role: ${ROLE_META[form.role].label}`,
        form.department_id
          ? `Department: ${departments.find((d) => d.id === form.department_id)?.name ?? ''}`
          : '',
        ``,
        `Create your account: ${signupLink}`,
        `Use exactly this email address so your role is applied automatically.`,
      ]
        .filter((l) => l !== '')
        .join('\n')

      try {
        await navigator.clipboard.writeText(message)
        toast.success('Invitation saved', 'Role and department are stored and will be applied on sign-up. The message was copied to your clipboard.')
      } catch {
        toast.success('Invitation saved', 'Role and department are stored and will be applied on sign-up. Copy the sign-in link manually and send it to the new employee.')
      }

      setForm({ name: '', email: '', role: 'EMPLOYEE', department_id: '' })
      onClose()
      await onDone()
      await refresh()
    } catch (err) {
      toast.error('Could not save the invitation', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a new employee"
      description="Taskflow never stores passwords. The role and department you choose are applied automatically the first time this person signs up with the email below."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} icon={<UserCog className="h-4 w-4" />}>
            Save invitation
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Work email" required error={errors.email} hint="Must match the address they sign up with.">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            invalid={Boolean(errors.email)}
          />
        </Field>
        <Field label="Intended role">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AppRole }))}>
            {APP_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[11px] text-slate-500">{ROLE_META[form.role].description}</p>
        </Field>
        <Field label="Department" hint="Applied automatically on sign-up. You can also change it later.">
          <Select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

function CreateDepartmentModal({
  open,
  onClose,
  profiles,
  onDone,
}: {
  open: boolean
  onClose: () => void
  profiles: Profile[]
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', code: '', description: '', head_user_id: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      setError('Enter a department name')
      return
    }
    setBusy(true)
    try {
      await api.createDepartment({
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        head_user_id: form.head_user_id || null,
      })
      toast.success('Department created')
      setForm({ name: '', code: '', description: '', head_user_id: '' })
      setError('')
      onClose()
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the department')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New department"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Create department
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" required error={error}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={Boolean(error)} />
        </Field>
        <Field label="Code" hint="Short identifier, e.g. DEV">
          <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} maxLength={8} />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
        </Field>
        <Field label="Department head">
          <Select value={form.head_user_id} onChange={(e) => setForm((f) => ({ ...f, head_user_id: e.target.value }))}>
            <option value="">Assign later</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

