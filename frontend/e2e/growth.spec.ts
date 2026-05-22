import { test, expect } from '@playwright/test'

test('Growth dashboard: scorecard + matrix + drill-down', async ({ page }) => {
  await page.goto('http://localhost:8001/login')
  await page.fill('input[type="email"]', 'nlaaroubi@nyaaa.com')
  await page.fill('input[type="password"]', '8coDxQB!CB1*')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })
  
  // ── Scorecard ──
  await page.goto('http://localhost:8001/growth')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)
  
  // h1 is unique
  await expect(page.locator('h1')).toContainText('Growth Intelligence', { timeout: 10000 })
  console.log('✅ Scorecard loaded')
  
  // KPI cards exist  
  await expect(page.getByText('Member Penetration', { exact: true })).toBeVisible()
  await expect(page.getByText('Insurance Cross-Sell', { exact: true })).toBeVisible()
  console.log('✅ KPI cards')
  
  // Charts rendered (SVG elements)
  const svgs = page.locator('svg.recharts-surface')
  await expect(svgs.first()).toBeVisible({ timeout: 5000 })
  const chartCount = await svgs.count()
  expect(chartCount).toBeGreaterThanOrEqual(3)
  console.log(`✅ ${chartCount} charts rendered`)
  
  // Table with ZIP data
  const tableRows = page.locator('table tbody tr')
  await expect(tableRows.first()).toBeVisible({ timeout: 10000 })
  const rowCount = await tableRows.count()
  expect(rowCount).toBeGreaterThan(5)
  console.log(`✅ ZIP table: ${rowCount} rows`)
  
  await page.screenshot({ path: '/tmp/growth-scorecard.png', fullPage: true })
  
  // ── Matrix ──
  await page.getByRole('button', { name: /Prioritization Matrix/ }).click()
  await page.waitForURL('**/growth/matrix**', { timeout: 5000 })
  await page.waitForTimeout(3000)
  
  await expect(page.locator('h1')).toContainText('Prioritization Matrix', { timeout: 10000 })
  console.log('✅ Matrix page loaded')
  
  // Scatter chart exists
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 5000 })
  console.log('✅ Scatter chart rendered')
  
  // Table
  const mRows = page.locator('table tbody tr')
  await expect(mRows.first()).toBeVisible({ timeout: 10000 })
  const mCount = await mRows.count()
  expect(mCount).toBeGreaterThan(10)
  console.log(`✅ Matrix table: ${mCount} rows`)
  
  await page.screenshot({ path: '/tmp/growth-matrix.png', fullPage: true })
  
  // ── Drill-down ──
  await mRows.first().click()
  await page.waitForURL('**/territory/**', { timeout: 5000 })
  await page.waitForTimeout(2000)
  await expect(page.getByText('Census & Segment Profile')).toBeVisible({ timeout: 10000 })
  console.log('✅ Drill-down to ZIP detail')
  
  console.log('✅ ALL GROWTH TESTS PASSED')
})
