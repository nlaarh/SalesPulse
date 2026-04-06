/**
 * printWindow — opens a clean HTML string in a new window and triggers print.
 * Works around dark-theme / SPA layout issues with window.print().
 */
export function printWindow(html: string) {
  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups to print / save as PDF'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Wait for images/fonts to load before printing
  w.onload = () => { w.focus(); w.print() }
  // Fallback if onload already fired
  setTimeout(() => { try { w.focus(); w.print() } catch (_) { /* ignore */ } }, 600)
}

/** Shared print CSS injected into every print window */
export const PRINT_STYLES = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #0f172a; background: #fff; padding: 24px; }
    h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    h2 { font-size: 14px; font-weight: 700; margin: 18px 0 8px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    h3 { font-size: 12px; font-weight: 700; margin: 14px 0 6px; color: #374151; text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f8fafc; font-size: 11px; font-weight: 700; color: #6b7280; text-align: left; padding: 6px 10px; border-bottom: 2px solid #e5e7eb; }
    td { padding: 5px 10px; font-size: 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-green  { background: #d1fae5; color: #065f46; }
    .badge-blue   { background: #dbeafe; color: #1e40af; }
    .badge-amber  { background: #fef3c7; color: #92400e; }
    .badge-red    { background: #fee2e2; color: #991b1b; }
    .badge-purple { background: #ede9fe; color: #4c1d95; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .kpi-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
    .kpi-label { font-size: 10px; color: #6b7280; margin-bottom: 3px; }
    .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; }
    .header-bar { background: #1e293b; color: #fff; padding: 16px 20px; border-radius: 8px; margin-bottom: 18px; }
    .header-bar p { font-size: 11px; color: #94a3b8; margin-bottom: 3px; }
    .meta-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 14px; font-size: 12px; color: #374151; }
    .meta-row strong { color: #0f172a; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
    .product-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .product-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; text-align: center; font-size: 11px; }
    .product-box.active { border-color: #6366f1; background: #eef2ff; }
    .product-box .icon { font-size: 18px; margin-bottom: 3px; }
    @media print {
      body { padding: 12px; }
      @page { margin: 1cm; }
    }
  </style>
`
