import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Table2,
  Users,
  Wifi,
  WifiOff,
  X,
  PanelLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { APP_NAME, ROLE_META } from '@/lib/constants'
import { Avatar, Badge, Button } from '@/components/ui'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: Array<'ADMIN' | 'DEPARTMENT_HEAD' | 'EMPLOYEE'>
  badge?: (ctx: BadgeCtx) => number
}

interface BadgeCtx {
  myTaskCount: number
  blockedCount: number
  overdueCount: number
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  {
    to: '/my-tasks',
    label: 'My Tasks',
    icon: ListTodo,
    roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'],
    badge: (c) => c.myTaskCount,
  },
  { to: '/board', label: 'Task Board', icon: Table2, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/backlog', label: 'Backlog', icon: Inbox, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/sprints', label: 'Sprints', icon: Sparkles, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/capacity', label: 'Capacity', icon: Activity, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'] },
  { to: '/admin', label: 'Administration', icon: Settings, roles: ['ADMIN'] },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const { tasks, connection, lastSyncedAt, onlineUsers } = useData()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('taskflow.sidebar.collapsed') === '1',
  )
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const badges = useMemo<BadgeCtx>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      myTaskCount: tasks.filter(
        (t) => t.assignee_id === profile?.id && t.status !== 'DONE' && t.status !== 'BACKLOG',
      ).length,
      blockedCount: tasks.filter((t) => t.status === 'BLOCKED').length,
      overdueCount: tasks.filter((t) => t.due_date && t.due_date < today && t.status !== 'DONE').length,
    }
  }, [tasks, profile?.id])

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => (profile ? item.roles.includes(profile.role) : false)),
    [profile],
  )

  const otherOnline = onlineUsers.filter((u) => u.user_id !== profile?.id).length

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      {/* ------------------------------------------------------------------ */}
      {/* Mobile drawer                                                      */}
      {/* ------------------------------------------------------------------ */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-up flex-col border-r border-surface-300 bg-surface-50">
            <SidebarContent
              items={visibleNav}
              badges={badges}
              collapsed={false}
              onCollapse={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={clsx(
          'hidden shrink-0 border-r border-surface-300 bg-surface-50 transition-[width] duration-200 lg:flex lg:flex-col',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarContent
          items={visibleNav}
          badges={badges}
          collapsed={collapsed}
          onCollapse={() => {
            const next = !collapsed
            setCollapsed(next)
            localStorage.setItem('taskflow.sidebar.collapsed', next ? '1' : '0')
          }}
        />
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-surface-300 bg-surface-50/80 px-3 backdrop-blur sm:px-5">
          <button
            className="rounded-lg p-2 text-slate-300 transition hover:bg-surface-200 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="lg:hidden">
            <span className="text-sm font-bold text-white">{APP_NAME}</span>
          </div>

          <ConnectionPill connection={connection} lastSyncedAt={lastSyncedAt} />

          {otherOnline > 0 && (
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              {otherOnline} other {otherOnline === 1 ? 'person' : 'people'} online
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Users className="h-4 w-4" />}
              className="hidden sm:inline-flex"
              onClick={() => navigate('/capacity')}
            >
              Workload
            </Button>
            <ProfileMenu />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({
  items,
  badges,
  collapsed,
  onCollapse,
  onClose,
}: {
  items: NavItem[]
  badges: BadgeCtx
  collapsed: boolean
  onCollapse?: () => void
  onClose?: () => void
}) {
  return (
    <>
      <div className={clsx('flex h-14 items-center gap-2 border-b border-surface-300 px-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <svg viewBox="0 0 64 64" className="h-4.5 w-4.5" aria-hidden>
            <rect x="14" y="16" width="11" height="32" rx="3" fill="white" />
            <rect x="28.5" y="16" width="11" height="22" rx="3" fill="white" opacity="0.7" />
            <rect x="43" y="16" width="7" height="14" rx="3" fill="white" opacity="0.45" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{APP_NAME}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">Task Management</p>
          </div>
        )}
        {onClose && (
          <button className="rounded p-1 text-slate-400 hover:bg-surface-200" onClick={onClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {items.map((item) => {
          const count = item.badge?.(badges) ?? 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-brand-600/15 text-brand-200'
                    : 'text-slate-400 hover:bg-surface-200 hover:text-slate-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-brand-400" />}
                  <item.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && <Badge count={count} />}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {onCollapse && (
        <div className="border-t border-surface-300 p-2.5">
          <button
            onClick={onCollapse}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 transition hover:bg-surface-200 hover:text-slate-300"
          >
            <PanelLeft className="h-4 w-4" style={{ width: 16, height: 16 }} />
            {!collapsed && 'Collapse'}
          </button>
        </div>
      )}
    </>
  )
}

function ConnectionPill({
  connection,
  lastSyncedAt,
}: {
  connection: string
  lastSyncedAt: Date | null
}) {
  const map: Record<string, { label: string; cls: string; icon: typeof Wifi }> = {
    live: { label: 'Live', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: Wifi },
    connecting: { label: 'Connecting', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: Wifi },
    reconnecting: { label: 'Reconnecting', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: Wifi },
    offline: { label: 'Offline', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300', icon: WifiOff },
    error: { label: 'Sync issue', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300', icon: WifiOff },
  }
  const meta = map[connection] ?? map.connecting
  const title = lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : 'Not synced yet'
  return (
    <span
      title={title}
      className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', meta.cls)}
    >
      <meta.icon className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  )
}

function ProfileMenu() {
  const { profile, user } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  if (!profile) return null
  const roleMeta = ROLE_META[profile.role]

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-surface-200"
      >
        <Avatar name={profile.name} id={profile.id} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-200 lg:inline">
          {profile.name}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-64 animate-slide-up rounded-xl border border-surface-300 bg-surface-100 p-1.5 shadow-pop">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
            <span className={clsx('chip mt-2', roleMeta?.chip)}>{roleMeta?.label}</span>
          </div>
          <div className="my-1 h-px bg-surface-300" />
          <button
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition hover:bg-surface-200"
          >
            <Users className="h-4 w-4" />
            My profile
          </button>
        </div>
      )}
    </div>
  )
}
