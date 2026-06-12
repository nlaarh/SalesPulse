import { test } from '@playwright/test'
import * as path from 'path'

test('screenshot system health topology', async ({ page }) => {
  page.setViewportSize({ width: 1920, height: 1080 })
  console.log('Navigating to login page on port 6199...')
  await page.goto('http://localhost:6199/login')
  console.log('Current URL:', page.url())
  
  // Fill in login credentials
  await page.waitForSelector('#login-email', { timeout: 10000 })
  await page.fill('#login-email', 'nlaaroubi@nyaaa.com')
  await page.fill('#login-password', 'Hh%9hXrL')
  await page.click('button[type="submit"]')
  
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 15000 })
  console.log('Dashboard loaded. Current URL:', page.url())
  
  // Navigate to settings system health tab
  await page.goto('http://localhost:6199/settings?tab=system')
  
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
