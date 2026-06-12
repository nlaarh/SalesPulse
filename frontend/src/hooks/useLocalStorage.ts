import { useState, useCallback } from 'react'

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setInner] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback((v: T) => {
    setInner(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* quota exceeded */ }
  }, [key])

  return [value, set]
}
