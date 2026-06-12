import { test, expect } from '@playwright/test'

test('Debug SF links', async ({ page }) => {
  // Intercept API response
  let apiResponse: any = null
  page.on('response', async (response) => {
    if (response.url().includes('zip-customers')) {
      apiResponse = await response.json()
      console.log('API Response sf_base_url:', apiResponse.sf_base_url)
      console.log('API Response first customer id:', apiResponse.customers?.[0]?.id)
    }
  })

  await page.goto('http://localhost:8001/login')
  await page.fill('input[type="email"]', 'nlaaroubi@nyaaa.com')
  await page.fill('input[type="password"]', '8coDxQB!CB1*')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })
  
  // Go directly to zip detail page
  await page.goto('http://localhost:8001/territory/14215')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(5000)
  
  // Check what's in the DOM
  const sfCol = await page.locator('th:has-text("SF")').count()
  console.log('SF column headers:', sfCol)
  
  const allLinks = await page.locator('a[target="_blank"]').count()
  console.log('All target=_blank links:', allLinks)
  
  const dashCells = await page.locator('td:last-child').allTextContents()
  console.log('Last column values (first 5):', dashCells.slice(0, 5))
  
  // Check via JS evaluation what sfBaseUrl is
  const pageState = await page.evaluate(() => {
    const links = document.querySelectorAll('a[title="Open in Salesforce"]')
    const dashes = document.querySelectorAll('td span.text-muted-foreground\\/30')
    return { sfLinkCount: links.length, dashCount: dashes.length }
  })
  console.log('Page state:', pageState)
  
  await page.screenshot({ path: '/tmp/zip-sf-debug.png', fullPage: false })
})
