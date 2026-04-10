import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { SalesProvider } from '@/contexts/SalesContext'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import LandingPage from '@/pages/LandingPage'

/* ── Lazy-loaded pages (code-split per route) ────────────────────────────── */

const AdvisorDashboard = lazy(() => import('@/pages/AdvisorDashboard'))
const Pipeline = lazy(() => import('@/pages/Pipeline'))
const TravelAnalytics = lazy(() => import('@/pages/TravelAnalytics'))
const LeadFunnel = lazy(() => import('@/pages/LeadFunnel'))
const MonthlyReport = lazy(() => import('@/pages/MonthlyReport'))
const TopOpportunities = lazy(() => import('@/pages/TopOpportunities'))
const AgentDashboard = lazy(() => import('@/pages/AgentDashboard'))
const OpportunityDetail = lazy(() => import('@/pages/OpportunityDetail'))
const Help = lazy(() => import('@/pages/Help'))
const Settings = lazy(() => import('@/pages/Settings'))
const IssuesPage = lazy(() => import('@/pages/Issues'))
const CustomerProfile = lazy(() => import('@/pages/CustomerProfile'))
const TopCustomers = lazy(() => import('@/pages/TopCustomers'))
const CrossSellInsights = lazy(() => import('@/pages/CrossSellInsights'))

/* ── React Query client ──────────────────────────────────────────────────── */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min — data considered fresh
      gcTime: 10 * 60 * 1000,     // 10 min — unused cache garbage-collected
    },
  },
})

/* ── Suspense fallback ───────────────────────────────────────────────────── */

const LazyFallback = (
  <div className="flex items-center justify-center py-20 text-muted-foreground">
    Loading...
  </div>
)

/* ── App ─────────────────────────────────────────────────────────────────── */

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SalesProvider>
            <Routes>
              {/* Public */}
              <Route index element={<LandingPage />} />
              <Route path="login" element={<Login />} />

              {/* Protected — ErrorBoundary wraps <Outlet /> inside Layout */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="dashboard" element={<Suspense fallback={LazyFallback}><AdvisorDashboard /></Suspense>} />
                  <Route path="monthly" element={<Suspense fallback={LazyFallback}><MonthlyReport /></Suspense>} />
                  <Route path="opportunities" element={<Suspense fallback={LazyFallback}><TopOpportunities /></Suspense>} />
                  <Route path="agent/:name" element={<Suspense fallback={LazyFallback}><AgentDashboard /></Suspense>} />
                  <Route path="pipeline" element={<Suspense fallback={LazyFallback}><Pipeline /></Suspense>} />
                  <Route path="opportunity/:id" element={<Suspense fallback={LazyFallback}><OpportunityDetail /></Suspense>} />
                  <Route path="travel" element={<Suspense fallback={LazyFallback}><TravelAnalytics /></Suspense>} />
                  <Route path="leads" element={<Suspense fallback={LazyFallback}><LeadFunnel /></Suspense>} />
                  <Route path="help" element={<Suspense fallback={LazyFallback}><Help /></Suspense>} />
                  <Route path="settings" element={<Suspense fallback={LazyFallback}><Settings /></Suspense>} />
                  <Route path="issues" element={<Suspense fallback={LazyFallback}><IssuesPage /></Suspense>} />
                  <Route path="customer/:id" element={<Suspense fallback={LazyFallback}><CustomerProfile /></Suspense>} />
                  <Route path="customers" element={<Suspense fallback={LazyFallback}><TopCustomers /></Suspense>} />
                  <Route path="insights" element={<Suspense fallback={LazyFallback}><CrossSellInsights /></Suspense>} />
                </Route>
              </Route>
            </Routes>
          </SalesProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
