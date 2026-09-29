import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, KanbanSquare, Lock, Mail, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Button, Field, Input } from '@/components/ui'
import { APP_NAME } from '@/lib/constants'

type Mode = 'signin' | 'signup' | 'forgot'

export default function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  if (from === '/login') return <Navigate to="/dashboard" replace />

  const validate = () => {
    const next: Record<string, string> = {}
    if (!email.trim()) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address'
    if (mode !== 'forgot') {
      if (!password) next.password = 'Password is required'
      else if (password.length < 8) next.password = 'Use at least 8 characters'
    }
    if (mode === 'signup' && fullName.trim().length < 2) next.fullName = 'Enter your full name'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        toast.success('Welcome back', 'You are signed in to the live workspace.')
        navigate(from, { replace: true })
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password, fullName)
        if (needsConfirmation) {
          setSent(true)
          toast.info('Confirm your email', 'Check your inbox to activate the account, then sign in.')
        } else {
          toast.success('Account created', 'You can now use Taskflow.')
          navigate('/dashboard', { replace: true })
        }
      } else {
        await requestPasswordReset(email)
        setSent(true)
        toast.success('Reset link sent', 'If the email exists, a password reset link is on its way.')
      }
    } catch (err) {
      toast.error('Could not continue', err instanceof Error ? err.message : 'Unexpected error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* ---------------- brand panel ---------------- */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-surface-300 bg-surface-50 p-10 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 via-transparent to-transparent" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
                <rect x="14" y="16" width="11" height="32" rx="3" fill="white" />
                <rect x="28.5" y="16" width="11" height="22" rx="3" fill="white" opacity="0.7" />
                <rect x="43" y="16" width="7" height="14" rx="3" fill="white" opacity="0.45" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{APP_NAME}</p>
              <p className="text-xs uppercase tracking-widest text-slate-500">Employee Task Management</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-white">
            One shared task board for the whole organisation.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Every change is written straight to the company database and pushed live to your teammates — no
            refresh needed, no local copies, nothing to install.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { icon: KanbanSquare, title: 'Kanban board', text: 'Drag and drop across six workflow stages' },
              { icon: Activity, title: 'Live sync', text: 'Instant updates for every logged-in user' },
              { icon: ShieldCheck, title: 'Role based', text: 'Permissions enforced by PostgreSQL' },
              { icon: Users, title: 'Workload', text: 'Capacity and utilisation computed for you' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-surface-300 bg-surface-100/60 p-3.5">
                <f.icon className="h-4.5 w-4.5 text-brand-400" style={{ width: 18, height: 18 }} />
                <p className="mt-2 text-sm font-semibold text-white">{f.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-600">
          Access is limited to authorised employees. All activity is recorded in the audit log.
        </p>
      </div>

      {/* ---------------- form panel ---------------- */}
      <div className="flex w-full items-center justify-center p-5 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
                <rect x="14" y="16" width="11" height="32" rx="3" fill="white" />
                <rect x="28.5" y="16" width="11" height="22" rx="3" fill="white" opacity="0.7" />
                <rect x="43" y="16" width="7" height="14" rx="3" fill="white" opacity="0.45" />
              </svg>
            </div>
            <p className="text-lg font-bold text-white">{APP_NAME}</p>
          </div>

          <h2 className="text-xl font-bold text-white">
            {mode === 'signin' ? 'Sign in to your workspace' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'signin'
              ? 'Use the email address issued by your administrator.'
              : mode === 'signup'
                ? 'New employees can register themselves. A System Admin assigns your role.'
                : 'We will email you a secure link to choose a new password.'}
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl border border-surface-300 bg-surface-100 p-5 text-center">
              <div className="mx-auto mb-3 w-fit rounded-full bg-emerald-500/15 p-3 text-emerald-400">
                <Mail className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-white">Check your email</p>
              <p className="mt-1 text-xs text-slate-400">
                If <span className="text-slate-200">{email}</span> has an account, a link is on its way.
              </p>
              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => {
                  setSent(false)
                  setMode('signin')
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {mode === 'signup' && (
                <Field label="Full name" required error={errors.fullName}>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Padmini R"
                    autoComplete="name"
                    invalid={Boolean(errors.fullName)}
                  />
                </Field>
              )}

              <Field label="Work email" required error={errors.email}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  invalid={Boolean(errors.email)}
                />
              </Field>

              {mode !== 'forgot' && (
                <Field label="Password" required error={errors.password}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    invalid={Boolean(errors.password)}
                  />
                </Field>
              )}

              <Button type="submit" loading={busy} className="w-full" size="lg">
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </Button>
            </form>
          )}

          {!sent && (
            <div className="mt-5 space-y-2 text-center text-sm">
              {mode === 'signin' && (
                <button
                  onClick={() => {
                    setMode('forgot')
                    setErrors({})
                  }}
                  className="link"
                  type="button"
                >
                  Forgot password?
                </button>
              )}
              <p className="text-slate-400">
                {mode === 'signup' ? 'Already have an account?' : "Don't have an account yet?"}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup')
                    setErrors({})
                  }}
                  className="link font-semibold"
                >
                  {mode === 'signup' ? 'Sign in' : 'Register'}
                </button>
              </p>
            </div>
          )}

          <div className="mt-8 flex items-start gap-2 rounded-lg border border-surface-300 bg-surface-100/50 p-3">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <p className="text-[11px] leading-relaxed text-slate-500">
              Passwords are hashed by Supabase Auth and never sent to or stored by this application. Session
              tokens are held only in this browser.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            <Link to="/reset-password" className="hover:text-slate-400">
              Already have a reset link?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
