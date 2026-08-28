import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import type { UserRole } from '../types/app'
import { LoadingScreen } from './LoadingScreen'

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: UserRole[] }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <LoadingScreen label="Checking session…" />
  if (!session || !profile) return <Navigate to="/login" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to={profile.role === 'officer' ? '/events' : '/'} replace />
  return children
}
