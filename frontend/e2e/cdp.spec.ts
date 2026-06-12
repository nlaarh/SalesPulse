import { test } from '@playwright/test'
import { chromium } from '@playwright/test'

test('connect over cdp', async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222')
    console.log('✅ CDP CONNECTED')
    const contexts = browser.contexts()
    console.log(`Contexts found: ${contexts.length}`)
    for (let i = 0; i < contexts.length; i++) {
      const pages = contexts[i].pages()
      console.log(`Context ${i} pages:`, pages.map(p => p.url()))
      for (const page of pages) {
        if (page.url().includes('settings') && page.url().includes('tab=system')) {
          console.log(`Found active system health tab: ${page.url()}`)
          const artifactDir = '/Users/abdennourlaaroubi/.gemini/antigravity-cli/brain/682795e6-c2b6-4226-9241-3dc788ac7940'
          await page.screenshot({ path: `${artifactDir}/health_switchboard.png`, fullPage: true })
          console.log('Taken screenshot of active system health tab')
          return
        }
      }
    }
    console.log('❌ Active system health tab NOT found in open pages.')
  } catch (e: any) {
    console.log('❌ CDP CONNECTION FAILED:', e.message)
  }
})
