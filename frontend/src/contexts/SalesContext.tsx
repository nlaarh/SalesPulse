import { createContext, useContext, useState, type ReactNode } from 'react'

type BusinessLine = 'Travel' | 'Insurance' | 'All'
type ViewMode = 'month' | 'quarter' | '6m' | 'ytd' | 'year' | 'last-year' | 'custom'

interface SalesContextValue {
  line: BusinessLine
  setLine: (l: BusinessLine) => void
  period: number
  setPeriod: (p: number) => void
  startDate: string | null
  endDate: string | null
  setDateRange: (start: string, end: string) => void
  clearDateRange: () => void
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

const SalesContext = createContext<SalesContextValue | null>(null)

export function SalesProvider({ children }: { children: ReactNode }) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const [line, setLine] = useState<BusinessLine>('Travel')
  const [period, setPeriod] = useState(now.getMonth() + 1)
  const [startDate, setStartDate] = useState<string | null>(`${yyyy}-01-01`)
  const [endDate, setEndDate] = useState<string | null>(now.toISOString().split('T')[0])
  const [viewMode, setViewMode] = useState<ViewMode>('ytd')

  const setDateRange = (start: string, end: string) => {
    setStartDate(start)
    setEndDate(end)
    setViewMode('custom')
  }

  const clearDateRange = () => {
    setStartDate(null)
    setEndDate(null)
  }

  const handleViewMode = (m: ViewMode) => {
    setViewMode(m)

    if (m === 'custom') return

    // Clear custom date range for non-custom modes
    clearDateRange()

    const now = new Date()
    const yyyy = now.getFullYear()

    if (m === 'month') {
      setPeriod(1)
    } else if (m === 'quarter') {
      setPeriod(3)
    } else if (m === '6m') {
      setPeriod(6)
    } else if (m === 'year') {
      setPeriod(12)
    } else if (m === 'ytd') {
      // Jan 1 of current year → today
      const start = `${yyyy}-01-01`
      const end = now.toISOString().split('T')[0]
      setStartDate(start)
      setEndDate(end)
      setPeriod(now.getMonth() + 1)
    } else if (m === 'last-year') {
      // Full prior year
      const start = `${yyyy - 1}-01-01`
      const end = `${yyyy - 1}-12-31`
      setStartDate(start)
      setEndDate(end)
      setPeriod(12)
    }
  }

  return (
    <SalesContext.Provider value={{
      line, setLine, period, setPeriod,
      startDate, endDate, setDateRange, clearDateRange,
      viewMode, setViewMode: handleViewMode,
    }}>
      {children}
    </SalesContext.Provider>
  )
}

export function useSales() {
  const ctx = useContext(SalesContext)
  if (!ctx) throw new Error('useSales must be inside SalesProvider')
  return ctx
}
