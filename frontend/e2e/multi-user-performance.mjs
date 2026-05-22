import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const ROUNDS = Number(process.env.ROUNDS ?? '1')
const HEADLESS = process.env.HEADLESS !== 'false'

const USERS = [
  { email: 'nlaaroubi@nyaaa.com', password: process.env.SEED_PW_NLAAROUBI ?? '', role: 'Super Admin' },
  { email: 'swas@nyaaa.com', password: process.env.SEED_PW_SWAS ?? '', role: 'Officer' },
  { email: 'clawrence@nyaaa.com', password: process.env.SEED_PW_CLAWRENCE ?? '', role: 'Officer' },
  { email: 'akelly@nyaaa.com', password: process.env.SEED_PW_AKELLY ?? '', role: 'Travel Manager' },
  { email: 'jnicotra@nyaaa.com', password: process.env.SEED_PW_JNICOTRA ?? '', role: 'Travel Director' },
]

const PAGES = [
  { path: '/dashboard', heading: 'Sales Performance' },
  { path: '/pipeline', heading: 'Pipeline & Forecasting' },
  { path: '/opportunities', heading: 'Top Opportunities' },
]

function percentile(sortedValues, pct) {
  if (!sortedValues.length) return 0
  if (sortedValues.length === 1) return sortedValues[0]
  const index = (sortedValues.length - 1) * pct
  const lower = Math.floor(index)
  const upper = Math.min(lower + 1, sortedValues.length - 1)
  const weight = index - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function summarizeTimings(name, values) {
  const sorted = [...values].sort((a, b) => a - b)
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length
  return {
    name,
    min: Math.min(...sorted),
    avg,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: Math.max(...sorted),
  }
}

async function measureStep(page, label, action, ready) {
  const started = performance.now()
  await action()
  if (ready?.type === 'heading') {
    await page.getByRole('heading', { name: ready.value }).waitFor({ timeout: 60_000 })
  } else if (ready?.type === 'loadstate') {
    await page.waitForLoadState(ready.value, { timeout: 60_000 })
  }
  const durationMs = performance.now() - started
  return { label, durationMs }
}

async function runUserRound(browser, user, round) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  const failedRequests = []
  const metrics = []

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown'
    if (errorText === 'net::ERR_ABORTED' && request.url().includes('/api/auth/me')) return
    failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`)
  })

  try {
    metrics.push(await measureStep(
      page,
      'goto_login',
      () => page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' }),
      { type: 'heading', value: 'SalesPulse' },
    ))
    metrics.push(await measureStep(page, 'login', async () => {
      await page.getByLabel(/email/i).fill(user.email)
      await page.getByLabel(/password/i).fill(user.password)
      const [loginResponse] = await Promise.all([
        page.waitForResponse((response) => response.url().includes('/api/auth/login'), { timeout: 30_000 }),
        page.getByRole('button', { name: /sign in|log in/i }).click(),
      ])
      if (loginResponse.status() !== 200) {
        throw new Error(`login response ${loginResponse.status()}`)
      }
      await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 30_000 })
    }, { type: 'heading', value: 'Sales Performance' }))

    for (const target of PAGES) {
      metrics.push(await measureStep(
        page,
        target.path,
        () => page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'domcontentloaded' }),
        { type: 'heading', value: target.heading },
      ))
    }

    return {
      user: user.email,
      role: user.role,
      round,
      ok: errors.length === 0 && failedRequests.length === 0,
      metrics,
      errors,
      failedRequests,
    }
  } catch (err) {
    errors.push(`exception: ${err instanceof Error ? err.message : String(err)}`)
    return {
      user: user.email,
      role: user.role,
      round,
      ok: false,
      metrics,
      errors,
      failedRequests,
    }
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS })
  try {
    const allResults = []
    for (let round = 1; round <= ROUNDS; round += 1) {
      const results = await Promise.all(USERS.map((user) => runUserRound(browser, user, round)))
      allResults.push(...results)
    }

    const allMetrics = new Map()
    for (const result of allResults) {
      for (const metric of result.metrics) {
        const bucket = allMetrics.get(metric.label) ?? []
        bucket.push(metric.durationMs)
        allMetrics.set(metric.label, bucket)
      }
    }

    const failures = allResults.filter((r) => !r.ok)
    console.log('=== Browser Multi-User Performance Run ===')
    console.log(`base_url=${BASE_URL}`)
    console.log(`users=${USERS.length} rounds=${ROUNDS} total_sessions=${allResults.length}`)
    console.log(`failures=${failures.length}`)
    for (const [label, values] of allMetrics.entries()) {
      const stats = summarizeTimings(label, values)
      console.log(
        `${stats.name}: min=${stats.min.toFixed(1)} avg=${stats.avg.toFixed(1)} p50=${stats.p50.toFixed(1)} p95=${stats.p95.toFixed(1)} max=${stats.max.toFixed(1)} ms`
      )
    }

    if (failures.length) {
      console.log('=== Failures ===')
      for (const failure of failures) {
        console.log(`${failure.user} (${failure.role}) round=${failure.round}`)
        for (const error of failure.errors) console.log(`  error: ${error}`)
        for (const req of failure.failedRequests.slice(0, 10)) console.log(`  requestfailed: ${req}`)
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
