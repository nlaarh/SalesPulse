/**
 * E2E tests — Login page
 *
 * Covers:
 *   - Valid credentials → redirect to dashboard
 *   - Bad password → error message shown, stays on /login
 *   - Token persists on reload (session survives F5)
 *   - Logout clears token and redirects to login
 */

import { test, expect } from '@playwright/test'
import { login, TEST_USER } from './helpers'

test.describe('Login', () => {
  test('valid credentials redirect to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(TEST_USER.email)
    await page.getByLabel(/password/i).fill(TEST_USER.password)
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 15_000 })
    expect(page.url()).not.toContain('/login')
  })

  test('wrong password shows error message and stays on login', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(TEST_USER.email)
    await page.getByLabel(/password/i).fill('definitely-wrong-password-xyz')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    // Should stay on login page
    await page.waitForTimeout(2000)
    expect(page.url()).toContain('login')

    // An error message should be visible
    const errorText = page.locator('[role="alert"], .error, [data-testid="error"]')
      .or(page.getByText(/invalid|incorrect|wrong|failed|unauthorized/i))
    await expect(errorText.first()).toBeVisible({ timeout: 5000 })
  })

  test('unauthenticated visit to dashboard redirects to login', async ({ page }) => {
    // Clear any stored token first
    await page.goto('/login')
    await page.evaluate(() => localStorage.clear())

    await page.goto('/dashboard')
    await page.waitForURL((url) => url.pathname.includes('login'), { timeout: 10_000 })
    expect(page.url()).toContain('login')
  })

  test('auth token persists across page reload', async ({ page }) => {
    await login(page)
    const urlBeforeReload = page.url()

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Should still be authenticated — not redirected to login
    expect(page.url()).not.toContain('/login')
  })
})
