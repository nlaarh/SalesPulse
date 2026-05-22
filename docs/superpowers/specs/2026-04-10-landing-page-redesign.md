# SalesPulse Landing Page Redesign — Design Spec

## Overview

Redesign the public landing page (`/`) as a marketing-quality showcase of SalesPulse capabilities. Target audience: CEOs, board members, AAA club executives. The page should feel like a premium product launch — animated, polished, corporate but alive.

Login form moves to separate `/login` route (already exists). Landing page is pure marketing with "Sign In" CTAs.

## Design Principles

- **Corporate polished with punch** — Navy/white professional palette, but animated and impressive
- **Show, don't tell** — 3D globe, animated heatmaps, assembling pipeline visuals
- **Executive attention span** — 6 sections, each one screen, each making one point
- **Performance-first animations** — GPU-accelerated CSS transforms + lightweight Three.js globe only

## Tech Stack

| Element | Technology | Weight |
|---------|-----------|--------|
| 3D Globe | Three.js (single canvas, particle system) | ~15KB gzipped |
| Scroll reveals | Intersection Observer + CSS keyframes | 0 dependencies |
| Counter animation | requestAnimationFrame | Native |
| 3D card tilt | CSS `perspective` + `transform` | Pure CSS |
| Pipeline assembly | CSS keyframe sequences | Pure CSS |
| Floating elements | CSS `translateY` loop | Pure CSS |

New dependency: `three` (Three.js). Everything else is CSS + native browser APIs.

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Navy primary | `#0a1628` | Hero bg, dark sections |
| Navy mid | `#162240` | Gradient endpoint |
| Accent blue | `#3b82f6` | Buttons, globe points, highlights |
| Accent cyan | `#06b6d4` | Connection lines, secondary glow |
| White | `#ffffff` | Text on dark, light section bg |
| Warm gray | `#f8f9fa` | Alternating light section bg |
| Gold | `#f59e0b` | Stat highlights, premium accents |

## Typography

- Headlines: `font-size: 3rem` (48px), `font-weight: 700`, white on dark / navy on light
- Subheadlines: `font-size: 1.25rem` (20px), `font-weight: 400`, muted opacity
- Body: `font-size: 1.125rem` (18px), comfortable reading for exec audience
- Stats: `font-size: 4rem` (64px), bold, gold or blue accent

## Page Structure — 6 Sections

### Section 1: Hero — "The Globe"

**Layout:** Full viewport height, dark navy gradient bg (`#0a1628` → `#162240`), centered content.

**3D Globe:**
- Three.js particle globe, center of screen
- ~200 glowing data points on sphere surface (blue/cyan)
- Pulsing connection lines between random point pairs
- Slow auto-rotation (Y axis, 0.001 rad/frame)
- Semi-transparent, content overlays on top
- On mobile: static CSS radial gradient fallback (no Three.js)

**Content (overlaid on globe):**
- Large headline fades in (0.5s delay):
  > **See Every Opportunity.**
  > **From Every Angle.**
- Subtext fades in (1s delay):
  > *"SalesPulse combines Salesforce pipeline, US Census demographics, and real-time market intelligence into one platform."*
- Two buttons fade in (1.5s delay):
  - **"Sign In"** — solid blue (`#3b82f6`), routes to `/login`
  - **"Explore Features"** — ghost outline white, smooth scrolls to Section 2
- Scroll indicator arrow at bottom, pulsing opacity animation

**Animations:**
- Globe fades in over 2s on mount
- Text elements stagger fade-in with `translateY(20px)` → `translateY(0)`
- Scroll indicator: infinite `translateY` bounce (0 → 8px → 0, 2s loop)

---

### Section 2: Territory Intelligence

**Layout:** White bg. Two-column: text left (55%), visual right (45%). Reverses to stacked on mobile.

**Visual (right):**
- Dark rounded card (`#0f1729`, `border-radius: 1rem`)
- Inside: 15-20 colored circles of varying sizes positioned absolutely
- Circles pulse gently (scale 1 → 1.1 → 1, staggered, 3s loop each)
- Colors: blue for travel, cyan for insurance, blended for combined
- A faint grid overlay (CSS `linear-gradient` lines) simulates map coordinates
- Overall effect: artistic heatmap that evokes the real territory map

**Content (left):**
- Section label: `"TERRITORY INTELLIGENCE"` — small, uppercase, letter-spaced, blue accent
- Headline slides in from left: **"Zip-Code Precision. County-Level Clarity."**
- Three feature pills, stagger in (0.2s apart):
  - "Interactive penetration heatmaps"
  - "County boundary overlays"
  - "Insurance + Travel layer toggles"
- Each pill: rounded bg, icon left, text right
- Floating stat card (glass bg, subtle shadow): **"1,107"** zip codes tracked — animates up from bottom

**Scroll trigger:** All elements animate in when section enters 20% of viewport.

---

### Section 3: Census & Market Data

**Layout:** Warm gray bg (`#f8f9fa`). Two-column reversed: visual left (45%), text right (55%).

**Visual (left):**
- Three cards in a slight arc/fan arrangement
- Each card has `perspective: 1000px`, slight `rotateY` (-5deg, 0, 5deg)
- On hover: card tilts toward mouse via CSS `transform: rotateX/rotateY` (max 10deg)
- Cards have dark bg, each showing:
  - Card 1: Users icon + "Demographics" + "Population & age breakdowns"
  - Card 2: DollarSign icon + "Median Income" + "Household economics by zip"
  - Card 3: AlertTriangle icon + "Market Signals" + "Advisories & enrollment windows"
- Cards have subtle glow border (`box-shadow` with accent cyan, low opacity)

**Content (right):**
- Section label: `"EXTERNAL INTELLIGENCE"`
- Headline: **"Data That Lives Outside Salesforce."**
- Three description blocks, stagger fade-in:
  - Census demographics by zip code & county
  - Medicare enrollment windows & travel advisories
  - Seasonal patterns that trigger proactive outreach
- Floating stat: **"26 counties"** of demographic coverage

---

### Section 4: AI-Powered Pipeline

**Layout:** Dark navy bg (same as hero). Full-width centered content.

**Visual (center, above text):**
- Pipeline funnel — 5 horizontal bars stacked vertically, widest at top
- Each bar represents a stage: Prospect → Qualified → Proposal → Negotiation → Won
- Bars slide in from alternating sides (left, right, left...) and stack
- Each bar glows briefly on landing (box-shadow pulse)
- Bars have gradient fills (blue → cyan)
- Subtle particle trail follows each bar as it slides in

**Content (below funnel):**
- Headline centered: **"AI That Thinks Like Your Best Manager."**
- Three columns, fade in staggered (0.3s apart):
  - **Column 1 — Deal Scoring**
    - Icon: Target
    - "Every opportunity ranked by AI-calculated close probability"
  - **Column 2 — Cross-Sell Detection**
    - Icon: GitBranch
    - "Travel→Insurance gaps identified and prioritized automatically"
  - **Column 3 — Executive Briefs**
    - Icon: FileText
    - "AI-generated narratives — insight, not just numbers"

---

### Section 5: Results — Animated Counters

**Layout:** White bg. Centered content. Clean and spacious.

**Counters (top):**
- Four large numbers in a row, evenly spaced
- Each counter ticks up from 0 when scrolled into view (1.5s duration, ease-out)
- Layout per counter: large number (4rem, bold, navy) + label below (muted, smaller)
  - **57** — Travel Advisors
  - **18** — Analytics Modules
  - **<1s** — Query Response (this one types in character-by-character)
  - **3** — Data Sources Combined

**Trust strip (below):**
- Horizontal row of badge-style items, subtle gray bg pills
- Scrolls slowly left (CSS `translateX` animation, infinite, 30s loop)
- Items: "Salesforce OAuth 2.0" · "Role-Based Access" · "Real-Time Sync" · "Dual-Layer Cache" · "AI Executive Briefs" · "Full Audit Trail"
- Duplicated for seamless infinite scroll

---

### Section 6: CTA & Footer

**Layout:** Dark gradient matching hero. Shorter section (~60vh).

**Visual:**
- The 3D globe reappears at 40% opacity, smaller, right-aligned
- On mobile: subtle radial gradient instead

**Content (left-aligned or centered):**
- Headline: **"Ready to see what your data really says?"**
- Single large CTA button: **"Sign In →"** — solid blue, larger than hero buttons
- Below button: *"Request a demo"* text link (secondary, for future use)

**Footer bar (bottom):**
- Dark border-top separator
- Left: "AAA Western & Central NY"
- Center: "SalesPulse" + small logo
- Right: "Built for sales leaders."
- Small text, muted color

---

## File Structure

```
frontend/src/pages/Landing.tsx          — Main page component, section orchestration
frontend/src/components/landing/
  HeroGlobe.tsx                         — Three.js globe (lazy-loaded)
  HeroSection.tsx                       — Hero layout, text, CTAs
  TerritorySection.tsx                  — Section 2
  CensusMarketSection.tsx               — Section 3
  PipelineSection.tsx                   — Section 4
  ResultsSection.tsx                    — Section 5 (counters + trust strip)
  CTAFooter.tsx                         — Section 6
  ScrollReveal.tsx                      — Reusable Intersection Observer wrapper
  useCountUp.ts                         — Hook for animated counter
  useScrollReveal.ts                    — Hook for scroll-triggered visibility
```

Each section is its own component. Landing.tsx just stacks them. HeroGlobe is lazy-loaded so Three.js doesn't block initial paint.

## Routing Changes

- `/` renders `Landing.tsx` (replaces current landing)
- `/login` remains as-is (existing Login.tsx)
- Landing page "Sign In" buttons route to `/login`
- Current landing content is fully replaced

## Mobile Behavior

- All two-column sections stack vertically
- 3D globe replaced with CSS radial gradient + floating particles (pure CSS)
- Pipeline funnel animates top-to-bottom instead of sides
- Trust strip still scrolls horizontally
- Counter numbers scale down to 3rem
- All animations respect `prefers-reduced-motion: reduce` (disable transforms, use opacity only)

## Accessibility

- All images/canvas have `aria-hidden="true"` (decorative)
- Section headlines are proper `<h2>` hierarchy
- CTA buttons have explicit labels
- Sufficient contrast: white on navy = 15:1+
- `prefers-reduced-motion` disables all motion, shows static layout
- Tab order: Sign In (hero) → Explore Features → Sign In (footer)

## Performance Budget

- Three.js loaded via dynamic `import()` — doesn't block page render
- No images — all visuals are CSS or canvas-generated
- Target: Lighthouse Performance 90+ on mobile
- Globe canvas: 60fps target, fallback to 30fps on low-power devices via `matchMedia('(prefers-reduced-motion)')` and battery API check
