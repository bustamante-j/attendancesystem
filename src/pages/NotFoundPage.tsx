import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  return <EmptyState icon={MapPinOff} title="Page not found" description="The page may have moved or the address may be incorrect." action={<Link className="btn-primary" to="/">Return to dashboard</Link>} />
}
