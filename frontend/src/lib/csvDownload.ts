// CSV / Excel download helpers used by Growth Plan sections.
// Each chart/table on the page has a "Download" button — these utilities
// turn the in-memory data behind a chart into a downloadable file so the
// admin/exec can take it into their own analysis.

import * as XLSX from 'xlsx'

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string): void {
  if (!rows || rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(filename)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadXLSX(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
): void {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    if (!s.rows || s.rows.length === 0) continue
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${sanitizeFilename(filename)}.xlsx`)
}
