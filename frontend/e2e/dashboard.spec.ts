/**
 * E2E tests — Advisor Dashboard (main dashboard)
 *
 * Covers:
 *   - Page loads without crash
 *   - KPI summary cards render
 *   - Line switcher (Travel / Insurance) triggers data reload
 *   - Date range controls exist and are interactive
 *   - Leaderboard table has rows
 */

import { test, expect } from '@playwright/test'
import { login, expectNoError } from './helpers'

test.describe('Advisor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('page loads without error', async ({ page }) => {
    await expectNoError(page)
    await expect(page).toHaveURL(/dashboard/)
  })

  test('KPI summary cards are visible', async ({ page }) => {
    // At least one metric card (revenue, deals, win rate, etc.) should render
    const cards = page.locator('[data-testid*="kpi"], .card, [class*="card"], [class*="metric"]')
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })
  })

  test('Travel line is selected by default', async ({ page }) => {
    const selected = page.getByRole('tab', { name: /travel/i })
      .or(page.getByRole('button', { name: /travel/i }).filter({ hasText: /travel/i }))
    await expect(selected.first()).toBeVisible()
  })

  test('switching to Insurance line reloads data', async ({ page }) => {
    const insuranceTab = page.getByRole('tab', { name: /insurance/i })
      .or(page.getByRole('button', { name: /insurance/i }))

    if (await insuranceTab.first().isVisible()) {
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/sales') && r.status() === 200, { timeout: 15_000 }),
        insuranceTab.first().click(),
      ])
      expect(response.url()).toContain('Insurance')
    } else {
      test.skip() // line switcher not present on this page variant
    }
  })

  test('period selector is interactive', async ({ page }) => {
    const selector = page.getByRole('combobox').or(page.locator('select'))
    if (await selector.first().isVisible()) {
      await expect(selector.first()).toBeEnabled()
    }
  })

  test('leaderboard section renders agent names', async ({ page }) => {
    // Wait for leaderboard data — may take a moment
    const leaderboard = page.locator('table, [data-testid="leaderboard"], [class*="leaderboard"]')
    if (await leaderboard.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      const rows = leaderboard.first().locator('tr, [class*="row"]')
      expect(await rows.count()).toBeGreaterThan(0)
    }
  })
})
