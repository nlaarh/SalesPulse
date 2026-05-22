import { test, expect } from '@playwright/test'
import { login, expectNoError } from './helpers'

test.describe('Smoke', () => {
  test('dashboard renders after login and loads aggregated overview', async ({ page }) => {
    const overviewResponse = page.waitForResponse((response) =>
      response.url().includes('/api/sales/dashboard/overview') && response.status() === 200
    )

    await login(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)

    const response = await overviewResponse
    const data = await response.json()

    expect(data.summary).toBeTruthy()
    expect(data.targets).toBeTruthy()
    expect(data.achievement).toBeTruthy()

    await expect(page.getByRole('heading', { name: /sales performance/i })).toBeVisible()
    await expect(page.getByText(/target achievement/i)).toBeVisible()
    await expectNoError(page)
  })

  test('top opportunities initial load does not auto-trigger AI fetch', async ({ page }) => {
    const topOppRequests: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('/api/sales/opportunities/top')) {
        topOppRequests.push(url)
      }
    })

    await login(page)
    await page.goto('/top-opps')
    await expect(page.getByRole('heading', { name: /top opportunities/i })).toBeVisible()
    await expectNoError(page)

    await page.waitForLoadState('networkidle')

    const aiRequests = topOppRequests.filter((url) => /[?&]ai=true(?:&|$)/.test(url))
    expect(aiRequests).toEqual([])

    const nonAiRequests = topOppRequests.filter((url) => /[?&]ai=false(?:&|$)/.test(url))
    expect(nonAiRequests.length).toBeGreaterThan(0)
  })
})
