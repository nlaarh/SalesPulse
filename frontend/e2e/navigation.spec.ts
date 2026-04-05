/**
 * E2E tests — Navigation & routing
 *
 * Covers:
 *   - All primary nav links load their pages (no 404 / crash)
 *   - Browser back/forward preserves state
 *   - Direct URL navigation to each page works when authenticated
 */

import { test, expect, Page } from '@playwright/test'
import { login, expectNoError } from './helpers'

const PAGES = [
  { label: 'Dashboard',     path: '/dashboard'      },
  { label: 'Monthly',       path: '/monthly'         },
  { label: 'Opportunities', path: '/opportunities'   },
  { label: 'Pipeline',      path: '/pipeline'        },
  { label: 'Travel',        path: '/travel'          },
  { label: 'Leads',         path: '/leads'           },
] as const

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  for (const { label, path } of PAGES) {
    test(`${label} page loads without error`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expectNoError(page)
      expect(page.url()).toContain(path)
    })
  }

  test('nav sidebar links are all reachable', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const navLinks = page.locator('nav a[href], aside a[href]')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)

    // Ensure each nav link href doesn't 404
    const hrefs: string[] = []
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href')
      if (href && href.startsWith('/') && !href.includes('http')) {
        hrefs.push(href)
      }
    }

    for (const href of hrefs) {
      const resp = await page.request.get(href)
      // Accept 200 (page) or 401/403 (auth-guarded) — never 404 or 500
      expect([200, 401, 403], `${href} returned ${resp.status()}`).toContain(resp.status())
    }
  })

  test('browser back button works after navigation', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await page.goto('/pipeline')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/pipeline')

    await page.goBack()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard')
  })

  test('direct URL navigation works when authenticated', async ({ page }) => {
    // Navigate directly to a deep page (not from landing)
    await page.goto('/monthly')
    await page.waitForLoadState('networkidle')
    await expectNoError(page)
    expect(page.url()).not.toContain('/login')
  })

  test('unknown route does not crash the app', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await page.waitForLoadState('networkidle')
    // SPA should handle gracefully — either redirect or show 404 UI, not crash
    await expectNoError(page)
  })
})
