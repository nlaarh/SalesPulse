import { expect, test } from '@playwright/test'

test('dashboard renders monthly goal gap focus card', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path === '/api/auth/me') {
      return route.fulfill({ json: {
        id: 1,
        email: 'nlaaroubi@nyaaa.com',
        name: 'Nour Laaroubi',
        role: 'superadmin',
        department: null,
        is_active: true,
        created_at: '2026-01-01',
        permissions: ['*'],
      } })
    }
    if (path === '/api/sales/advisors/summary') {
      return route.fulfill({ json: {
        bookings: 4200000,
        bookings_yoy_pct: 8.5,
        deals: 155,
        deals_yoy_pct: 4,
        pipeline_value: 1800000,
        pipeline_count: 42,
        win_rate: 48.2,
        avg_deal_size: 27100,
      } })
    }
    if (path === '/api/sales/advisors/leaderboard') return route.fulfill({ json: { advisors: [] } })
    if (path === '/api/sales/performance/insights') return route.fulfill({ json: { insights: [] } })
    if (path === '/api/sales/advisors/yoy') return route.fulfill({ json: {} })
    if (path === '/api/sales/performance/funnel') return route.fulfill({ json: { steps: [] } })
    if (path === '/api/sales/pipeline/slipping') return route.fulfill({ json: { deals: [] } })
    if (path === '/api/sales/leads/volume') return route.fulfill({ json: { by_source: [] } })
    if (path === '/api/sales/leads/agent-close-speed') return route.fulfill({ json: {} })
    if (path === '/api/targets') return route.fulfill({ json: { targets: [] } })
    if (path === '/api/sales/advisors/branch-monthly') return route.fulfill({ json: { branches: [], period_months: [], line: 'Travel' } })
    if (path === '/api/targets/monthly/2026') return route.fulfill({ json: { company: { months: [] }, advisors: [] } })
    if (path === '/api/targets/achievement') {
      return route.fulfill({ json: {
        comm_rate: 10,
        current_month: {
          month: 5,
          year: 2026,
          day_of_month: 24,
          days_in_month: 31,
          pace_pct: 77.4,
          company: {
            target: 100000,
            actual: 72000,
            commission_actual: 72000,
            achievement_pct: 72,
          },
        },
        yearly: {
          year: 2026,
          month_of_year: 5,
          pace_pct: 41.7,
          company: {
            target: 1200000,
            actual: 450000,
            commission_actual: 450000,
            achievement_pct: 37.5,
          },
        },
        advisors: [],
      } })
    }
    if (path === '/api/sales/opportunities/goal-focus') {
      return route.fulfill({ json: {
        line: 'Travel',
        metric: 'commission',
        target: 100000,
        actual: 72000,
        gap: 28000,
        coverage_amount: 41000,
        coverage_pct: 146.4,
        expected_value: 31000,
        available_count: 2,
        month_start: '2026-05-01',
        month_end: '2026-05-31',
        opportunities: [
          {
            rank: 1,
            id: '006AAA',
            name: 'Europe Family Trip',
            amount: 240000,
            goal_value: 24000,
            expected_value: 19200,
            stage: 'Quote',
            probability: 80,
            forecast_category: 'BestCase',
            close_date: '2026-05-28',
            last_activity: '2026-05-23',
            push_count: 0,
            owner: 'Advisor One',
            score: 92,
            priority_score: 118,
            reasons: ['Quote stage'],
            next_action: 'Close this month: quote is live, confirm objections and ask for the decision date.',
          },
          {
            rank: 2,
            id: '006BBB',
            name: 'Cruise Package',
            amount: 170000,
            goal_value: 17000,
            expected_value: 11800,
            stage: 'Qualifying/Research',
            probability: 70,
            forecast_category: 'Pipeline',
            close_date: '2026-05-31',
            last_activity: '2026-05-20',
            push_count: 1,
            owner: 'Advisor Two',
            score: 78,
            priority_score: 96,
            reasons: ['Closing this month'],
            next_action: 'Close this month: qualify blockers and move to quote with a dated next step.',
          },
        ],
      } })
    }

    return route.fulfill({ status: 200, json: {} })
  })

  await page.addInitScript(() => {
    localStorage.setItem('si-auth-token', 'test-token')
  })
  await page.goto('/dashboard')

  await expect(page.getByText('Monthly Goal Gap Focus')).toBeVisible()
  await expect(page.getByText('Europe Family Trip')).toBeVisible()
  await expect(page.getByText('Focus Coverage')).toBeVisible()
})
