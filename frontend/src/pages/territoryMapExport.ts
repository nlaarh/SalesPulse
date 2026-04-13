/**
 * Territory Map — Excel export helper.
 *
 * Creates a multi-tab Excel workbook:
 *   Tab 1: "Territory Data" — members, insurance, travel per zip (map data)
 *   Tab 2: "Census Demographics" — population, income, age, housing per zip
 * Each tab includes a TOTAL summary row at the bottom.
 */
import * as XLSX from 'xlsx'
import type { TerritoryZip } from '@/lib/api'

/* ── Helpers ─────────────────────────────────────────────────────────── */

function pct(n: number): number { return Math.round(n * 10) / 10 }
function sum(zips: TerritoryZip[], fn: (z: TerritoryZip) => number): number {
  return zips.reduce((s, z) => s + fn(z), 0)
}
function wAvg(zips: TerritoryZip[], valFn: (z: TerritoryZip) => number, wFn: (z: TerritoryZip) => number): number {
  const tw = zips.reduce((s, z) => s + wFn(z), 0)
  return tw ? zips.reduce((s, z) => s + valFn(z) * wFn(z), 0) / tw : 0
}

/* ── Tab 1: Territory Data ───────────────────────────────────────────── */

function territoryRow(z: TerritoryZip, year: number): Record<string, unknown> {
  return {
    'Zip Code': z.zip,
    City: z.city || '',
    Region: z.region,
    County: z.county_name || '',
    Members: z.members,
    'Ins Customers': z.ins_customers_cy,
    'Ins Penetration %': pct(z.ins_penetration),
    [`Ins Revenue (${year})`]: z.ins_rev_cy,
    [`Ins Revenue (${year - 1})`]: z.ins_rev_py,
    'Travel Customers (3yr)': z.travel_customers_3yr,
    [`Travel Customers (${year})`]: z.travel_customers_cy,
    [`Travel Customers (${year - 1})`]: z.travel_customers_py,
    'Travel Penetration %': pct(z.travel_penetration),
    [`Travel Revenue (${year})`]: z.travel_rev_cy,
    [`Travel Revenue (${year - 1})`]: z.travel_rev_py,
    'Market Share %': pct(z.market_share),
  }
}

function territoryTotals(zips: TerritoryZip[], year: number): Record<string, unknown> {
  const mem = sum(zips, z => z.members)
  const ins = sum(zips, z => z.ins_customers_cy)
  const trv = sum(zips, z => z.travel_customers_3yr)
  const pop = sum(zips, z => z.population)
  return {
    'Zip Code': 'TOTAL',
    City: '', Region: `${zips.length} zips`, County: '',
    Members: mem,
    'Ins Customers': ins,
    'Ins Penetration %': mem ? pct(ins / mem * 100) : 0,
    [`Ins Revenue (${year})`]: sum(zips, z => z.ins_rev_cy),
    [`Ins Revenue (${year - 1})`]: sum(zips, z => z.ins_rev_py),
    'Travel Customers (3yr)': trv,
    [`Travel Customers (${year})`]: sum(zips, z => z.travel_customers_cy),
    [`Travel Customers (${year - 1})`]: sum(zips, z => z.travel_customers_py),
    'Travel Penetration %': mem ? pct(trv / mem * 100) : 0,
    [`Travel Revenue (${year})`]: sum(zips, z => z.travel_rev_cy),
    [`Travel Revenue (${year - 1})`]: sum(zips, z => z.travel_rev_py),
    'Market Share %': pop ? pct(mem / pop * 100) : 0,
  }
}

/* ── Tab 2: Census Demographics ──────────────────────────────────────── */

function censusRow(z: TerritoryZip): Record<string, unknown> {
  return {
    'Zip Code': z.zip,
    City: z.city || '',
    Region: z.region,
    County: z.county_name || '',
    Population: z.population,
    'Adults 18+': z.pop_18plus,
    'Median Income': z.median_income,
    'Median Age': z.median_age,
    'Housing Units': z.housing_units,
    'Median Home Value': z.median_home_value,
    'College Educated': z.college_educated,
    Members: z.members,
    'Market Share %': pct(z.market_share),
  }
}

function censusTotals(zips: TerritoryZip[]): Record<string, unknown> {
  const pop = sum(zips, z => z.population)
  const mem = sum(zips, z => z.members)
  return {
    'Zip Code': 'TOTAL',
    City: '', Region: `${zips.length} zips`, County: '',
    Population: pop,
    'Adults 18+': sum(zips, z => z.pop_18plus),
    'Median Income': Math.round(wAvg(zips, z => z.median_income, z => z.population)),
    'Median Age': Math.round(wAvg(zips, z => z.median_age, z => z.population) * 10) / 10,
    'Housing Units': sum(zips, z => z.housing_units),
    'Median Home Value': Math.round(wAvg(zips, z => z.median_home_value, z => z.population)),
    'College Educated': sum(zips, z => z.college_educated),
    Members: mem,
    'Market Share %': pop ? pct(mem / pop * 100) : 0,
  }
}

/* ── Build sheet with auto-width columns ─────────────────────────────── */

function makeSheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0]).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
  }))
  return ws
}

/* ── Public export ───────────────────────────────────────────────────── */

export function exportTerritoryMapData(
  zips: TerritoryZip[],
  year: number,
  regionLabel: string,
) {
  if (!zips.length) return

  // Tab 1: Territory Data
  const tRows = zips.map(z => territoryRow(z, year))
  tRows.push(territoryTotals(zips, year))

  // Tab 2: Census Demographics
  const cRows = zips.map(z => censusRow(z))
  cRows.push(censusTotals(zips))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, makeSheet(tRows), 'Territory Data')
  XLSX.utils.book_append_sheet(wb, makeSheet(cRows), 'Census Demographics')

  const suffix = regionLabel === 'All' ? 'All_Regions' : regionLabel
  XLSX.writeFile(wb, `Territory_Map_${suffix}_${year}.xlsx`)
}
