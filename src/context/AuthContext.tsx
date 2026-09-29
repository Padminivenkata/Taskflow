import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { api } from '@/lib/api'
import { describeError, isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unconfigured' | 'suspended'

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured ? 'loading' : 'unconfigured',
  )
  const profileLoadFailed = useRef(false)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const p = await api.getProfile(userId)
      setProfile(p)
      profileLoadFailed.current = false
      if (!p.active) {
        setStatus('suspended')
        await supabase.auth.signOut()
      } else {
        setStatus('authenticated')
        void api.touchLastSeen(userId)
      }
    } catch (err) {
      // A profile can legitimately be missing for a few milliseconds while the
      // auth trigger runs. Retry a couple of times before giving up.
      profileLoadFailed.current = true
      const message = describeError(err, 'Your profile could not be loaded.')
      if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('single row')) {
        await new Promise((r) => setTimeout(r, 600))
        try {
          const p = await api.getProfile(userId)
          setProfile(p)
          setStatus('authenticated')
          profileLoadFailed.current = false
          return
        } catch {
          /* fall through */
        }
      }
      setProfile(null)
      setStatus('suspended')
      console.error('[Taskflow] profile load failed', err)
    }
  }, [])

  // ------------------------------------------------------------------
  // Session bootstrap
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        await loadProfile(data.session.user.id)
      } else {
        setStatus('anonymous')
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (event === 'SIGNED_OUT' || !nextSession) {
        setProfile(null)
        setStatus('anonymous')
        return
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        void loadProfile(nextSession.user.id)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(describeError(error, 'Invalid email or password.'))
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw new Error(describeError(error, 'Could not create the account.'))
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      setProfile(null)
      setUser(null)
      setSession(null)
      setStatus('anonymous')
    }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(describeError(error, 'Could not send the reset email.'))
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(describeError(error, 'Could not update the password.'))
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id)
  }, [user, loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      profile,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [status, user, session, profile, signIn, signUp, signOut, requestPasswordReset, updatePassword, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
