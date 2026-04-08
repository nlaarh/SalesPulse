import{c as e,p as t,s as n,t as r}from"./utils-DD841dd7.js";import{W as i}from"./api-BWrc6eUH.js";import{h as a,i as o,x as s}from"./index-C0-df6wn.js";var c=t(e(),1),l=n();function u({onSend:e,description:t,label:n=`Email`,defaultEmail:u=``}){let[d,f]=(0,c.useState)(!1),[p,m]=(0,c.useState)(u),[h,g]=(0,c.useState)(!1),[_,v]=(0,c.useState)(!1),[y,b]=(0,c.useState)(null),x=(0,c.useRef)(null);(0,c.useEffect)(()=>{u&&!p&&m(u)},[u]),(0,c.useEffect)(()=>{if(!d)return;function e(e){x.current&&!x.current.contains(e.target)&&f(!1)}return document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[d]);async function S(){if(!(!p||h)){g(!0),b(null);try{await e(p),v(!0),setTimeout(()=>{f(!1),v(!1)},2200)}catch(e){b(e?.response?.data?.detail??e.message??`Failed to send`)}finally{g(!1)}}}return(0,l.jsxs)(`div`,{className:`relative`,ref:x,children:[(0,l.jsxs)(`button`,{onClick:()=>{f(e=>!e),v(!1),b(null)},className:r(`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors`,d?`border-primary/40 bg-primary/10 text-primary`:`border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground`),children:[(0,l.jsx)(a,{className:`h-3.5 w-3.5`}),n]}),d&&(0,l.jsxs)(`div`,{className:`absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-xl p-3`,children:[(0,l.jsxs)(`div`,{className:`flex items-center justify-between mb-2.5`,children:[(0,l.jsx)(`p`,{className:`text-[11px] font-semibold text-foreground`,children:`Send to email`}),(0,l.jsx)(`button`,{onClick:()=>f(!1),className:`text-muted-foreground hover:text-foreground`,children:(0,l.jsx)(o,{className:`w-3.5 h-3.5`})})]}),_?(0,l.jsxs)(`div`,{className:`flex items-center gap-2 py-2 text-emerald-500`,children:[(0,l.jsx)(s,{className:`w-4 h-4`}),(0,l.jsx)(`span`,{className:`text-xs font-medium`,children:`Report sent!`})]}):(0,l.jsxs)(l.Fragment,{children:[(0,l.jsxs)(`div`,{className:`flex gap-2`,children:[(0,l.jsx)(`input`,{type:`email`,value:p,onChange:e=>{m(e.target.value),b(null)},placeholder:`recipient@email.com`,onKeyDown:e=>{e.key===`Enter`&&S()},className:`flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40`}),(0,l.jsx)(`button`,{disabled:!p||h,onClick:S,className:`flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50`,children:h?(0,l.jsx)(i,{className:`h-3.5 w-3.5 animate-spin`}):`Send`})]}),y&&(0,l.jsx)(`p`,{className:`mt-1.5 text-[11px] text-rose-500`,children:y}),t&&(0,l.jsx)(`p`,{className:`mt-2 text-[10px] text-muted-foreground/50`,children:t})]})]})]})}function d(e,t){let n=document.getElementById(e);if(!n){alert(`Content not ready — please wait for the page to fully load.`);return}let r=Array.from(document.querySelectorAll(`link[rel="stylesheet"]`)).map(e=>`<link rel="stylesheet" href="${e.href}">`).join(`
`),i=Array.from(document.querySelectorAll(`style`)).map(e=>`<style>${e.textContent}</style>`).join(`
`),a=n.innerHTML,o=window.open(``,`_blank`);if(!o){alert(`Allow pop-ups to print / save as PDF`);return}o.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t}</title>
  ${r}
  ${i}
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
    ${a}
  </div>
  <script>
    // Auto-print once fonts/styles are loaded
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  <\/script>
</body>
</html>`),o.document.close()}export{u as n,d as t};