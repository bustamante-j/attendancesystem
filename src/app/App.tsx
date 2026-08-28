import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { LoadingScreen } from '../components/LoadingScreen'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { useAuth } from '../features/auth/AuthProvider'

const DashboardPage = lazy(() => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const DepartmentsPage = lazy(() => import('../pages/DepartmentsPage').then((module) => ({ default: module.DepartmentsPage })))
const DevPage = lazy(() => import('../pages/DevPage').then((module) => ({ default: module.DevPage })))
const EventsPage = lazy(() => import('../pages/EventsPage').then((module) => ({ default: module.EventsPage })))
const LoginPage = lazy(() => import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const ScannerPage = lazy(() => import('../pages/ScannerPage').then((module) => ({ default: module.ScannerPage })))
const StudentsPage = lazy(() => import('../pages/StudentsPage').then((module) => ({ default: module.StudentsPage })))
const UsersPage = lazy(() => import('../pages/UsersPage').then((module) => ({ default: module.UsersPage })))

function HomePage() {
  const { profile } = useAuth()
  return profile?.role === 'officer' ? <Navigate to="/events" replace /> : <DashboardPage />
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<HomePage />} />
          <Route path="students" element={<ProtectedRoute roles={['super_admin', 'faculty']}><StudentsPage /></ProtectedRoute>} />
          <Route path="departments" element={<ProtectedRoute roles={['super_admin']}><DepartmentsPage /></ProtectedRoute>} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:eventId/scanner" element={<ScannerPage />} />
          <Route path="users" element={<ProtectedRoute roles={['super_admin']}><UsersPage /></ProtectedRoute>} />
          <Route path="dev" element={<ProtectedRoute roles={['super_admin']}><DevPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
