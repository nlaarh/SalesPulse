"""
reports_charts.py — Chart functions + HTML builder for the Travel Board report.
Called by reports_engine.py with live PBI data.
"""
from pathlib import Path
import json, csv, base64
from io import BytesIO
from collections import defaultdict
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

CENSUS_PATH = Path(__file__).resolve().parent / "seed_data" / "census_zips.json"
TZIP_PATH   = Path(__file__).resolve().parent / "seed_data" / "travel_by_zip.csv"
TZIPS_PATH  = Path(__file__).resolve().parent / "seed_data" / "growth_data" / "territory_zips.json"

N1="#0B2545"; N2="#1B3A6B"; N3="#2E5FA3"
T1="#00857C"; T2="#00B0A6"
G1="#C89A2E"; R1="#C0392B"
GR1="#4A5568"; GR2="#718096"; GR3="#E8EDF4"

STATIC_YEARS = {
    2019: {"commission":14_655_352,"gross":118_039_773,"customers":41_509,"trips":48_940},
    2020: {"commission": 2_344_294,"gross":  9_278_153,"customers":22_020,"trips":25_086},
    2021: {"commission": 5_664_056,"gross": 47_828_478,"customers":25_783,"trips":31_495},
    2022: {"commission":10_690_584,"gross": 88_921_939,"customers":31_746,"trips":38_624},
    2023: {"commission":14_000_553,"gross":110_274_544,"customers":35_037,"trips":41_449},
    2024: {"commission":14_717_420,"gross":110_961_695,"customers":33_949,"trips":40_003},
    2025: {"commission":14_372_940,"gross":109_729_310,"customers":32_453,"trips":38_985},
    2026: {"commission": 7_366_789,"gross": 55_385_422,"customers":18_221,"trips":19_941},
}
STATIC_MEMBER_AGES = [
    ("18–24",43_495),("25–34",86_982),("35–44",88_687),
    ("45–54",85_777),("55–64",134_859),("65–74",176_966),("75+",154_424),
]

MONTH_ORDER = {"JAN":1,"FEB":2,"MAR":3,"APR":4,"MAY":5,"JUN":6,
               "JUL":7,"AUG":8,"SEP":9,"OCT":10,"NOV":11,"DEC":12}
MONTH_SHORT = {"JAN":"Jan","FEB":"Feb","MAR":"Mar","APR":"Apr","MAY":"May","JUN":"Jun",
               "JUL":"Jul","AUG":"Aug","SEP":"Sep","OCT":"Oct","NOV":"Nov","DEC":"Dec"}

def sort_months(items):
    """Sort list of (fiscal_period_monthyear, ...) tuples chronologically."""
    def key(item):
        s = item[0].upper()
        return (int(s[3:])+2000, MONTH_ORDER.get(s[:3], 0))
    return sorted(items, key=key)

def fmt_month_label(s):
    """'MAY24' → 'May '24'  (apostrophe before 2-digit year)"""
    m = MONTH_SHORT.get(s[:3].upper(), s[:3])
    y = s[3:]
    return f"{m} '{y}"

# ─── chart helpers ───────────────────────────────────────────────────────────

def _b64(fig):
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode()

def _style_ax(ax, grid="y"):
    ax.set_facecolor("white")
    if "y" in grid: ax.yaxis.grid(True, color=GR3, linewidth=0.7, zorder=0)
    if "x" in grid: ax.xaxis.grid(True, color=GR3, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    for sp in ["top","right"]: ax.spines[sp].set_visible(False)
    ax.spines["left"].set_color(GR3); ax.spines["bottom"].set_color(GR3)
    ax.tick_params(colors=GR2, length=0, labelsize=9)

# ─── charts ──────────────────────────────────────────────────────────────────

def chart_revenue_trend(period_start_year, period_end_year):
    yrs = sorted(STATIC_YEARS.keys())
    comms = [STATIC_YEARS[y]["commission"]/1e6 for y in yrs]
    custs = [STATIC_YEARS[y]["customers"]/1000 for y in yrs]
    yr_labels = ["2019\n(pre-COVID)","2020\n(COVID)","2021","2022","2023","2024","2025","2026\nYTD"]
    bar_colors = [T1,R1,GR2,GR2,T1,T1,G1,GR2]

    fig, ax1 = plt.subplots(figsize=(10,4.0))
    fig.patch.set_facecolor("white"); _style_ax(ax1)
    x = np.arange(len(yrs))
    bars = ax1.bar(x, comms, 0.55, color=bar_colors, edgecolor="white", linewidth=0.5, zorder=3)

    pstart = max(yrs.index(period_start_year) - 0.4, 0) if period_start_year in yrs else 4.7
    pend   = min(yrs.index(period_end_year)   + 0.4, len(yrs)-0.6) if period_end_year in yrs else 7.3
    ax1.axvspan(pstart, pend, alpha=0.07, color=T1, zorder=0)
    mid = (pstart + pend) / 2
    ax1.text(mid, max(comms)*1.22, "Report\nPeriod", ha="center", fontsize=8, color=T1,
             fontweight="bold", bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=T1, linewidth=1))

    for bar, v in zip(bars, comms):
        if v > 0.5:
            ax1.text(bar.get_x()+bar.get_width()/2, v+0.25, f"${v:.1f}M",
                     ha="center", fontsize=8, fontweight="bold", color=N1)
    ax1.set_xticks(x); ax1.set_xticklabels(yr_labels, fontsize=8.5, color=N1)
    ax1.set_ylabel("Commission Income ($M)", fontsize=9, color=GR1, labelpad=8)
    ax1.set_ylim(0, max(comms)*1.38)

    ax2 = ax1.twinx()
    ax2.plot(x, custs, "o-", color=R1, lw=2.2, markersize=7, zorder=5)
    for i, c in enumerate(custs):
        ax2.text(i, c+max(custs)*0.06, f"{c:.0f}K",
                 ha="center", fontsize=7.5, fontweight="bold", color=R1)
    ax2.set_ylabel("Unique Customers (000s)", fontsize=9, color=R1, labelpad=8)
    ax2.set_ylim(0, max(custs)*1.5)
    for sp in ["top","right"]: ax2.spines[sp].set_visible(False)
    ax2.spines["left"].set_visible(False)
    ax2.tick_params(colors=GR2, length=0, labelsize=8.5)

    rev_p = mpatches.Patch(color=T1, label="Commission Income")
    cust_l = plt.Line2D([0],[0], color=R1, lw=2, marker="o", label="Unique Customers")
    ax1.legend(handles=[rev_p,cust_l], loc="upper left", fontsize=8.5, frameon=False, ncol=2)
    fig.tight_layout(pad=1.0)
    return _b64(fig)


def chart_monthly(monthly_data):
    """monthly_data: sorted list of (label, commission, customers)"""
    labels = [m[0] for m in monthly_data]
    comms  = [m[1]/1e6 for m in monthly_data]
    years  = [l[-2:] for l in labels]
    bar_colors = [T1 if y=="24" else (G1 if y=="25" else (T2 if y=="26" else GR2)) for y in years]
    if labels and labels[-1].endswith("*"):
        bar_colors[-1] = GR2

    fig, ax = plt.subplots(figsize=(12,3.6))
    fig.patch.set_facecolor("white"); _style_ax(ax)
    bars = ax.bar(range(len(monthly_data)), comms, 0.65, color=bar_colors,
                  edgecolor="white", linewidth=0.4, zorder=3)

    partial_excl = [v for l,v in zip(labels, comms) if not l.endswith("*")]
    avg = sum(partial_excl)/len(partial_excl) if partial_excl else sum(comms)/len(comms)
    ax.axhline(avg, color=N1, lw=1.4, ls="--", label=f"Monthly avg ${avg:.2f}M")

    # Year divider lines
    prev_y = None
    for i, y in enumerate(years):
        if prev_y and y != prev_y:
            ax.axvline(i-0.5, color=GR3, lw=1.5)
        prev_y = y

    # Year labels in centers
    year_positions = {}
    for i, y in enumerate(years):
        year_positions.setdefault(y, []).append(i)
    for y, positions in year_positions.items():
        mid = (positions[0] + positions[-1]) / 2
        color = T1 if y=="24" else (G1 if y=="25" else T2)
        ax.text(mid, max(comms)*1.22, f"20{y}", ha="center", fontsize=10, color=color, fontweight="bold")

    for bar, v in zip(bars, comms):
        ax.text(bar.get_x()+bar.get_width()/2, v+0.03, f"${v:.2f}M",
                ha="center", fontsize=6.5, color=N1, fontweight="600")
    ax.set_xticks(range(len(monthly_data)))
    ax.set_xticklabels(labels, fontsize=7.8, color=N1, rotation=35, ha="right")
    ax.set_ylabel("Commission ($M)", fontsize=9, color=GR1)
    ax.set_ylim(0, max(comms)*1.38)
    ax.legend(fontsize=8.5, frameon=False)
    fig.tight_layout(pad=1.0)
    return _b64(fig)


def chart_products(products):
    """products: list of {name, commission, gross, margin}"""
    prods = sorted([p for p in products if p["commission"] > 200_000], key=lambda x: x["commission"])
    total = sum(p["commission"] for p in products)
    pal   = [T2,T1,N3,G1,N2,"#6D5798",R1,GR2,GR2]
    fig, ax = plt.subplots(figsize=(7.2,4.4))
    fig.patch.set_facecolor("white"); _style_ax(ax, grid="x")
    bars = ax.barh([p["name"] for p in prods],
                   [p["commission"]/1e6 for p in prods],
                   color=pal[:len(prods)], edgecolor="white", linewidth=0.4, height=0.62, zorder=3)
    for bar, pr in zip(bars, prods):
        v = pr["commission"]/1e6; pct = pr["commission"]/total*100
        m = f"  margin {pr['margin']:.0f}%" if pr.get("margin") else ""
        ax.text(v+0.04, bar.get_y()+bar.get_height()/2,
                f"${v:.2f}M  ({pct:.0f}%){m}", va="center", fontsize=8.2, color=N1)
    ax.set_xlabel("Commission Income ($M)", fontsize=9, color=GR1)
    ax.set_xlim(0, max(p["commission"] for p in prods)/1e6 * 1.75)
    ax.tick_params(labelsize=9)
    fig.tight_layout(pad=1.0)
    return _b64(fig)


def chart_destinations(destinations):
    named = [d for d in destinations if d.get("dest") not in ("Group/Uncat.", None)]
    named = sorted(named, key=lambda x: x["commission"], reverse=True)[:12]
    named.reverse()
    total = sum(d["commission"] for d in destinations)
    fig, ax = plt.subplots(figsize=(7.5,4.4))
    fig.patch.set_facecolor("white"); _style_ax(ax, grid="x")
    colors_list = [T1 if d.get("intl") else N3 for d in named]
    bars = ax.barh([d["dest"] for d in named],
                   [d["commission"]/1e6 for d in named],
                   color=colors_list, edgecolor="white", linewidth=0.4, height=0.62, zorder=3)
    for bar, d in zip(bars, named):
        v = d["commission"]/1e6; pct = d["commission"]/total*100
        ax.text(v+0.04, bar.get_y()+bar.get_height()/2,
                f"${v:.2f}M ({pct:.1f}%)  {d.get('trips',0):,} trips",
                va="center", fontsize=8.2, color=N1)
    ax.set_xlabel("Commission Income ($M)", fontsize=9, color=GR1)
    ax.set_xlim(0, 7.5)
    ax.tick_params(labelsize=9)
    intl_p = mpatches.Patch(color=T1, label="International")
    dom_p  = mpatches.Patch(color=N3, label="Domestic USA")
    ax.legend(handles=[intl_p,dom_p], fontsize=8.5, frameon=False, loc="lower right")
    fig.tight_layout(pad=1.0)
    return _b64(fig)


def chart_age():
    labels=[a[0] for a in STATIC_MEMBER_AGES]; vals=[a[1]/1000 for a in STATIC_MEMBER_AGES]
    total=sum(a[1] for a in STATIC_MEMBER_AGES)
    colors_list=[GR2,GR2,N3,N3,T1,T1,T1]
    fig, ax = plt.subplots(figsize=(6.5,3.6))
    fig.patch.set_facecolor("white"); _style_ax(ax)
    ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontsize=9.5, color=N1)
    bars=ax.bar(range(len(labels)), vals, color=colors_list, edgecolor="white", linewidth=0.5, width=0.62, zorder=3)
    for bar, v, a in zip(bars, vals, STATIC_MEMBER_AGES):
        pct=a[1]/total*100
        ax.text(bar.get_x()+bar.get_width()/2, v+1.5, f"{v:.0f}K\n({pct:.0f}%)",
                ha="center", fontsize=7.8, color=N1, fontweight="600")
    ax.set_ylabel("Active Members (000s)", fontsize=9, color=GR1); ax.set_ylim(0, max(vals)*1.45)
    ax.axvspan(3.5, 6.5, alpha=0.07, color=T1, zorder=0)
    ax.text(5, max(vals)*1.28, "65%+ of members\nare 45 or older",
            ha="center", fontsize=8.5, color=T1, fontweight="bold",
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=T1, linewidth=1))
    fig.tight_layout(pad=1.0)
    return _b64(fig)


def chart_county_map():
    if not CENSUS_PATH.exists() or not TZIP_PATH.exists():
        return None, None
    with open(CENSUS_PATH) as f:
        census = {z["zip_code"]: z for z in json.load(f)}
    tzips = {}
    if TZIPS_PATH.exists():
        with open(TZIPS_PATH) as f:
            tzips = json.load(f)

    county = defaultdict(lambda: {"customers":0,"revenue":0,"lats":[],"lngs":[],"incomes":[]})
    with open(TZIP_PATH) as f:
        for row in csv.DictReader(f):
            z = str(row["zip"]).zfill(5)
            cust = int(row["travel_customers_3yr"] or 0)
            rev  = float(row["travel_revenue_3yr"] or 0)
            if cust == 0: continue
            cname = None
            if z in tzips: cname = tzips[z].get("county")
            if not cname and z in census: cname = census[z].get("county_name")
            if not cname: continue
            c = census.get(z, {})
            lat = c.get("lat",0); lng = c.get("lng",0); inc = c.get("median_income",0)
            if lat and lng:
                county[cname]["lats"].append(lat); county[cname]["lngs"].append(lng)
            if inc: county[cname]["incomes"].append(inc)
            county[cname]["customers"] += cust; county[cname]["revenue"] += rev

    counties = []
    for name, d in county.items():
        if d["lats"] and d["customers"] > 100:
            counties.append({"name":name, "lat":np.mean(d["lats"]), "lng":np.mean(d["lngs"]),
                             "customers":d["customers"], "revenue":d["revenue"],
                             "income":np.mean(d["incomes"]) if d["incomes"] else 0})
    counties.sort(key=lambda x: x["customers"], reverse=True)

    fig_map, ax_m = plt.subplots(figsize=(7.5,5.2))
    fig_map.patch.set_facecolor("#F7FAFD"); ax_m.set_facecolor("#EEF3F8")
    for sp in ax_m.spines.values(): sp.set_color("#C8D6E2")
    sizes=[max(40, c["customers"]/12) for c in counties]; incomes=[c["income"] for c in counties]
    lngs=[c["lng"] for c in counties]; lats=[c["lat"] for c in counties]
    sc=ax_m.scatter(lngs, lats, s=sizes, c=incomes, cmap="YlOrRd", alpha=0.82,
                    edgecolors=N1, linewidths=0.5, zorder=3, vmin=50000, vmax=130000)
    cbar=plt.colorbar(sc, ax=ax_m, shrink=0.6, pad=0.02, aspect=18)
    cbar.set_label("Avg Household Income ($)", fontsize=8, color=GR1); cbar.ax.tick_params(labelsize=7.5)
    for c in counties[:12]:
        short=c["name"].replace(" County","").replace("Saint","St.")
        ax_m.annotate(f"{short}\n{c['customers']/1000:.1f}K",(c["lng"],c["lat"]),
                      xytext=(0,9), textcoords="offset points", fontsize=7, color=N1,
                      fontweight="bold", ha="center",
                      bbox=dict(boxstyle="round,pad=0.2", facecolor="white", edgecolor=T1, linewidth=0.7, alpha=0.92))
    ax_m.set_xlim(min(lngs)-0.6, max(lngs)+0.6); ax_m.set_ylim(min(lats)-0.35, max(lats)+0.5)
    ax_m.set_xlabel("Longitude", fontsize=8, color=GR2); ax_m.set_ylabel("Latitude", fontsize=8, color=GR2)
    ax_m.tick_params(colors=GR2, labelsize=8)
    ax_m.set_title("Traveler Origin by County  (3-Year, WCNY Territory)",
                   fontsize=10.5, fontweight="bold", color=N1, loc="left", pad=7)
    fig_map.tight_layout(pad=1.0)

    top15=counties[:15]; top15_rev=list(reversed(top15))
    cnames=[c["name"].replace(" County","") for c in top15_rev]
    custs=[c["customers"]/1000 for c in top15_rev]
    pal_c=[T1 if c["name"] in ("Erie County","Monroe County","Onondaga County") else
           N3 if c["income"]>90_000 else GR2 for c in top15_rev]
    fig_bar, ax_b = plt.subplots(figsize=(5.8,5.2))
    fig_bar.patch.set_facecolor("white"); _style_ax(ax_b, grid="x")
    bars=ax_b.barh(cnames, custs, color=pal_c, edgecolor="white", linewidth=0.4, height=0.65, zorder=3)
    for bar, c in zip(bars, top15_rev):
        v=c["customers"]/1000
        ax_b.text(v+0.08, bar.get_y()+bar.get_height()/2, f"{v:.1f}K  ${c['income']/1000:.0f}K inc",
                  va="center", fontsize=8, color=N1)
    ax_b.set_xlabel("Travelers (000s, 3-year)", fontsize=9, color=GR1)
    ax_b.set_xlim(0, max(custs)*1.65); ax_b.tick_params(labelsize=9)
    ax_b.set_title("Top 15 Counties by Traveler Count", fontsize=10.5, fontweight="bold", color=N1, loc="left", pad=7)
    erie=mpatches.Patch(color=T1, label="Core counties (Erie/Monroe/Onondaga)")
    hi=mpatches.Patch(color=N3, label="High-income (>$90K)")
    ax_b.legend(handles=[erie,hi], fontsize=7.5, frameon=False)
    fig_bar.tight_layout(pad=1.0)
    return _b64(fig_map), _b64(fig_bar)


def chart_income_segment():
    if not CENSUS_PATH.exists() or not TZIP_PATH.exists(): return None
    with open(CENSUS_PATH) as f:
        census = {z["zip_code"]: z for z in json.load(f)}
    buckets = {"<$50K":0,"$50–75K":0,"$75–100K":0,"$100–125K":0,"$125K+":0}
    with open(TZIP_PATH) as f:
        for row in csv.DictReader(f):
            z = str(row["zip"]).zfill(5); c = census.get(z,{})
            cust = int(row["travel_customers_3yr"] or 0); inc = c.get("median_income",0)
            if not inc or not cust: continue
            if inc<50_000: b="<$50K"
            elif inc<75_000: b="$50–75K"
            elif inc<100_000: b="$75–100K"
            elif inc<125_000: b="$100–125K"
            else: b="$125K+"
            buckets[b] += cust
    labels=list(buckets.keys()); vals=list(buckets.values()); total=sum(vals)
    colors_list=[GR2,"#6B9EC7",N3,T1,G1]
    fig, ax = plt.subplots(figsize=(5.8,3.4))
    fig.patch.set_facecolor("white"); _style_ax(ax)
    ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontsize=9, color=N1)
    bars=ax.bar(range(len(labels)), [v/1000 for v in vals], color=colors_list,
                edgecolor="white", linewidth=0.5, width=0.62, zorder=3)
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x()+bar.get_width()/2, v/1000+0.4, f"{v/1000:.1f}K\n({v/total*100:.0f}%)",
                ha="center", fontsize=8, color=N1, fontweight="600")
    ax.set_ylabel("Travelers (3yr, 000s)", fontsize=9, color=GR1)
    ax.set_ylim(0, max(v/1000 for v in vals)*1.45)
    ax.set_title("Traveler Distribution by HH Income Band", fontsize=10, fontweight="bold", color=N1, loc="left", pad=6)
    fig.tight_layout(pad=1.0)
    return _b64(fig)

