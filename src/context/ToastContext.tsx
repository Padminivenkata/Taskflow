import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import clsx from 'clsx'

type ToastKind = 'success' | 'error' | 'info' | 'loading'

interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
  duration: number
}

interface ToastContextValue {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  loading: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string, duration?: number) => {
      const id = `t${++counter}`
      const ttl = duration ?? (kind === 'error' ? 9000 : kind === 'loading' ? 20000 : 4000)
      setToasts((prev) => [...prev.slice(-4), { id, kind, title, description, duration: ttl }])
      if (kind !== 'loading') {
        const timer = window.setTimeout(() => dismiss(id), ttl)
        timers.current.set(id, timer)
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (t, d) => void push('success', t, d),
      error: (t, d) => void push('error', t, d),
      info: (t, d) => void push('info', t, d),
      loading: (t, d) => push('loading', t, d),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end sm:p-0">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon =
    toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? XCircle : toast.kind === 'loading' ? Loader2 : Info

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border p-3 shadow-pop backdrop-blur',
        toast.kind === 'success' && 'border-emerald-500/40 bg-emerald-950/80',
        toast.kind === 'error' && 'border-rose-500/40 bg-rose-950/80',
        toast.kind === 'info' && 'border-sky-500/40 bg-sky-950/80',
        toast.kind === 'loading' && 'border-surface-300 bg-surface-100/90',
      )}
    >
      <Icon
        className={clsx(
          'mt-0.5 h-5 w-5 shrink-0',
          toast.kind === 'success' && 'text-emerald-400',
          toast.kind === 'error' && 'text-rose-400',
          toast.kind === 'info' && 'text-sky-400',
          toast.kind === 'loading' && 'animate-spin text-brand-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{toast.description}</p>}
      </div>
      <button
        onClick={onDismiss}
        className="rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function useConfirm() {
  const [state, setState] = useState<{
    title: string
    description?: string
    confirmLabel: string
    danger: boolean
    resolve: (v: boolean) => void
  } | null>(null)

  const confirm = useCallback(
    (opts: { title: string; description?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setState({
          title: opts.title,
          description: opts.description,
          confirmLabel: opts.confirmLabel ?? 'Confirm',
          danger: opts.danger ?? true,
          resolve,
        }),
      ),
    [],
  )

  const node = state ? (
    <ConfirmDialog
      state={state}
      onCancel={() => {
        state.resolve(false)
        setState(null)
      }}
      onConfirm={() => {
        state.resolve(true)
        setState(null)
      }}
    />
  ) : null

  return { confirm, dialog: node }
}

function ConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: { title: string; description?: string; confirmLabel: string; danger: boolean }
  onCancel: () => void
  onConfirm: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md animate-slide-up rounded-2xl border border-surface-300 bg-surface-100 p-5 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-rose-500/15 p-2 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">{state.title}</h2>
            {state.description && <p className="mt-1 text-sm text-slate-300">{state.description}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-surface-400 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-surface-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition',
              state.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-brand-600 hover:bg-brand-500',
            )}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
