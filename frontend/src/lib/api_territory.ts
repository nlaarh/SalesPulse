// ── Territory Map ─────────────────────────────────────────────────────────────

import { api, withDates } from './api'

export interface TerritoryZip {
  zip: string
  lat: number
  lng: number
  city: string
  region: string
  members: number
  ins_customers_cy: number
  ins_rev_cy: number
  ins_rev_py: number
  ins_penetration: number
  ins_pct_of_total: number
  travel_customers_3yr: number
  travel_customers_cy: number
  travel_customers_py: number
  travel_penetration: number
  travel_pct_of_total: number
  travel_rev_cy: number
  travel_rev_py: number
  rev_pct_of_total: number
  // Census demographics
  population: number
  pop_18plus: number
  median_income: number
  median_age: number
  housing_units: number
  median_home_value: number
  college_educated: number
  county_name: string
  market_share: number
}

export interface TerritoryTotals {
  members: number
  ins_customers: number
  ins_rev_cy: number
  ins_rev_py: number
  travel_customers_3yr: number
  travel_rev_cy: number
  travel_rev_py: number
  zip_count: number
  population: number
  market_share: number
}

export interface TerritoryRegionSummary {
  members: number
  ins_cy: number
  ins_rev_cy: number
  travel_3yr: number
  travel_rev_cy: number
  zip_count: number
  population: number
}

export interface TerritoryMapData {
  zips: TerritoryZip[]
  totals: TerritoryTotals
  regions: Record<string, TerritoryRegionSummary>
  year: number
}

export async function fetchTerritoryMapData(
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<TerritoryMapData> {
  const { data } = await api.get('/api/territory/map-data', {
    params: withDates({ period }, startDate, endDate),
  })
  return data as TerritoryMapData
}

// County boundary GeoJSON for map overlays
export interface CountyBoundaryData {
  county_geojson: GeoJSON.FeatureCollection
  zips: Array<{
    zip: string
    city: string
    county_fips: string
    county_name: string
    lat: number
    lng: number
    population: number
  }>
}

export async function fetchTerritoryBoundaries(includeZips = false): Promise<CountyBoundaryData> {
  const { data } = await api.get('/api/territory/boundaries', {
    params: { include_zips: includeZips },
  })
  return data as CountyBoundaryData
}

// ── Census Demographics ──────────────────────────────────────────────────────

export interface CensusZipRow {
  zip: string
  city: string
  county: string
  population: number
  pop_18plus: number
  median_income: number
  median_age: number
  housing_units: number
  median_home_value: number
  college_educated: number
  college_pct: number
}

export interface CensusCountyRow {
  county: string
  fips: string
  population: number
  pop_18plus: number
  median_income: number
  median_age: number
  housing_units: number
  median_home_value: number
  college_educated: number
  college_pct: number
}

export interface CensusDataResponse {
  level: 'zip' | 'county'
  rows: (CensusZipRow | CensusCountyRow)[]
  totals: Record<string, number>
  count: number
}

export async function fetchCensusData(level: 'zip' | 'county' = 'zip'): Promise<CensusDataResponse> {
  const { data } = await api.get('/api/territory/census-data', { params: { level } })
  return data as CensusDataResponse
}

// ── DMV Vehicle Demographics ──────────────────────────────────────────────────

export interface VehicleRegistrationRow {
  county: string
  model_year: string
  fuel_type: string
  vehicle_count: number
}

export interface VehicleDataResponse {
  level: 'county'
  rows: VehicleRegistrationRow[]
  totals: {
    vehicle_count: number
  }
  count: number
}

export async function fetchTerritoryVehicleData(): Promise<VehicleDataResponse> {
  const { data } = await api.get('/api/territory/vehicle-data')
  return data as VehicleDataResponse
}

// ── Growth Data Explorer datasets ────────────────────────────────────────────

export interface AgeCohortRow {
  cohort: string
  min_age: number | null
  max_age: number | null
  count: number
  pct_of_total: number
}

export interface CoverageTierRow {
  tier: string
  count: number
  pct_of_total: number
}

export interface DatasetEnvelope<T> {
  level: string
  as_of?: string
  rows: T[]
  totals: { count: number }
  count: number
}

export async function fetchCustomersByAge(): Promise<DatasetEnvelope<AgeCohortRow>> {
  const { data } = await api.get('/api/growth/data/customers-by-age')
  return data as DatasetEnvelope<AgeCohortRow>
}

export async function fetchCoverageTiers(): Promise<DatasetEnvelope<CoverageTierRow>> {
  const { data } = await api.get('/api/growth/data/coverage-tiers')
  return data as DatasetEnvelope<CoverageTierRow>
}

export async function refreshDataset(
  dataset: 'customers-by-age' | 'coverage-tiers' | 'vehicles' | 'zips' | 'all',
): Promise<{ ok: boolean; cleared?: Array<{ prefix: string; cleared: number }> }> {
  const { data } = await api.post('/api/growth/data/refresh', null, { params: { dataset } })
  return data
}

// ── Zip Customer Drill-down ──────────────────────────────────────────────────

export interface ZipCustomer {
  id: string
  name: string
  email: string
  phone: string
  member_id: string
  status: string
  plan: string
  city: string
  insurance_id?: string
  total_rev?: number
  trip_count?: number
  last_trip?: string
}

export interface ZipCustomersResponse {
  zip_code: string
  type: 'insurance' | 'travel'
  count: number
  customers: ZipCustomer[]
  sf_base_url?: string
}

export async function fetchZipCustomers(
  zipCode: string,
  type: 'insurance' | 'travel',
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<ZipCustomersResponse> {
  const { data } = await api.get('/api/territory/zip-customers', {
    params: withDates({ zip_code: zipCode, type, period }, startDate, endDate),
  })
  return data as ZipCustomersResponse
}

// ── Zip Census & Segment Data ──

export interface ZipCensusData {
  found: boolean
  zip_code: string
  city?: string
  county?: string
  coverage?: string
  region?: string
  registered_vehicles?: number
  vehicles_3plus_yrs?: number
  owner_occupied?: number
  untapped_homes?: number
  renter_occupied?: number
  population?: number
  adults_18plus?: number
  median_income?: number
  median_home_value?: number
  age_16_18?: number
  age_18_24?: number
  age_25_34?: number
  age_35_44?: number
  age_45_54?: number
  age_55_64?: number
  age_65_plus?: number
  housing_type?: string
  location_type?: string
}

export async function fetchZipCensus(zipCode: string): Promise<ZipCensusData> {
  const { data } = await api.get(`/api/territory/zip-census/${zipCode}`)
  return data as ZipCensusData
}

// ── Zip AI Insights ──

export interface ZipInsightsResponse {
  zip_code: string
  insights: string | null
  error: string | null
}

export async function fetchZipInsights(
  zipCode: string,
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<ZipInsightsResponse> {
  const { data } = await api.get(`/api/territory/zip-insights/${zipCode}`, {
    params: withDates({ period }, startDate, endDate),
  })
  return data as ZipInsightsResponse
}
