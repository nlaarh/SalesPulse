import { test, expect } from '@playwright/test'
import * as path from 'path'

test('screenshot system health topology on 5173', async ({ page }) => {
  page.setViewportSize({ width: 1920, height: 1080 })
  console.log('Navigating to login page on port 5173...')
  await page.goto('http://localhost:5173/login')
  
  // Try nlaaroubi@nyaaa.com with password 8coDxQB!CB1*
  await page.getByLabel(/email/i).fill('nlaaroubi@nyaaa.com')
  await page.getByLabel(/password/i).fill('8coDxQB!CB1*')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  
  try {
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 10000 })
    console.log('Successfully logged in as nlaaroubi@nyaaa.com')
  } catch (e) {
    console.log('Failed to log in as nlaaroubi. Trying swas@nyaaa.com...')
    // Try swas@nyaaa.com with password Vfm&5z7C*1eX
    await page.goto('http://localhost:5173/login')
    await page.getByLabel(/email/i).fill('swas@nyaaa.com')
    await page.getByLabel(/password/i).fill('Vfm&5z7C*1eX')
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    await page.waitForURL('**/dashboard**', { timeout: 10000 })
    console.log('Successfully logged in as swas@nyaaa.com')
  }
  
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
