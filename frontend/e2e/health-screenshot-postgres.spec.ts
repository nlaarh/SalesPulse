import { test, expect } from '@playwright/test'
import * as path from 'path'

test('screenshot system health topology with postgres', async ({ page }) => {
  page.setViewportSize({ width: 1920, height: 1080 })
  console.log('Navigating to login page on port 5173...')
  await page.goto('http://localhost:5173/login')
  
  // Fill in login credentials
  await page.getByLabel(/email/i).fill('nlaaroubi@nyaaa.com')
  await page.getByLabel(/password/i).fill('Hh%9hXrL')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 15000 })
  console.log('Dashboard loaded. Current URL:', page.url())
  
  // Navigate to settings system health tab
  await page.goto('http://localhost:5173/settings?tab=system')
  
  // Wait for topology container
  await page.waitForSelector('.card-premium', { timeout: 15000 })
  // Wait extra time for health checks to load
  await page.waitForTimeout(5000)
  
  // Take screenshot of the topology container
  const artifactDir = '/Users/abdennourlaaroubi/.gemini/antigravity-cli/brain/682795e6-c2b6-4226-9241-3dc788ac7940'
  const screenshotPath = path.join(artifactDir, 'health_switchboard.png')
  
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log(`Screenshot saved to: ${screenshotPath}`)
})
