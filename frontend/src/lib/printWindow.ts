/**
 * printFromDom — captures a live DOM element and opens it in a clean
 * light-mode print window, preserving ALL rendered content (including
 * dynamically loaded AI analysis, charts, etc.).
 *
 * Strategy:
 *  1. Clone the target element's HTML (all dynamic content included)
 *  2. Copy the app's CSS stylesheet links (Tailwind + custom vars)
 *  3. Open a new window without the `.dark` class → light mode CSS applies
 *  4. Inject override CSS to hide action buttons and force white bg
 *  5. Auto-trigger print dialog on load
 */
export function printFromDom(elementId: string, title: string) {
  const el = document.getElementById(elementId)
  if (!el) { alert('Content not ready — please wait for the page to fully load.'); return }

  // Collect all <link rel="stylesheet"> from the current page
  const styleLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map(l => `<link rel="stylesheet" href="${l.href}">`)
    .join('\n')

  // Collect any <style> tags (Vite sometimes injects critical CSS inline)
  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map(s => `<style>${s.textContent}</style>`)
    .join('\n')

  const content = el.innerHTML

  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups to print / save as PDF'); return }

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${styleLinks}
  ${inlineStyles}
  <style>
    /* ── Force light mode (no .dark class on root) ── */
    :root {
      color-scheme: light !important;
    }
    /* ── Clean white background ── */
    body, html {
      background: #fff !important;
      color: #0f172a !important;
      padding: 16px 24px !important;
      font-family: Inter, Arial, sans-serif !important;
    }
    /* ── Hide interactive chrome: nav, buttons, popovers, tooltips ── */
    [data-no-print],
    .no-print,
    button,
    [role="dialog"],
    [data-radix-popper-content-wrapper] {
      display: none !important;
    }
    /* ── Ensure content fills the page ── */
    .mx-auto { max-width: 1100px !important; }
    /* ── Don't clip any overflow ── */
    * { overflow: visible !important; }
    /* ── Print page settings ── */
    @media print {
      @page { margin: 1.2cm; size: A4 portrait; }
      body { padding: 0 !important; }
    }
  </style>
</head>
<body>
  <div style="max-width:1100px;margin:0 auto">
    ${content}
  </div>
  <script>
    // Auto-print once fonts/styles are loaded
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  <\/script>
</body>
</html>`)
  w.document.close()
}
