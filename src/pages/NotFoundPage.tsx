import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { Button } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-surface-200 p-4 text-brand-400">
          <Compass className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold text-white">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          The page you are looking for does not exist or has moved.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/dashboard">
            <Button icon={<Home className="h-4 w-4" />}>Go to dashboard</Button>
          </Link>
          <Link to="/board">
            <Button variant="secondary">Open the board</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
