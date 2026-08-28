import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/app'
import { usernameToInternalEmail } from '../../utils/auth'

const SESSION_STARTED_KEY = 'attendly_session_started_at'
const MAX_SESSION_MS = 12 * 60 * 60 * 1000

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const clearLocalSession = useCallback(async () => {
    sessionStorage.removeItem(SESSION_STARTED_KEY)
    setSession(null)
    setProfile(null)
    await supabase.auth.signOut()
  }, [])

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession)
    if (!activeSession) {
      setProfile(null)
      setLoading(false)
      return
    }

    const startedAt = Number(sessionStorage.getItem(SESSION_STARTED_KEY))
    if (!startedAt || Date.now() - startedAt > MAX_SESSION_MS) {
      await clearLocalSession()
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .single()
    const nextProfile = data as Profile | null
    const signedInAt = activeSession.user.last_sign_in_at
      ? new Date(activeSession.user.last_sign_in_at).getTime()
      : startedAt
    const wasRevoked = nextProfile?.session_revoked_at
      ? new Date(nextProfile.session_revoked_at).getTime() >= signedInAt
      : false

    if (error || !nextProfile?.is_enabled || wasRevoked) {
      await clearLocalSession()
      setLoading(false)
      return
    }
    setProfile(nextProfile)
    setLoading(false)
  }, [clearLocalSession])

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session && !sessionStorage.getItem(SESSION_STARTED_KEY)) {
        const signedIn = data.session.user.last_sign_in_at
          ? new Date(data.session.user.last_sign_in_at).getTime()
          : Date.now()
        sessionStorage.setItem(SESSION_STARTED_KEY, String(signedIn))
      }
      void loadProfile(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' && !sessionStorage.getItem(SESSION_STARTED_KEY)) {
        sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()))
      }
      void loadProfile(nextSession)
    })
    const interval = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    }, 60_000)

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
      window.clearInterval(interval)
    }
  }, [loadProfile])

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToInternalEmail(username),
      password,
    })
    if (error) throw new Error('Invalid username or password.')
    sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()))
  }, [])

  const signOut = useCallback(async () => {
    await clearLocalSession()
  }, [clearLocalSession])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session)
  }, [loadProfile])

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signOut, refreshProfile }),
    [session, profile, loading, signIn, signOut, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// This hook intentionally shares the provider module so its context stays private.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider.')
  return context
}
