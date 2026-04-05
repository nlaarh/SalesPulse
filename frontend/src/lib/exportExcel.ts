/**
 * Excel export utility using SheetJS.
 * Usage: exportToExcel(rows, filename)
 * where rows is an array of plain objects — keys become column headers.
 */
import * as XLSX from 'xlsx'

export function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-width columns
  const colWidths = Object.keys(rows[0]).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
  }))
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
