import { test } from '@playwright/test'

test('screenshot growth plan sections', async ({ page }) => {
  page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('http://localhost:5173/login')
  await page.waitForSelector('#login-email', { timeout: 5000 })
  await page.fill('#login-email', 'nlaaroubi@nyaaa.com')
  await page.fill('#login-password', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })
  
  await page.goto('http://localhost:5173/growth-plan')
  await page.waitForTimeout(12000)
  
  // Screenshot the revenue composition section
  await page.locator('#revenue-composition').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/growth-revenue.png' })
  
  // Screenshot the member footprint / map section
  await page.locator('#member-footprint').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/growth-map.png' })
  
  // Screenshot penetration section
  await page.locator('#penetration-glance').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/growth-funnels.png' })
  
  // Screenshot market health section
  await page.locator('#market-health').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/growth-health.png' })
  
  // Screenshot product section
  await page.locator('#membership').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/growth-membership.png' })
  
  console.log('All screenshots taken')
})
