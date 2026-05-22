import { api } from './api'

export interface ProductOverview {
  total_footprint: number
  penetration_pct: number | null
  opportunity_dollars: number
  top_zips: Array<{
    zip: string
    city: string
    county: string
    value: number
    penetration: number | null
  }>
}

export interface TrendItem {
  year: number
  acquired?: number
  cancelled?: number
  net?: number
  // Insurance fields
  retention_pct?: number
  newb?: number
  canc?: number
  net_policies?: number
}

export interface GeoZip {
  zip: string
  city: string
  county: string
  value: number
  penetration: number | null
  population?: number
}

export interface ActionPlay {
  title: string
  target_count: number
  opportunity_dollars: number
}

export interface ProductReportData {
  product: string
  overview: ProductOverview
  trends: { yearly: TrendItem[] }
  retention: {
    by_year: Array<Record<string, any>>
    cancel_reasons: Array<Record<string, any>>
    by_segment: Array<Record<string, any>>
  }
  geography: {
    top_zips: GeoZip[]
    bottom_zips: GeoZip[]
  }
  actions: {
    total_opportunity: number
    plays: ActionPlay[]
  }
}

export type ProductType = 'membership' | 'auto' | 'home' | 'travel' | 'battery'

export async function fetchProductReport(
  product: ProductType,
  yearFrom?: number,
  yearTo?: number,
): Promise<ProductReportData> {
  const params: Record<string, any> = { product }
  if (yearFrom) params.year_from = yearFrom
  if (yearTo) params.year_to = yearTo
  const { data } = await api.get('/api/growth/product-report', { params })
  return data
}

export async function fetchProductNarrative(
  product: string,
  section: string,
  dataSummary: Record<string, any>,
): Promise<string> {
  try {
    const { data } = await api.post('/api/growth/product-report/narrative', {
      product,
      section,
      data_summary: dataSummary,
    })
    return data.narrative || ''
  } catch {
    return ''
  }
}
