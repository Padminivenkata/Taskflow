import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { Spinner, Button } from '@/components/ui'
import { ShieldAlert, Database } from 'lucide-react'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const MyTasksPage = lazy(() => import('@/pages/MyTasksPage'))
const BoardPage = lazy(() => import('@/pages/BoardPage'))
const BacklogPage = lazy(() => import('@/pages/BacklogPage'))
const SprintsPage = lazy(() => import('@/pages/SprintsPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const CapacityPage = lazy(() => import('@/pages/CapacityPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const TaskDetailPage = lazy(() => import('@/pages/TaskDetailPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-0">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-slate-400">Loading your workspace…</p>
      </div>
    </div>
  )
}

function ConfigurationRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
      <div className="card w-full max-w-xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-400">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Database not connected</h1>
            <p className="text-sm text-slate-400">Taskflow needs a Supabase project to run.</p>
          </div>
        </div>
        <ol className="ml-5 list-decimal space-y-2 text-sm text-slate-300">
          <li>
            Copy <code className="rounded bg-surface-300 px-1 py-0.5 font-mono text-xs">.env.example</code> to{' '}
            <code className="rounded bg-surface-300 px-1 py-0.5 font-mono text-xs">.env</code>
          </li>
          <li>
            Set <code className="rounded bg-surface-300 px-1 py-0.5 font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-surface-300 px-1 py-0.5 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>
          </li>
          <li>Run the SQL in <code className="rounded bg-surface-300 px-1 py-0.5 font-mono text-xs">supabase/migrations</code> in your Supabase SQL editor</li>
          <li>Restart the dev server</li>
        </ol>
        <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    </div>
  )
}

function AccountSuspended() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-4 w-fit rounded-full bg-rose-500/15 p-3 text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-white">Your account is not active</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your profile is missing or has been deactivated. Please contact your System Administrator.
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

/** Unauthenticated users can never see application data. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'unconfigured') return <ConfigurationRequired />
  if (status === 'suspended') return <AccountSuspended />
  if (status !== 'authenticated') return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'unconfigured') return <ConfigurationRequired />
  if (status === 'suspended') return <AccountSuspended />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/**
 * A password-recovery link signs the user in *before* they reach this page, so
 * the route must tolerate an authenticated session. Redirecting them to the
 * dashboard here would strand them on a link they cannot use.
 */
function RecoveryRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  if (status === 'unconfigured') return <ConfigurationRequired />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/reset-password"
          element={
            <RecoveryRoute>
              <ResetPasswordPage />
            </RecoveryRoute>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-tasks" element={<MyTasksPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/backlog" element={<BacklogPage />} />
          <Route path="/sprints" element={<SprintsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
