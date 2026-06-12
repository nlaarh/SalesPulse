"""
reports_html.py — HTML helpers, CSS, and build_html() for Travel Board report.
Imports chart functions from reports_charts and assembles the full HTML document.
"""
import os, logging, threading
from reports_charts import (
    N1, N2, N3, T1, T2, G1, R1, GR1, GR2, GR3,
    chart_revenue_trend, chart_monthly, chart_products,
    chart_destinations, chart_age, chart_county_map, chart_income_segment,
)

log = logging.getLogger("reports_html")

# ─── AI narrative client (lazy, thread-safe) ─────────────────────────────────

_ai_client = None
_ai_lock   = threading.Lock()

def _get_ai_client():
    global _ai_client
    if _ai_client is not None:
        return _ai_client
    with _ai_lock:
        if _ai_client is not None:
            return _ai_client
        try:
            from routers.ai_config import get_ai_config
            cfg = get_ai_config()
            api_key = cfg.get('api_key') or os.getenv('OPENAI_API_KEY')
        except Exception:
            api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            log.warning("No OPENAI_API_KEY — report narratives will use fallback text")
            return None
        try:
            from openai import OpenAI
            _ai_client = OpenAI(api_key=api_key)
        except Exception as e:
            log.warning(f"OpenAI init failed: {e}")
    return _ai_client


def _ai_narrative(prompt: str, fallback: str, max_tokens: int = 400) -> str:
    """Call GPT-4o-mini for a narrative snippet. Returns fallback if AI unavailable."""
    client = _get_ai_client()
    if not client:
        return fallback
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    "You are a senior travel division analyst writing board-grade narrative for "
                    "AAA Western & Central New York. Voice: executive, data-driven, specific. "
                    "Use the exact numbers provided. Write in flowing prose paragraphs (no markdown, "
                    "no bullet points, no headers). 2-4 paragraphs max. Every sentence must reference "
                    "a specific metric, county, product, or dollar figure from the data."
                )},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.45,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        log.warning(f"AI narrative failed: {e}")
        return fallback


def _generate_narratives(data: dict) -> dict:
    """Generate all AI narratives in parallel threads. Returns dict of section -> text."""
    totals    = data["totals"]
    products  = data["products"]
    dests     = data["destinations"]
    ct_types  = data["customer_types"]
    plabel    = data["period_label"]

    comm    = totals["commission"]
    gross   = totals["gross"]
    cust    = totals["customers"]
    trips   = totals["trips"]
    margin  = comm / max(gross, 1) * 100
    avg_pc  = comm / max(cust, 1)

    top_prod = products[0] if products else {}
    top_dest = max(dests, key=lambda x: x["commission"]) if dests else {}
    member_r = ct_types[0] if ct_types else {}
    prosp_r  = ct_types[1] if len(ct_types) > 1 else {}

    intl_comm = sum(x["commission"] for x in dests if x.get("intl") is True)
    dom_comm  = sum(x["commission"] for x in dests if x.get("intl") is False)
    intl_pct  = intl_comm / max(comm, 1) * 100
    dom_pct   = dom_comm  / max(comm, 1) * 100

    prompts = {
        "exec_letter": (
            f"Write the 'Letter to the Board' executive summary for AAA WCNY Travel division. "
            f"Period: {plabel}. Key metrics: ${comm/1e6:.1f}M commission income on ${gross/1e6:.0f}M gross sales, "
            f"{cust:,} unique travelers, {trips:,} booked trips, {margin:.1f}% average margin, "
            f"${avg_pc:,.0f} commission per traveler. "
            f"Top product: {top_prod.get('name','Cruise')} at ${top_prod.get('commission',0)/1e6:.2f}M. "
            f"Top destination: {top_dest.get('dest','Europe')}. "
            f"International revenue: {intl_pct:.0f}% of commission. Domestic: {dom_pct:.0f}%. "
            f"Member share of revenue: {member_r.get('commission',0)/max(comm,1)*100:.0f}% "
            f"({member_r.get('customers',0):,} travelers). "
            f"Only ~4% of 851K members book travel with AAA annually. "
            f"Explain the recovery arc post-COVID, the structural advantage in cruise+international tours at 13% margin, "
            f"the 28% margin on travel insurance being underutilized, and the massive whitespace in member penetration."
        ),
        "exec_findings": (
            f"Write 2-3 sentences each for 4 key findings for the AAA WCNY Travel board report, period {plabel}. "
            f"Finding 1: Cruise + International Tours combined commission share and why it's a structural advantage over OTAs. "
            f"Finding 2: Customer count still below pre-COVID baseline (32-34K/yr vs 41-42K in 2018-2019), "
            f"revenue recovered via higher spend per customer masking a retention/acquisition gap. "
            f"Finding 3: Only 4% member penetration rate against 851K members — each 1-point lift = ~8,500 travelers and ~$4M gross. "
            f"Finding 4: Travel Insurance at 28% margin is the highest-margin product — higher attach rate is pure incremental profit. "
            f"Return exactly 4 paragraphs, one per finding, no labels."
        ),
        "dest_narrative": (
            f"Write 2 paragraphs analyzing travel destination revenue for AAA WCNY, period {plabel}. "
            f"International destinations generate {intl_pct:.0f}% of commission (${intl_comm/1e6:.1f}M), "
            f"domestic {dom_pct:.0f}% (${dom_comm/1e6:.1f}M). "
            f"Top destination: {top_dest.get('dest','Europe')} at ${top_dest.get('commission',0)/1e6:.2f}M. "
            f"Europe leads commission while domestic dominates trip volume. "
            f"Explain the margin story: international trips at 13-14% margin vs domestic at 10-12%. "
            f"Note the product-destination overlap (cruise = international, domestic tour = USA)."
        ),
        "strat_narrative": (
            f"Write 2 paragraphs framing the strategic growth priorities for AAA WCNY Travel, period {plabel}. "
            f"Core opportunity: closing the 96% gap in member penetration (only {cust:,} travelers out of 851K members). "
            f"Each 1% penetration lift = ~8,500 travelers = ~$1.2M additional commission annually. "
            f"Insurance attach rate at 60%; lifting to 80% on ${gross/1e6:.0f}M gross = +$700K at 28% margin with zero extra volume. "
            f"Non-member (prospect) segment: {prosp_r.get('customers',0):,} prospect travelers represent "
            f"immediate conversion opportunity. Monroe County (Pittsford/Fairport) averages $100K+ income but only 4-6% penetration. "
            f"Frame these as executable over 12-18 months with specific dollar targets."
        ),
    }

    fallbacks = {
        "exec_letter": (
            f"For the period <strong>{plabel}</strong>, AAA WCNY's Travel division generated "
            f"<strong>${comm/1e6:.1f}M in commission income</strong> on ${gross/1e6:.0f}M in gross trip sales — "
            f"serving {cust:,} unique travelers across {trips:,} booked trips at an average margin of {margin:.1f}%. "
            f"Commission per traveler stands at ${avg_pc:,.0f}, reflecting the sustained post-COVID shift "
            f"toward higher-spend per-trip bookings even as total traveler count remains below the 2018–2019 baseline of 41–42K/year."
            f"<br><br>With only ~4% of our 851K members booking travel with AAA annually, the structural whitespace is enormous. "
            f"Cruise and International Tours together drive over 50% of all commission income at 13% margins — "
            f"our structural advantage over direct-booking OTAs. Travel Insurance at 28% margin remains underutilized as an attach."
        ),
        "exec_findings": (
            "Cruise and International Tours combined represent our highest-commission categories at 13% margin — "
            "a structural advantage that direct-booking OTAs cannot match. "
            "Customer count remains below the pre-COVID baseline of 41–42K/year, with revenue recovery masking a retention gap. "
            "Only 4% of 851K members book travel annually — each 1-point penetration lift equals ~8,500 new travelers. "
            "Travel Insurance at 28% margin is the highest-margin product in the portfolio and is underutilized as an attach."
        ),
        "dest_narrative": (
            f"International destinations generate {intl_pct:.0f}% of commission at higher margins than domestic travel. "
            f"Europe leads by commission while domestic USA destinations dominate trip volume. "
            f"The margin story favors international: cruise and international tours average 13–14% versus 10–12% for domestic tours."
        ),
        "strat_narrative": (
            f"The primary growth lever is closing the member penetration gap — only {cust:,} of 851K members travel with AAA annually. "
            f"Each 1% lift equals ~8,500 travelers and ~$1.2M in additional commission. "
            f"Insurance attach rate improvement and Monroe County market development represent the next highest-impact priorities."
        ),
    }

    from concurrent.futures import ThreadPoolExecutor, as_completed
    results = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(_ai_narrative, prompts[k], fallbacks[k]): k
            for k in prompts
        }
        for fut in as_completed(futures):
            key = futures[fut]
            try:
                results[key] = fut.result()
            except Exception as e:
                log.warning(f"Narrative '{key}' failed: {e}")
                results[key] = fallbacks[key]
    return results


TOP_ZIPS = [
    {"zip":"14221","city":"Buffalo (Amherst)",  "customers":6089,"revenue":2_172_568,"income":96_266, "pen":11.0},
    {"zip":"14450","city":"Fairport",            "customers":2446,"revenue":  613_254,"income":104_187,"pen":5.7},
    {"zip":"14226","city":"Buffalo (North)",     "customers":2117,"revenue":  494_659,"income":79_330, "pen":7.2},
    {"zip":"14051","city":"East Amherst",        "customers":2082,"revenue":  571_412,"income":116_964,"pen":10.5},
    {"zip":"14580","city":"Webster",             "customers":2060,"revenue":  441_000,"income":90_799, "pen":3.8},
    {"zip":"14127","city":"Orchard Park",        "customers":1997,"revenue":  492_000,"income":100_953,"pen":6.5},
    {"zip":"14075","city":"Hamburg",             "customers":1972,"revenue":  511_000,"income":76_691, "pen":4.4},
    {"zip":"14150","city":"Tonawanda",           "customers":1954,"revenue":  415_000,"income":68_026, "pen":4.7},
    {"zip":"14224","city":"Buffalo (Cheektow.)", "customers":1838,"revenue":  465_000,"income":76_475, "pen":4.5},
    {"zip":"14534","city":"Pittsford",           "customers":1752,"revenue":  310_000,"income":139_667,"pen":5.2},
]

# ─── HTML component helpers ───────────────────────────────────────────────────

def _kpi(value, label, sub="", color=T1):
    return (f'<div class="kpi-card"><div class="kpi-value" style="color:{color}">{value}</div>'
            f'<div class="kpi-label">{label}</div>'
            + (f'<div class="kpi-sub">{sub}</div>' if sub else "") + '</div>')

def _finding(num, head, body, border=T1):
    return (f'<div class="finding" style="border-left-color:{border}">'
            f'<div class="finding-num" style="color:{border}">{num}</div>'
            f'<div><div class="finding-head">{head}</div>'
            f'<div class="finding-body">{body}</div></div></div>')

def _insight_box(emoji, title, body, color=T1):
    items = "".join(f"<p>{line}</p>" for line in body) if isinstance(body, list) else f"<p>{body}</p>"
    return (f'<div class="insight-box" style="border-left:4px solid {color}">'
            f'<div class="insight-title">{emoji} {title}</div>'
            f'{items}</div>')

def _opp(rank, title, current, target, actions, color=T1):
    acts = "".join(f"<li>{a}</li>" for a in actions)
    return (f'<div class="opp-card"><div class="opp-rank" style="background:{color}">{rank}</div>'
            f'<div class="opp-content"><div class="opp-title">{title}</div>'
            f'<div class="opp-meta"><span><strong>Now:</strong> {current}</span>'
            f'<span><strong>Target:</strong> {target}</span></div>'
            f'<ul class="opp-actions">{acts}</ul></div></div>')

def _dest_row(d, total):
    pct = d["commission"]/total*100; w = min(pct/18*100, 100)
    color = T1 if d.get("intl") else (N3 if d.get("intl") is False else G1)
    badge = "INTL" if d.get("intl") else ("DOM" if d.get("intl") is False else "GRP")
    return (f'<tr><td><span class="badge" style="background:{color}22;color:{color}">{badge}</span> {d["dest"]}</td>'
            f'<td class="num">${d["commission"]/1e6:.2f}M</td><td class="num">{pct:.1f}%</td>'
            f'<td class="num">{d.get("trips",0):,}</td><td class="num">${d.get("gross",0)/1e6:.1f}M</td>'
            f'<td><div class="bar-wrap"><div class="bar-fill" style="width:{w:.0f}%;background:{color}"></div></div></td></tr>')

def _ctype_row(ct, total):
    avg = ct["commission"] / max(ct["customers"], 1); pct = ct["commission"]/total*100
    return (f'<tr><td><strong>{ct["type"]}</strong></td>'
            f'<td class="num">${ct["commission"]/1e6:.2f}M</td>'
            f'<td class="num">{pct:.1f}%</td>'
            f'<td class="num">{ct["customers"]:,}</td>'
            f'<td class="num">${avg:,.0f}</td></tr>')

def _zip_row(z, i):
    bg = "#F7FAFD" if i%2==0 else "white"
    pc = T1 if z["pen"]>7 else (G1 if z["pen"]>4 else GR2)
    return (f'<tr style="background:{bg}"><td><strong>{z["zip"]}</strong></td><td>{z["city"]}</td>'
            f'<td class="num">{z["customers"]:,}</td>'
            f'<td class="num">${z["revenue"]/1e3:.0f}K</td>'
            f'<td class="num">${z["income"]:,}</td>'
            f'<td class="num" style="color:{pc};font-weight:600">{z["pen"]:.1f}%</td></tr>')


# ─── CSS ──────────────────────────────────────────────────────────────────────

def _css():
    return f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;background:#F4F7FB;color:{GR1};line-height:1.6}}
.page{{max-width:1200px;margin:0 auto;padding:0 32px 80px}}
.top-bar{{background:{N1};color:white;padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:52px;position:sticky;top:0;z-index:100}}
.top-bar .org{{font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase}}
.top-bar .date{{font-size:12px;opacity:.65}}
.hero{{background:linear-gradient(135deg,{N1} 0%,{N2} 55%,{T1} 100%);color:white;padding:64px 48px 56px;margin:0 -32px 48px}}
.hero-eyebrow{{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;opacity:.7;margin-bottom:14px}}
.hero-title{{font-size:40px;font-weight:800;line-height:1.13;margin-bottom:8px;letter-spacing:-.5px}}
.hero-sub{{font-size:16px;opacity:.8;margin-bottom:36px}}
.hero-pills{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:36px}}
.pill{{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:white}}
.hero-kpis{{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:rgba(255,255,255,.12);border-radius:8px;overflow:hidden}}
.hero-kpi{{background:rgba(255,255,255,.08);padding:22px 16px;text-align:center}}
.hero-kpi:first-child{{border-left:3px solid {T2}}}
.hkv{{font-size:30px;font-weight:800;color:{T2};display:block;line-height:1.1}}
.hkl{{font-size:10.5px;opacity:.7;margin-top:4px;display:block;text-transform:uppercase;letter-spacing:.8px}}
.section{{margin-bottom:56px}}
.section-header{{display:flex;align-items:flex-start;gap:18px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid {GR3}}}
.snum{{font-size:11px;font-weight:800;color:white;background:{T1};width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:3px}}
.stb .label{{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:{T1};margin-bottom:4px}}
.stb h2{{font-size:26px;font-weight:800;color:{N1};line-height:1.2;letter-spacing:-.3px}}
.stb p{{font-size:14.5px;color:{GR2};margin-top:4px}}
.exec-card{{background:white;border-radius:10px;padding:36px 40px;box-shadow:0 1px 4px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.04);margin-bottom:28px}}
.exec-card h3{{font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:{T1};margin-bottom:14px}}
.exec-card p{{font-size:15px;color:{GR1};line-height:1.75;margin-bottom:12px}}
.exec-card p:last-child{{margin-bottom:0}}
.findings-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}}
.finding{{background:white;border-radius:8px;padding:20px 22px;display:flex;gap:16px;box-shadow:0 1px 3px rgba(0,0,0,.05);border-left:4px solid {T1}}}
.finding-num{{font-size:26px;font-weight:800;line-height:1;flex-shrink:0;min-width:30px;margin-top:2px}}
.finding-head{{font-size:14px;font-weight:700;color:{N1};margin-bottom:4px}}
.finding-body{{font-size:13px;color:{GR2};line-height:1.55}}
.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}
.card{{background:white;border-radius:10px;padding:24px 26px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 2px 10px rgba(0,0,0,.04)}}
.card h4{{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;color:{GR2};margin-bottom:16px}}
.chart-img{{width:100%;height:auto;display:block;border-radius:6px}}
.kpi-grid-4{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}}
.kpi-grid-3{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}}
.kpi-card{{background:white;border-radius:8px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.05);border-top:3px solid {T1};text-align:center}}
.kpi-value{{font-size:26px;font-weight:800;line-height:1.1}}
.kpi-label{{font-size:11px;color:{GR2};margin-top:4px;text-transform:uppercase;letter-spacing:.8px}}
.kpi-sub{{font-size:11.5px;color:{GR1};margin-top:6px}}
.data-table{{width:100%;border-collapse:collapse;font-size:13px}}
.data-table thead tr{{background:{N1};color:white}}
.data-table thead th{{padding:10px 12px;font-size:10.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-align:left}}
.data-table thead th.num{{text-align:right}}
.data-table tbody tr{{border-bottom:1px solid #F0F4F8}}
.data-table tbody tr:hover{{background:#F7FAFD!important}}
.data-table td{{padding:9px 12px}}
.data-table td.num{{text-align:right;font-variant-numeric:tabular-nums;color:{N1};font-weight:500}}
.bar-wrap{{background:{GR3};border-radius:4px;height:8px;width:120px}}
.bar-fill{{height:8px;border-radius:4px}}
.badge{{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:4px}}
.trend-box{{background:linear-gradient(135deg,{N1}10,{T1}10);border:1px solid {T1}44;border-radius:8px;padding:16px 20px;margin-bottom:14px}}
.opp-grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.opp-card{{background:white;border-radius:10px;overflow:hidden;display:flex;box-shadow:0 1px 3px rgba(0,0,0,.06),0 3px 12px rgba(0,0,0,.04)}}
.opp-rank{{width:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:white;writing-mode:vertical-rl;letter-spacing:3px}}
.opp-content{{padding:18px 20px;flex:1}}
.opp-title{{font-size:15px;font-weight:700;color:{N1};margin-bottom:8px}}
.opp-meta{{display:flex;gap:20px;font-size:12.5px;color:{GR2};margin-bottom:10px;flex-wrap:wrap}}
.opp-actions{{font-size:12.5px;color:{GR1};padding-left:16px}}
.opp-actions li{{margin-bottom:4px}}
.footnote{{font-size:11px;color:{GR2};margin-top:8px;font-style:italic}}
.insight-box{{background:white;border-radius:8px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:16px}}
.insight-box p{{font-size:13.5px;color:{GR1};line-height:1.65;margin-bottom:8px}}
.insight-box p:last-child{{margin-bottom:0}}
.insight-title{{font-size:13px;font-weight:700;color:{N1};margin-bottom:8px}}
.insight-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}}
.appendix-label{{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{GR2};margin-bottom:6px}}
@media print{{.top-bar{{position:relative}};body{{background:white}}}}
"""


# ─── main HTML builder ────────────────────────────────────────────────────────

def build_html(d: dict) -> str:
    totals   = d["totals"]; ct_types = d["customer_types"]
    products = d["products"]; dests = d["destinations"]
    monthly  = d["monthly"]; plabel = d["period_label"]
    sd = d["start_date_str"]; ed = d["end_date_str"]; gen_at = d["generated_at"]

    try: py_start = int(sd[:4])
    except: py_start = 2024
    try: py_end = int(ed[:4])
    except: py_end = 2026

    # Generate AI narratives and charts in parallel threads
    from concurrent.futures import ThreadPoolExecutor

    print("Generating charts and AI narratives in parallel…")
    with ThreadPoolExecutor(max_workers=2) as ex:
        narr_fut = ex.submit(_generate_narratives, d)
        def _make_charts():
            return (
                chart_revenue_trend(py_start, py_end),
                chart_monthly(monthly),
                chart_products(products),
                chart_destinations(dests),
                chart_age(),
                chart_county_map(),
                chart_income_segment(),
            )
        chart_fut = ex.submit(_make_charts)
        narr = narr_fut.result()
        c_trend, c_month, c_prod, c_dest, c_age, (c_geo, c_cty), c_inc = chart_fut.result()
    print("Charts + narratives done.")

    comm = totals["commission"]; gross = totals["gross"]
    customers = totals["customers"]; trips = totals["trips"]
    avg_per_cust = comm / max(customers, 1)
    margin = comm / max(gross, 1) * 100

    total_comm = sum(x["commission"] for x in dests)
    dest_rows  = "".join(_dest_row(x, total_comm) for x in sorted(dests, key=lambda x: x["commission"], reverse=True))
    ctype_rows = "".join(_ctype_row(ct, comm) for ct in ct_types if ct["customers"] > 0)
    zip_rows   = "".join(_zip_row(z, i) for i, z in enumerate(TOP_ZIPS))

    geo_html = f'<img src="{c_geo}" class="chart-img">' if c_geo else "<p>Map unavailable</p>"
    cty_html = f'<img src="{c_cty}" class="chart-img">' if c_cty else ""
    inc_html = f'<img src="{c_inc}" class="chart-img">' if c_inc else ""
    yr_label = "Year" if py_end - py_start <= 1 else f"{py_end - py_start}-Year"

    member_row = ct_types[0] if ct_types else {"commission": 0, "customers": 0}
    prospect_row = ct_types[1] if len(ct_types) > 1 else {"customers": 0}

    # Split exec_findings narrative into 4 parts (AI returns 4 paragraphs separated by \n\n)
    _finding_paras = [p.strip() for p in narr.get("exec_findings", "").split("\n\n") if p.strip()]
    while len(_finding_paras) < 4:
        _finding_paras.append("")
    f1_text = _finding_paras[0] or "Cruise and International Tours at 13% margin are our structural advantage over direct-booking OTAs."
    f2_text = _finding_paras[1] or "Customer count remains below pre-COVID baseline — revenue recovery masks a retention/acquisition gap."
    f3_text = _finding_paras[2] or "Only 4% of 851K members travel with AAA annually. Each 1-point lift = ~8,500 additional travelers."
    f4_text = _finding_paras[3] or "Travel Insurance at 28% margin is the highest-margin product and is underutilized as an attach."

    exec_letter_html = "".join(
        f"<p>{para.strip()}</p>" for para in narr.get("exec_letter", "").split("\n\n") if para.strip()
    ) or f"<p>For the period <strong>{plabel}</strong>, AAA WCNY Travel division generated <strong>${comm/1e6:.1f}M commission</strong> on ${gross/1e6:.0f}M gross sales — {customers:,} travelers, {trips:,} trips, {margin:.1f}% margin.</p>"

    finding_1_html  = _finding("↗", "Cruise + Intl Tours = 50%+ of Revenue", f1_text, T1)
    finding_2_html  = _finding("↘", "Customer Count Still Below Pre-COVID",    f2_text, R1)
    finding_3_html  = _finding("◎", "4% Member Penetration Rate",              f3_text, G1)
    finding_4_html  = _finding("⬡", "Travel Insurance at 28% Margin",          f4_text, T1)

    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AAA WCNY — Travel Customer Analysis ({yr_label})</title>
<style>{_css()}</style></head><body>
<div class="top-bar">
  <span class="org">AAA Western &amp; Central New York</span>
  <span class="date">CONFIDENTIAL — Board &amp; Executive Use Only &nbsp;|&nbsp; Generated {gen_at}</span>
</div>
<div class="page">
<div class="hero">
  <div class="hero-eyebrow">Board &amp; Executive Presentation · Travel Division · {yr_label} Analysis</div>
  <div class="hero-title">AAA WCNY Travel<br>Customer Analysis</div>
  <div class="hero-sub">Deep dive: who our travelers are, where they come from, where they go, and where we grow next</div>
  <div class="hero-pills">
    <span class="pill">{plabel}</span>
    <span class="pill">Source: Power BI Travel Transactions</span>
    <span class="pill">Census &amp; Databricks Enrichment</span>
    <span class="pill">Historical Context 2019–2026</span>
  </div>
  <div class="hero-kpis">
    <div class="hero-kpi"><span class="hkv">${comm/1e6:.1f}M</span><span class="hkl">Commission Income</span></div>
    <div class="hero-kpi"><span class="hkv">${gross/1e6:.0f}M</span><span class="hkl">Gross Sales</span></div>
    <div class="hero-kpi"><span class="hkv">{customers:,}</span><span class="hkl">Unique Travelers</span></div>
    <div class="hero-kpi"><span class="hkv">{trips:,}</span><span class="hkl">Trips Booked</span></div>
    <div class="hero-kpi"><span class="hkv">{margin:.1f}%</span><span class="hkl">Avg Margin</span></div>
    <div class="hero-kpi"><span class="hkv">${avg_per_cust:,.0f}</span><span class="hkl">Commission / Traveler</span></div>
  </div>
</div>
<div class="section">
  <div class="section-header"><div class="snum">ES</div>
    <div class="stb"><div class="label">Executive Summary</div>
      <h2>Board-Level Overview &amp; Key Findings</h2>
      <p>{plabel} with 2019–2026 historical context</p></div></div>
  <div class="exec-card"><h3>Letter to the Board</h3>
    {exec_letter_html}
  </div>
  <div class="findings-grid">
    {finding_1_html}
    {finding_2_html}
    {finding_3_html}
    {finding_4_html}
  </div>
  <div class="card"><h4>Historical Context 2019–2026: Revenue Recovery Arc</h4>
    <img src="{c_trend}" class="chart-img">
    <p class="footnote">Source: Power BI travel_transactions_f (revenue_club_commission_amount, all transactions) · 2026 YTD through Jun 11</p></div>
</div>
<div class="section">
  <div class="section-header"><div class="snum">01</div>
    <div class="stb"><div class="label">Geographic Origin</div>
      <h2>Where Do Our Travelers Come From?</h2>
      <p>County-level origin analysis with Census demographic enrichment</p></div></div>
  <div class="kpi-grid-4">
    {_kpi("Erie Co.","Dominant Origin","Buffalo–Amherst cluster generates 45%+ of all travelers",T1)}
    {_kpi("Monroe Co.","Growth Opportunity","Fairport, Pittsford, Webster — high income, under-penetrated",N3)}
    {_kpi("$82,177","Avg HH Income","Census-weighted by traveler origin ZIP — upper-middle suburban",G1)}
    {_kpi("42.6 yrs","Median Age (Census proxy)","Traveler origin ZIPs — aligns with 45–64 peak travel cohort",GR1)}
  </div>
  <div class="two-col" style="margin-bottom:24px">
    <div class="card"><h4>County-Level Traveler Map (3-Year Origin, WCNY Territory)</h4>{geo_html}</div>
    <div class="card"><h4>Top 15 Counties by Traveler Count</h4>{cty_html}</div>
  </div>
  <div class="two-col">
    <div class="card">
      <h4>Top 10 Origin ZIPs (3-Year Traveler Count)</h4>
      <table class="data-table">
        <thead><tr><th>ZIP</th><th>City</th><th class="num">Travelers</th>
          <th class="num">3yr Revenue</th><th class="num">HH Income</th><th class="num">Penetration</th></tr></thead>
        <tbody>{zip_rows}</tbody>
      </table>
      <p class="footnote">Penetration = travelers ÷ ZIP population · Source: Census ACS</p>
    </div>
    <div class="card"><h4>Traveler Distribution by Household Income Band</h4>{inc_html}</div>
  </div>
  <div class="insight-grid">
    {_insight_box("📍","Geographic Intelligence — Where to Focus",[
      "Erie County concentration is both our strength and our risk. The top 5 ZIPs (all in Erie) account for approximately 20% of all 3-year travelers. Deep penetration here is our baseline, but geographic concentration creates revenue risk if this market softens.",
      "Monroe County (Pittsford, Fairport, Webster) represents the highest-upside growth market: median household income $100–140K, only 4–6% traveler penetration, and a professional/retiree demographic perfectly aligned with cruise and international tour products. This is the single clearest under-served opportunity in the territory.",
      "Onondaga (Syracuse), Broome, and St. Lawrence counties show traveler counts that underperform their population size — likely a coverage and awareness gap rather than lack of demand.",
    ], T1)}
    {_insight_box("🎯","ZIP Codes to Prioritize Next 12 Months",[
      "<strong>14534 (Pittsford)</strong> — $139K median income, only 5.2% penetration. Luxury cruise and international tour target.",
      "<strong>14051 (East Amherst)</strong> — $117K income, 10.5% penetration. Strong performer; deepen with river cruise and premium European tours.",
      "<strong>14450 (Fairport)</strong> — $104K income, 5.7% penetration. Monroe County anchor; open advisor capacity here.",
      "<strong>14580 (Webster)</strong> — $91K income, 3.8% penetration — lowest in top 10. Awareness campaign opportunity.",
    ], N3)}
  </div>
</div>
<div class="section">
  <div class="section-header"><div class="snum">02</div>
    <div class="stb"><div class="label">Destination Analysis</div>
      <h2>Where Are Our Travelers Going?</h2>
      <p>Europe leads commission; domestic dominates volume — product-destination overlap reveals the margin story</p></div></div>
  <div class="kpi-grid-4">
    {_kpi("Europe #1","Top Destination","Largest single region by commission in this period",T1)}
    {_kpi("52%","International Revenue","Europe, Alaska, Canada, Caribbean, Scandinavia, Great Britain",N3)}
    {_kpi("32%","Domestic USA Revenue","High volume but 10–12% margin vs 13–14% international",G1)}
    {_kpi("28%","Insurance Margin","Highest-margin product — needs higher attach rate",T1)}
  </div>
  <div class="card" style="margin-bottom:24px"><h4>Commission Income by Destination  ({plabel})</h4>
    <img src="{c_dest}" class="chart-img"></div>
  <div class="card" style="margin-bottom:24px"><h4>Revenue by Product — {plabel}</h4>
    <img src="{c_prod}" class="chart-img"></div>
  <div class="insight-grid">
    {_insight_box("🚢","Cruise + Europe = The Profit Engine",
      "Cruise and International Tours together generate the majority of all commission income — both running at ~13% margin. This is our structural advantage over direct-booking OTAs who cannot match the expertise, group pricing, and included value AAA advisors provide. Protecting and growing these two categories is the #1 revenue priority.", T1)}
    {_insight_box("🛡️","Travel Insurance: 28% Margin — Underutilized",
      "Travel Insurance is the highest-margin product in the entire portfolio at 28%. Attaching it to 80% of trips vs. the current ~60% would add approximately $700K annually with zero incremental trip volume required. Every uninsured booking is margin left on the table.", G1)}
    {_insight_box("🌍","Emerging: South America, Mexico, Caribbean-West",
      "Three destination regions each generating $380–505K with significant headroom. Mexico generates over 1,100 trips at under-monetized per-trip rates — tour packaging opportunity is real. South America and Caribbean-West show the fastest growth trajectory in the portfolio.", N3)}
  </div>
  <p style="font-size:11px;color:{GR2};margin-top:8px;font-style:italic">Full destination breakdown table available in the Appendix at the end of this report.</p>
</div>
<div class="section">
  <div class="section-header"><div class="snum">03</div>
    <div class="stb"><div class="label">Customer Demographics</div>
      <h2>Who Are Our Travelers?</h2>
      <p>Member age distribution, income segmentation, and the member vs. non-member revenue split</p></div></div>
  <div class="kpi-grid-4">
    {_kpi("65–74","Largest Member Age Band","176,966 active members — 24.6% of all active members",T1)}
    {_kpi("65%+","Members Age 45+","Senior-dominant member base; prime travel spending years",N3)}
    {_kpi(f"${avg_per_cust:,.0f}","Commission per Traveler","Period average — reflects sustained shift to higher-spend trips",G1)}
    {_kpi(f"{member_row['commission']/comm*100:.0f}%","Member Share of Revenue",f"{member_row['customers']:,} of {customers:,} travelers are AAA members",T1)}
  </div>
  <div class="two-col" style="margin-bottom:24px">
    <div class="card">
      <h4>Active Member Age Distribution (PBI Membership Consolidated)</h4>
      <img src="{c_age}" class="chart-img">
      <p class="footnote">Source: PBI membership_consolidated, status_code = A · ~826K active members with valid age data</p>
    </div>
    <div class="card"><h4>Traveler by Customer Type</h4>
      <table class="data-table">
        <thead><tr><th>Customer Type</th><th class="num">Commission</th>
          <th class="num">% Revenue</th><th class="num">Customers</th><th class="num">$/Customer</th></tr></thead>
        <tbody>{ctype_rows}</tbody>
      </table>
      <p class="footnote">Group/Affinity = bulk affinity bookings (AAA Group Cruises)</p>
    </div>
  </div>
  {_insight_box("👤","The AAA WCNY Traveler Profile",[
    "<strong>Typical traveler:</strong> AAA member, suburban homeowner, 45–65 years old, household income $75–125K, Erie or Monroe County — books a cruise or international tour every 1–2 years through a trusted AAA advisor.",
    "<strong>📍 Geography:</strong> Erie County ~45% · Monroe ~15–20% · Onondaga ~10% · Rest of territory ~25%",
    "<strong>💰 Income:</strong> Census-weighted median ~$82K — upper-middle suburban, price-aware but willing to pay for expertise and peace of mind.",
    "<strong>🎂 Age:</strong> Member base peaks 65–74 (largest cohort). Traveler origin ZIP median age 42–47 — the 45–64 sweet spot who still work, have disposable income, and travel 1–2 times per year.",
    "<strong>🔁 Loyalty:</strong> Repeat traveler rate is high — most top-ZIP customers have booked multiple times in 3 years. Retention of this core is far cheaper than acquiring new travelers.",
  ], T1)}
  <div class="card" style="margin-top:24px"><h4>Monthly Booking Cadence — Seasonality ({plabel})</h4>
    <img src="{c_month}" class="chart-img">
    <p class="footnote">February peak = advance summer booking season · September trough = post-summer lull · Partial months marked * · Year bands: teal=current, gold=prior yr</p>
  </div>
</div>
<div class="section">
  <div class="section-header"><div class="snum">04</div>
    <div class="stb"><div class="label">Strategic Priorities</div>
      <h2>Opportunities &amp; Where to Focus Next</h2>
      <p>Six data-backed growth vectors ranked by commission impact — executable over the next 12–18 months</p></div></div>
  <div class="kpi-grid-3" style="margin-bottom:28px">
    {_kpi("+$1.2M/yr","Member Penetration","Each 1% lift in 851K members = +8,500 travelers ≈ +$1.2M commission",T1)}
    {_kpi("+$700K/yr","Insurance Attach Rate","60% → 80% attach on all trips = +$700K at 28% margin, zero extra volume",G1)}
    {_kpi("+$800K/yr","Non-Member Conversion","Convert 2,000 Prospects to members → lower churn + higher LTV",N3)}
  </div>
  <div class="opp-grid">
    {_opp("01","Member Penetration — Close the 96% Gap","Only 4% of 851K members travel with AAA annually","5.5% penetration = +12,750 travelers = +$1.5M/yr commission",["Embed travel offer in every membership renewal communication","Agent KPI: first-time traveler activations tracked alongside revenue","Target 45–64 Erie and Monroe members — highest propensity cohort","Every membership conversation is a travel conversation — train advisors accordingly"],T1)}
    {_opp("02","Cruise Depth — Defend and Grow","Cruise = largest product category, 13% margin","Grow 15% to increase cruise commission 2 years forward",["Deepen preferred supplier relationships for better override tiers","Launch AAA-branded group cruise departures — 2 per quarter minimum","Cruise-certified advisor program: specialist designation earns higher incentive tier","Target Pittsford / East Amherst ($117K+ income) with luxury ocean and river cruise campaigns"],T1)}
    {_opp("03","Travel Insurance Attach Rate","28% margin — best margin in the portfolio","60% → 80% attach = +$700K/yr incremental commission",["Make insurance quote a mandatory non-skippable step in every booking workflow","Monthly attach rate scorecard published to all advisors","For high-gross trips (Europe, Alaska, cruises) set 90%+ attach target","Introduce annual multi-trip protection plan for 3+ trips/year customers"],G1)}
    {_opp("04","International Tour Expansion","Intl Tours = #2 product by revenue, 13% margin","Grow 15-20% over next 2 years",["Add Scandinavia itineraries — high margin, growing demand","Ireland and Greece above average margin — expand inventory allocation","South America emerging — launch 2 new packages targeting affluent Erie travelers","Exclusive AAA 'insider access' experiences to command OTA price premium"],N3)}
    {_opp("05","Non-Member Conversion Pipeline",f"{prospect_row['customers']:,} Prospect travelers in this period","Convert 2,500 to AAA membership in 12 months",["90-day post-trip membership offer sequence — loyalty highest immediately after travel","Quantify value: 'You saved $X on this trip — annual membership costs $Y'","Prospects with 2+ bookings are most convertible — target them first","Track Prospect → Member conversion rate as a monthly Travel KPI"],N3)}
    {_opp("06","Monroe County Market Development","Rochester ZIPs average $100K+ income but only 4–6% traveler penetration","Grow Monroe Co. to 20% of total travel revenue",["Open dedicated travel advisor capacity at Pittsford and Fairport branches","Partner with Rochester employers for corporate group and incentive travel","Host quarterly in-branch travel events — wine-paired destination showcases","Targeted digital campaign: 'Rochester's AAA Travel Specialists'"],GR1)}
  </div>
</div>
<div class="section">
  <div class="section-header"><div class="snum">A</div>
    <div class="stb"><div class="label">Appendix</div>
      <h2>Full Destination Breakdown</h2>
      <p>{plabel} — All destinations ranked by commission income</p></div></div>
  <div class="card">
    <table class="data-table">
      <thead><tr><th>Destination</th><th class="num">Commission</th><th class="num">Share</th>
        <th class="num">Trips</th><th class="num">Gross</th><th>Bar</th></tr></thead>
      <tbody>{dest_rows}</tbody>
    </table>
    <p class="footnote">Group/Uncat. = affinity group bookings + no destination classification · INTL = international · DOM = domestic USA</p>
  </div>
</div>
<div style="border-top:2px solid {GR3};padding-top:24px;margin-top:16px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
    <div style="font-size:12px;color:{GR2};line-height:1.9">
      <strong style="color:{N1}">Data Sources &amp; Methodology</strong><br>
      Primary: Power BI Travel Transactions — revenue_club_commission_amount (all transactions, no cancellation filter)<br>
      Consistent with established AAA reporting benchmarks: 2023 $14.0M | 2024 $14.72M | 2025 $14.37M<br>
      Geographic origin: Databricks travel_store_transactions_f (3-year) × Census ACS (income, age, population)<br>
      Demographics: PBI Membership Consolidated (active members, age distribution) · Period: {plabel}
    </div>
    <div style="font-size:12px;color:{GR2};text-align:right;flex-shrink:0;line-height:1.9">
      <strong style="color:{N1}">AAA Western &amp; Central New York</strong><br>
      Generated: {gen_at}<br>Classification: Confidential<br>Board &amp; Executive Use Only
    </div>
  </div>
</div>
</div></body></html>"""
