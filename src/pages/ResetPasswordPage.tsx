import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Button, Field, Input } from '@/components/ui'
import { APP_NAME } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const { updatePassword, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    // Supabase parses the recovery link and establishes a temporary session.
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      setHasSession(Boolean(data.session))
    }
    void check()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (password.length < 8) next.password = 'Use at least 8 characters'
    if (password !== confirm) next.confirm = 'Passwords do not match'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await updatePassword(password)
      toast.success('Password updated', 'You can now use your new password everywhere.')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error('Could not update password', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
              <rect x="14" y="16" width="11" height="32" rx="3" fill="white" />
              <rect x="28.5" y="16" width="11" height="22" rx="3" fill="white" opacity="0.7" />
              <rect x="43" y="16" width="7" height="14" rx="3" fill="white" opacity="0.45" />
            </svg>
          </div>
          <p className="text-lg font-bold text-white">{APP_NAME}</p>
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-500/15 p-2 text-brand-400">
              <KeyRound className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <h1 className="text-lg font-bold text-white">Choose a new password</h1>
          </div>

          {hasSession === false && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              This page needs to be opened from the reset link in your email. If the link has expired, request a new
              one from the sign-in page.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="New password" required error={errors.password} hint="Minimum 8 characters">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                invalid={Boolean(errors.password)}
              />
            </Field>
            <Field label="Confirm password" required error={errors.confirm}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                invalid={Boolean(errors.confirm)}
              />
            </Field>
            <Button type="submit" loading={busy} className="w-full" disabled={hasSession === false}>
              Update password
            </Button>
          </form>

          {user && <p className="mt-4 text-center text-xs text-slate-500">Signed in as {user.email}</p>}
        </div>

        <button onClick={() => navigate('/login')} className="mt-5 w-full text-center text-sm text-slate-400 hover:text-white">
          Back to sign in
        </button>
      </div>
    </div>
  )
}
