import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <div className="panel"><h1 className="text-xl font-bold">Page not found</h1><Link className="mt-3 inline-block text-sm text-blue-700 hover:underline" to="/">Return to dashboard</Link></div>
}
