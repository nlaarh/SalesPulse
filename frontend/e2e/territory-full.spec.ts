import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8001';

test('Full territory flow: search, enter, drill-down', async ({ page }) => {
  // Login
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', 'nlaaroubi@nyaaa.com');
  await page.fill('input[type="password"]', '8coDxQB!CB1*');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|territory|sales)/, { timeout: 15000 });
  console.log('✅ Logged in');

  // Go to Territory Map
  await page.goto(`${BASE}/territory`);
  await page.waitForTimeout(5000);

  // Verify search box exists
  const searchInput = page.locator('input[placeholder*="Search zip"]');
  const searchVisible = await searchInput.isVisible();
  console.log(searchVisible ? '✅ Search box visible' : '❌ Search box NOT visible');

  if (!searchVisible) {
    const allInputs = await page.locator('input').all();
    console.log(`  Found ${allInputs.length} input(s) on page`);
    for (const inp of allInputs) {
      const ph = await inp.getAttribute('placeholder');
      console.log(`  Input placeholder: "${ph}"`);
    }
    await page.screenshot({ path: '/tmp/territory-nosearch.png', fullPage: true });
    throw new Error('Search box not found');
  }

  // Type zip and hit Enter
  await searchInput.click();
  await searchInput.fill('14225');
  await page.waitForTimeout(1000);

  // Check dropdown
  const dropdown = page.locator('button:has-text("14225")').first();
  const dropdownVisible = await dropdown.isVisible();
  console.log(dropdownVisible ? '✅ Dropdown appeared with 14225' : '⚠️ No dropdown');

  // Press Enter
  await searchInput.press('Enter');
  await page.waitForTimeout(2000);

  // Check if page updated
  const bigNumber = page.locator('text=843,897');
  const stillShowing = await bigNumber.isVisible();
  console.log(stillShowing ? '❌ Page NOT updated (still shows 843,897)' : '✅ Page updated after Enter');
  expect(stillShowing).toBe(false);

  // Check for zip detail panel / drill-down buttons
  const drillInsurance = page.locator('button:has-text("Insurance Customers"), button:has-text("View Insurance")').first();
  const drillTravel = page.locator('button:has-text("Travel Customers"), button:has-text("View Travel")').first();
  const insVisible = await drillInsurance.isVisible().catch(() => false);
  const trvVisible = await drillTravel.isVisible().catch(() => false);
  console.log(insVisible ? '✅ Insurance drill-down button visible' : '❌ Insurance drill-down NOT visible');
  console.log(trvVisible ? '✅ Travel drill-down button visible' : '❌ Travel drill-down NOT visible');

  // If drill-down visible, click it
  if (insVisible) {
    await drillInsurance.click();
    await page.waitForTimeout(3000);
    const customerRow = page.locator('table tbody tr').first();
    const hasCustomers = await customerRow.isVisible().catch(() => false);
    console.log(hasCustomers ? '✅ Customer table populated after drill-down' : '❌ Customer table empty');
  }

  // Check logout button
  const logoutBtn = page.locator('button:has-text("Logout")');
  const logoutVisible = await logoutBtn.isVisible().catch(() => false);
  console.log(logoutVisible ? '✅ Logout button visible' : '❌ Logout button NOT visible');

  // Tables before map
  const tableBox = await page.locator('text=Highest Penetration').first().boundingBox().catch(() => null);
  const mapBox = await page.locator('.leaflet-container').first().boundingBox().catch(() => null);
  if (tableBox && mapBox) {
    console.log(tableBox.y < mapBox.y
      ? `✅ Tables (y=${Math.round(tableBox.y)}) before map (y=${Math.round(mapBox.y)})`
      : `❌ Map (y=${Math.round(mapBox.y)}) before tables (y=${Math.round(tableBox.y)})`);
    expect(tableBox.y).toBeLessThan(mapBox.y);
  }

  await page.screenshot({ path: '/tmp/territory-final.png', fullPage: true });
  console.log('\n📸 Final screenshot: /tmp/territory-final.png');
});
