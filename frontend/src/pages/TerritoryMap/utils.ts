import type { TerritoryZip } from '@/lib/api'
import { type PathOptions } from 'leaflet'

export type RegionFilter = 'All' | 'Western' | 'Rochester' | 'Central'
export type ZoomLevel = 'region' | 'city' | 'zip'

export interface CountyVehicleStats {
  total: number
  electric: number
  ev_pct: number
}

export interface MapBubble {
  key: string
  label: string
  sublabel: string
  lat: number
  lng: number
  members: number
  ins_customers_cy: number
  ins_penetration: number
  ins_rev_cy: number
  ins_rev_py: number
  travel_customers_3yr: number
  travel_customers_cy: number
  travel_customers_py: number
  travel_penetration: number
  travel_rev_cy: number
  travel_rev_py: number
  zip_count: number
  region: string
  population: number
  pop_18plus: number
  median_income: number
  median_age: number
  housing_units: number
  market_share: number
  rev_pct_of_total: number
}

export type BubbleRenderData = {
  key: string
  lat: number
  lng: number
  radius: number
  pathOptions: PathOptions
  bubble: MapBubble
}

export type ZipRenderData = {
  key: string
  lat: number
  lng: number
  radius: number
  pathOptions: PathOptions
  zip: TerritoryZip
}

// ── Color helpers ─────────────────────────────────────────────────────────────

export function penetrationColor(pct: number): string {
  const max = 5.0
  const ratio = Math.min(pct / max, 1)
  if (ratio < 0.25) return '#ef4444'
  if (ratio < 0.5) return '#f97316'
  if (ratio < 0.75) return '#eab308'
  return '#22c55e'
}

export function penetrationOpacity(pct: number): number {
  return Math.max(0.35, Math.min(0.85, pct / 5.0))
}

export function getBubblePenetration(b: MapBubble): number {
  return (b.ins_penetration + b.travel_penetration) / 2
}

export function getPenetration(z: TerritoryZip): number {
  return (z.ins_penetration + z.travel_penetration) / 2
}

export function bubbleRadius(members: number, level: ZoomLevel): number {
  if (level === 'region') {
    if (members >= 300000) return 45
    if (members >= 200000) return 38
    return 30
  }
  if (level === 'city') {
    if (members >= 15000) return 22
    if (members >= 5000) return 17
    if (members >= 2000) return 13
    if (members >= 500) return 10
    return 7
  }
  // zip
  if (members >= 3000) return 14
  if (members >= 1500) return 11
  if (members >= 500) return 9
  if (members >= 200) return 7
  return 5
}

export function vehicleColor(evPct: number): string {
  if (evPct < 1) return '#94a3b8'
  if (evPct < 2) return '#fcd34d'
  if (evPct < 3) return '#fbbf24'
  if (evPct < 5) return '#f59e0b'
  return '#10b981'
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

export function aggregateZips(zips: TerritoryZip[], groupBy: 'region' | 'city', totalRevCy: number): MapBubble[] {
  const groups = new Map<string, TerritoryZip[]>()
  for (const z of zips) {
    const key = groupBy === 'region' ? z.region : `${z.city}|${z.region}`
    const arr = groups.get(key) || []
    arr.push(z)
    groups.set(key, arr)
  }

  const bubbles: MapBubble[] = []
  for (const [key, group] of groups) {
    const members = group.reduce((s, z) => s + z.members, 0)
    const ins_cy = group.reduce((s, z) => s + z.ins_customers_cy, 0)
    const travel_3yr = group.reduce((s, z) => s + z.travel_customers_3yr, 0)
    const tc_cy = group.reduce((s, z) => s + z.travel_customers_cy, 0)
    const tc_py = group.reduce((s, z) => s + z.travel_customers_py, 0)
    const tr_cy = group.reduce((s, z) => s + z.travel_rev_cy, 0)
    const tr_py = group.reduce((s, z) => s + z.travel_rev_py, 0)
    const ir_cy = group.reduce((s, z) => s + z.ins_rev_cy, 0)
    const ir_py = group.reduce((s, z) => s + z.ins_rev_py, 0)
    const pop = group.reduce((s, z) => s + (z.population || 0), 0)
    const pop18 = group.reduce((s, z) => s + (z.pop_18plus || 0), 0)
    const housing = group.reduce((s, z) => s + (z.housing_units || 0), 0)

    const totalPop = pop || 1
    const wIncome = group.reduce((s, z) => s + (z.median_income || 0) * (z.population || 0), 0) / totalPop
    const wAge = group.reduce((s, z) => s + (z.median_age || 0) * (z.population || 0), 0) / totalPop

    const lat = group.reduce((s, z) => s + z.lat * z.members, 0) / members
    const lng = group.reduce((s, z) => s + z.lng * z.members, 0) / members

    const cityName = groupBy === 'city' ? key.split('|')[0] : ''
    const regionName = groupBy === 'region' ? key : group[0].region

    bubbles.push({
      key,
      label: groupBy === 'region' ? `${regionName} Region` : (cityName || 'Unknown'),
      sublabel: groupBy === 'region'
        ? `${group.length} zips`
        : `${regionName} · ${group.length} zip${group.length > 1 ? 's' : ''}`,
      lat, lng,
      members,
      ins_customers_cy: ins_cy,
      ins_penetration: members ? Math.round(ins_cy / members * 1000) / 10 : 0,
      ins_rev_cy: ir_cy,
      ins_rev_py: ir_py,
      travel_customers_3yr: travel_3yr,
      travel_customers_cy: tc_cy,
      travel_customers_py: tc_py,
      travel_penetration: members ? Math.round(travel_3yr / members * 1000) / 10 : 0,
      travel_rev_cy: tr_cy,
      travel_rev_py: tr_py,
      zip_count: group.length,
      region: regionName,
      population: pop,
      pop_18plus: pop18,
      median_income: Math.round(wIncome),
      median_age: Math.round(wAge * 10) / 10,
      housing_units: housing,
      market_share: pop ? Math.round(members / pop * 10000) / 100 : 0,
      rev_pct_of_total: totalRevCy ? Math.round(tr_cy / totalRevCy * 10000) / 100 : 0,
    })
  }
  return bubbles.sort((a, b) => b.members - a.members)
}

export function zoomToLevel(zoom: number): ZoomLevel {
  if (zoom <= 11) return 'city'
  return 'zip'
}

// ── Formatters ────────────────────────────────────────────────────────────────

export const fmt = (n: number) => n.toLocaleString()
export const fmtPct = (n: number) => `${n.toFixed(1)}%`
export const fmtCurrency = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n.toFixed(0)}`
