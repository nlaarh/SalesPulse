/**
 * Shared helpers and constants for all Playwright E2E tests.
 *
 * Usage:
 *   import { login, BASE_URL, TEST_USER } from './helpers'
 */

import { Page, expect } from '@playwright/test'

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'

export const TEST_USER = {
  email:    process.env.TEST_EMAIL    ?? '',
  password: process.env.TEST_PASSWORD ?? '',
}

/** Log in and wait for the dashboard to be fully visible. */
export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_USER.email)
  await page.getByLabel(/password/i).fill(TEST_USER.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 15_000 })
}

/** Assert the page has no full-screen error/crash UI. */
export async function expectNoError(page: Page) {
  const body = page.locator('body')
  await expect(body).not.toContainText('Internal Server Error')
  await expect(body).not.toContainText('Something went wrong')
}
