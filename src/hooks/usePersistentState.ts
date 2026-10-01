import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'taskflow.'

/**
 * useState that survives a browser refresh.
 *
 * View state (selected sprint, filters, the week you are looking at) is
 * per-browser, not per-user, so it belongs in localStorage rather than the
 * database. Without this every reload silently threw the user back to
 * defaults. Reads are lazy so the first paint already has the right value.
 *
 * `validate` guards against stale keys: if a stored sprint id no longer
 * exists, or a stored enum value was renamed, fall back to the default
 * instead of rendering a broken UI.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate?: (stored: unknown) => stored is T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = PREFIX + key

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === null) return initialValue
      const parsed: unknown = JSON.parse(raw)
      if (validate && !validate(parsed)) {
        window.localStorage.removeItem(storageKey)
        return initialValue
      }
      return parsed as T
    } catch {
      // corrupt or hand-edited value: drop it rather than crash on boot
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* private mode / storage disabled */
      }
      return initialValue
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      /* quota exceeded or storage disabled — view state is not critical */
    }
  }, [storageKey, state])

  return [state, setState]
}

/** Clears one persisted key. Useful when a filter references data that is gone. */
export function clearPersistentState(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    /* storage disabled */
  }
}

export function usePersistentStateSetter(): (key: string, value: unknown) => void {
  return useCallback((key: string, value: unknown) => {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* storage disabled */
    }
  }, [])
}

// -------------------------------------------------------------------------
// Shared validators. Anything hand-edited or written by an older build can be
// the wrong shape, so each persisted value is checked before it reaches a
// component that would otherwise crash on it.
// -------------------------------------------------------------------------

export const isString = (v: unknown): v is string => typeof v === 'string'

export const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

export function isOneOf<T extends string>(options: readonly T[]) {
  return (v: unknown): v is T => typeof v === 'string' && (options as readonly string[]).includes(v)
}

/** ISO `YYYY-MM-DD`, which is what the calendar week state stores. */
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function isBooleanArray(v: unknown): v is boolean[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'boolean')
}
