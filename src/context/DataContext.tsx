import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { api, DataError } from '@/lib/api'
import { isNetworkError, supabase } from '@/lib/supabase'
import type {
  ActiveTimeLog,
  AuditLog,
  Department,
  Profile,
  Sprint,
  SprintProgress,
  Task,
  TaskComment,
} from '@/types/database'
import { useAuth } from '@/context/AuthContext'

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'

export interface PresenceUser {
  user_id: string
  name: string
  role: string
  online_at: string
}

interface DataState {
  tasks: Task[]
  profiles: Profile[]
  departments: Department[]
  sprints: Sprint[]
  comments: TaskComment[]
  activeTimeLogs: ActiveTimeLog[]
  sprintProgress: SprintProgress[]
  auditLogs: AuditLog[]
}

interface DataContextValue extends DataState {
  profile: Profile | null
  loading: boolean
  error: string | null
  connection: ConnectionState
  onlineUsers: PresenceUser[]
  lastSyncedAt: Date | null
  refresh: (silent?: boolean) => Promise<void>
  refreshTasks: () => Promise<void>
  refreshAuditLogs: () => Promise<void>
  profileById: (id: string | null | undefined) => Profile | null
  departmentById: (id: string | null | undefined) => Department | null
  sprintById: (id: string | null | undefined) => Sprint | null
  isEditable: (task: Task) => boolean
  isDeletable: (task: Task) => boolean
  canAssign: boolean
  canCreate: boolean
  canManageSprints: boolean
  canViewAllTasks: boolean
  canViewDepartmentTasks: boolean
}

const EMPTY: DataState = {
  tasks: [],
  profiles: [],
  departments: [],
  sprints: [],
  comments: [],
  activeTimeLogs: [],
  sprintProgress: [],
  auditLogs: [],
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [state, setState] = useState<DataState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const inFlight = useRef(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const role = profile?.role
  const isAdmin = role === 'ADMIN'
  const isHead = role === 'DEPARTMENT_HEAD'
  const canViewAllTasks = isAdmin
  const canViewDepartmentTasks = isAdmin || isHead
  const canAssign = isAdmin || isHead || Boolean(profile?.can_assign_tasks)
  const canCreate = Boolean(profile?.can_create_tasks) || canViewAllTasks || isHead
  const canManageSprints = isAdmin || isHead

  // ---------------------------------------------------------------------
  // Load everything the app needs. RLS already limits what comes back, so an
  // employee simply never receives other departments' rows.
  // ---------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!user) return
    if (inFlight.current) return
    inFlight.current = true
    try {
      const [tasks, profiles, departments, sprints, activeTimeLogs, sprintProgress] = await Promise.all([
        api.listTasks(),
        api.listProfiles(),
        api.listDepartments(),
        api.listSprints(),
        api.listActiveTimeLogs(),
        api.listSprintProgress(),
      ])
      const commentRows = await api.listComments(tasks.map((t) => t.id))

      if (!mountedRef.current) return
      setState((s) => ({
        ...s,
        tasks,
        profiles,
        departments,
        sprints,
        comments: commentRows,
        activeTimeLogs,
        sprintProgress,
      }))
      setError(null)
      setLastSyncedAt(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof DataError ? err.message : 'Could not reach the database. Showing the last data loaded.')
      if (isNetworkError(err)) setConnection('offline')
    } finally {
      inFlight.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [user])

  const refresh = useCallback(
    async (silent = true) => {
      if (!user) return
      if (!silent) setLoading(true)
      inFlight.current = false
      await loadAll()
    },
    [user, loadAll],
  )

  const refreshTasks = useCallback(async () => {
    if (!user) return
    try {
      const tasks = await api.listTasks()
      const [comments, activeTimeLogs] = await Promise.all([
        api.listComments(tasks.map((t) => t.id)),
        api.listActiveTimeLogs(),
      ])
      if (!mountedRef.current) return
      setState((s) => ({ ...s, tasks, comments, activeTimeLogs }))
      setLastSyncedAt(new Date())
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      if (isNetworkError(err)) setConnection('offline')
    }
  }, [user])

  const refreshAuditLogs = useCallback(async () => {
    if (!user || !isAdmin) return
    try {
      const auditLogs = await api.listAuditLogs({ limit: 300 })
      if (mountedRef.current) setState((s) => ({ ...s, auditLogs }))
    } catch {
      /* audit failures are not user blocking */
    }
  }, [user, isAdmin])

  /**
   * Reference data (profiles, departments, sprints, calendars) changes far less
   * often than tasks, so it gets its own targeted reload. Without this a sprint
   * renamed by an admin would not appear in other users' open tabs.
   */
  const refreshReference = useCallback(async () => {
    if (!user) return
    try {
      const [profiles, departments, sprints, sprintProgress] = await Promise.all([
        api.listProfiles(),
        api.listDepartments(),
        api.listSprints(),
        api.listSprintProgress(),
      ])
      if (!mountedRef.current) return
      setState((s) => ({ ...s, profiles, departments, sprints, sprintProgress }))
      setLastSyncedAt(new Date())
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      if (isNetworkError(err)) setConnection('offline')
    }
  }, [user])

  // ---------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setState(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    void loadAll()
  }, [user, loadAll])

  // ---------------------------------------------------------------------
  // Realtime. One channel, many bindings. Any mutation by ANY employee
  // re-reads the authoritative rows from PostgreSQL, so every open browser
  // converges to the same state.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!user) return
    let disposed = false

    const channel = supabase.channel(`org:${user.id}`, {
      config: { presence: { key: user.id }, broadcast: { self: false } },
    })

    const scheduleRefresh = () => {
      window.setTimeout(() => {
        if (!disposed) void refreshTasks()
      }, 120)
    }

    const scheduleReferenceRefresh = () => {
      window.setTimeout(() => {
        if (!disposed) void refreshReference()
      }, 150)
    }

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_logs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sprints' }, scheduleReferenceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, scheduleReferenceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReferenceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'working_calendar' }, scheduleReferenceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_calendar' }, scheduleReferenceRefresh)
      .on(
        'presence',
        { event: 'sync' },
        () => {
          const state = channel.presenceState<PresenceUser>()
          const users = Object.values(state).flat()
          if (mountedRef.current) setOnlineUsers(users)
        },
      )
      .subscribe(async (status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          await channel.track({
            user_id: user.id,
            name: profile?.name ?? user.email ?? 'User',
            role: profile?.role ?? 'EMPLOYEE',
            online_at: new Date().toISOString(),
          })
          // re-sync after (re)connect so nothing is missed while offline
          void refreshTasks()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('error')
        } else if (status === 'CLOSED') {
          setConnection('reconnecting')
        }
      })

    channelRef.current = channel

    return () => {
      disposed = true
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshTasks, refreshReference])

  // ---------------------------------------------------------------------
  // Browser network events
  // ---------------------------------------------------------------------
  useEffect(() => {
    const goOnline = () => {
      setConnection('reconnecting')
      inFlight.current = false
      void loadAll()
      window.setTimeout(() => setConnection((c) => (c === 'reconnecting' ? 'live' : c)), 2500)
    }
    const goOffline = () => setConnection('offline')
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [loadAll])

  // ---------------------------------------------------------------------
  // Periodic safety net: catch anything realtime could have missed
  // (e.g. a laptop that slept through a change).
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!user) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshTasks()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTasks()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, refreshTasks])

  const profileById = useCallback(
    (id: string | null | undefined) => (id ? (state.profiles.find((p) => p.id === id) ?? null) : null),
    [state.profiles],
  )
  const departmentById = useCallback(
    (id: string | null | undefined) => (id ? (state.departments.find((d) => d.id === id) ?? null) : null),
    [state.departments],
  )
  const sprintById = useCallback(
    (id: string | null | undefined) => (id ? (state.sprints.find((s) => s.id === id) ?? null) : null),
    [state.sprints],
  )

  const myDepartmentId = profile?.department_id ?? null

  const isEditable = useCallback(
    (task: Task) => {
      if (isAdmin) return true
      if (task.assignee_id === user?.id) return true
      if (task.created_by === user?.id) return true
      if (isHead && task.department_id && task.department_id === myDepartmentId) return true
      return false
    },
    [isAdmin, isHead, myDepartmentId, user?.id],
  )

  const isDeletable = useCallback((_task: Task) => isAdmin, [isAdmin])

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      profile,
      loading,
      error,
      connection,
      onlineUsers,
      lastSyncedAt,
      refresh,
      refreshTasks,
      refreshAuditLogs,
      profileById,
      departmentById,
      sprintById,
      isEditable,
      isDeletable,
      canAssign,
      canCreate,
      canManageSprints,
      canViewAllTasks,
      canViewDepartmentTasks,
    }),
    [
      state,
      profile,
      loading,
      error,
      connection,
      onlineUsers,
      lastSyncedAt,
      refresh,
      refreshTasks,
      refreshAuditLogs,
      profileById,
      departmentById,
      sprintById,
      isEditable,
      isDeletable,
      canAssign,
      canCreate,
      canManageSprints,
      canViewAllTasks,
      canViewDepartmentTasks,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
