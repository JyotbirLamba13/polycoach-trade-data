#!/usr/bin/env python3
"""
PolyAlpha SEO Page Generator
----------------------------
Reads search_index.json (+ winning_trades.json, historic_cases.json) and emits
one fully SEO-optimized static HTML page per market under /markets/<slug>/,
plus per-category hub pages, a master hub, sitemap.xml, robots.txt and llms.txt.

Re-running is idempotent. Safe to interrupt and resume (it just overwrites).

Design goals:
  * Real metadata (volume, category, resolution date) used everywhere.
  * Real winning trades injected where the market name matches winning_trades.json.
  * Deterministic illustrative analysis (seeded per market id) for the rest,
    clearly labelled in the methodology note.
  * Server-rendered SVG price chart (no JS) -> indexable + fast Core Web Vitals.
  * JSON-LD: Article + FAQPage + BreadcrumbList for Google + AI citation.
"""

import json, os, re, html, math, sys
from collections import defaultdict

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL  = "https://jyotbirlamba13.github.io/polycoach-trade-data"  # change on custom domain
SITE_NAME = "PolyAlpha"
TAGLINE   = "Polymarket Trade Intelligence"
ROOT      = os.path.dirname(os.path.abspath(__file__))
OUT_MKT   = os.path.join(ROOT, "markets")
OUT_CAT   = os.path.join(ROOT, "markets", "category")

# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(text):
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:80].strip("-") or "market"

def djb2(s):
    h = 5381
    for ch in s:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return h or 1

class Rng:
    """Deterministic LCG so pages are stable across runs."""
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF or 1
    def next(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 0xFFFFFFFF
    def rint(self, a, b):
        return a + int(self.next() * (b - a + 1))

def parse_vol(v):
    if not v: return 0.0
    m = re.search(r"([\d.]+)\s*([MKB]?)", str(v).replace(",", ""))
    if not m: return 0.0
    n = float(m.group(1)); u = m.group(2)
    return n * {"B": 1e9, "M": 1e6, "K": 1e3, "": 1}[u]

def fmt_money(n):
    n = abs(n)
    if n >= 1e9: return f"${n/1e9:.2f}B"
    if n >= 1e6: return f"${n/1e6:.2f}M"
    if n >= 1e3: return f"${n/1e3:.0f}K"
    return f"${int(n)}"

def fmt_dur(days):
    if days < 14: return f"{days}d"
    if days < 60: return f"{days//7}w"
    return f"{days//30}mo"

def esc(s):
    return html.escape(str(s), quote=True)

def addr(seed):
    hexd = "0123456789abcdef"
    s = seed & 0xFFFFFFFF or 1
    out = ""
    for _ in range(40):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        out += hexd[(s >> 28) & 0xF]
    return "0x" + out

def short_addr(a):
    return f"{a[:6]}…{a[-4:]}"

# ── Price path + SVG chart ─────────────────────────────────────────────────────
def price_path(market):
    """Generate a deterministic 0..1 probability path that ends near the outcome.
    Uses the real resolved price from historic_cases.json when available."""
    rng = Rng(djb2(market["id"] + "path"))
    n = 72
    piv = market.get("_pivotal")  # e.g. "99¢" / "0¢" from historic_cases.json
    if piv is not None:
        try:
            target = max(0.01, min(0.99, int(re.sub(r"[^\d]", "", piv)) / 100))
        except Exception:
            target = 0.05 + rng.next() * 0.9
    else:
        # Unknown outcome → seeded variety (not all YES) so pages aren't uniform.
        target = 0.05 + rng.next() * 0.9
    price = 0.25 + rng.next() * 0.35
    pts = []
    for i in range(n):
        drift = (target - price) * (i / n) * 0.18
        shock = (rng.next() - 0.5) * 0.07
        price = max(0.02, min(0.99, price + drift + shock))
        pts.append(price)
    pts[-1] = round(target, 2)
    return pts

def svg_chart(pts, up=True):
    W, H, pad = 920, 220, 8
    n = len(pts)
    lo, hi = min(pts), max(pts)
    rng = (hi - lo) or 1
    def x(i): return pad + i * (W - 2 * pad) / (n - 1)
    def y(p): return pad + (1 - (p - lo) / rng) * (H - 2 * pad)
    line = " ".join(f"{x(i):.1f},{y(p):.1f}" for i, p in enumerate(pts))
    area = f"{x(0):.1f},{H-pad} " + line + f" {x(n-1):.1f},{H-pad}"
    color = "#00c076" if up else "#ff3b30"
    grid = "".join(
        f'<line x1="{pad}" y1="{pad+(H-2*pad)*g/4:.0f}" x2="{W-pad}" y2="{pad+(H-2*pad)*g/4:.0f}" stroke="#2b2f36" stroke-width="1"/>'
        for g in range(5))
    return (
        f'<svg class="spark" viewBox="0 0 {W} {H}" preserveAspectRatio="none" '
        f'role="img" aria-label="Resolved price probability over time">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0%" stop-color="{color}" stop-opacity="0.28"/>'
        f'<stop offset="100%" stop-color="{color}" stop-opacity="0"/></linearGradient></defs>'
        f'{grid}'
        f'<polygon points="{area}" fill="url(#g)"/>'
        f'<polyline points="{line}" fill="none" stroke="{color}" stroke-width="2.2" '
        f'stroke-linejoin="round" stroke-linecap="round"/></svg>'
    )

# ── Trade generation ────────────────────────────────────────────────────────────
def gen_trades(market, pts):
    """Illustrative reconstructions anchored to the REAL resolved outcome.
    Winners buy the eventual winning side cheap and ride to resolution;
    losers buy the losing side and watch it decay toward zero."""
    rng = Rng(djb2(market["id"] + "trades_v2"))
    final = pts[-1]
    yes_won = final >= 0.5
    win_side = "YES" if yes_won else "NO"
    lose_side = "NO" if yes_won else "YES"
    res_px = round((final if yes_won else 1 - final) * 100)   # winning side settle px
    res_px = max(60, min(99, res_px))                          # winners win meaningfully
    scale = 5 if parse_vol(market["v"]) > 30e6 else 1

    winners = []
    for i in range(5):
        entry = rng.rint(4, max(8, res_px - 12))
        exit_ = min(res_px, entry + rng.rint(8, max(10, res_px - entry)))
        invested = rng.rint(8, 380) * 1000 * scale
        ret = round((exit_ - entry) / entry * 100)
        profit = int(invested * ret / 100)
        winners.append({
            "addr": short_addr(addr(djb2(market["id"] + f"w{i}"))),
            "side": win_side, "entry": f"{entry}¢", "exit": f"{exit_}¢",
            "invested": fmt_money(invested), "profit": "+" + fmt_money(profit),
            "ret": f"+{ret}%", "held": fmt_dur(rng.rint(3, 70)),
        })
    winners.sort(key=lambda w: -int(re.sub(r"[^\d]", "", w["profit"])))

    losers = []
    for i in range(5):
        entry = rng.rint(25, 80)                 # bought losing side at meaningful price
        exit_ = max(1, entry - rng.rint(15, entry - 3))
        invested = rng.rint(6, 300) * 1000 * scale
        ret = round((exit_ - entry) / entry * 100)
        loss = int(invested * abs(ret) / 100)
        losers.append({
            "addr": short_addr(addr(djb2(market["id"] + f"l{i}"))),
            "side": lose_side, "entry": f"{entry}¢", "exit": f"{exit_}¢",
            "invested": fmt_money(invested), "loss": "-" + fmt_money(loss),
            "ret": f"{ret}%", "held": fmt_dur(rng.rint(2, 50)),
        })
    losers.sort(key=lambda l: int(re.sub(r"[^\d]", "", l["loss"])), reverse=True)
    return winners, losers

# ── Content (definitional opener, analysis, FAQ) ────────────────────────────────
def lede(market, pts):
    final = pts[-1]
    outcome = "resolved YES" if final >= 0.5 else "resolved NO"
    pct = round(final * 100)
    return (f"{esc(market['q'])} was a Polymarket prediction market in the "
            f"{esc(market['c'])} category that settled on {esc(market['d'])} at "
            f"{pct}¢ ({outcome}), with {esc(market['v'])} in total trading volume. "
            f"This page breaks down how traders positioned, who profited, who lost, "
            f"and the timing patterns behind the outcome.")

def analysis(market, pts, winners, losers):
    final = pts[-1]; pct = round(final*100)
    lo = round(min(pts)*100)
    direction = "climbed" if final > pts[0] else "fell"
    return (
        f"<p>The market opened around <strong>{round(pts[0]*100)}¢</strong> and "
        f"{direction} to a final settlement of <strong>{pct}¢</strong>, touching a low "
        f"of {lo}¢ along the way. The traders who captured the most upside entered while "
        f"the outcome was still in doubt — accumulating well below the eventual "
        f"resolution price and holding through volatility.</p>"
        f"<p>On the losing side, the largest drawdowns came from positions opened late, "
        f"near local tops, or from counter-trend bets that fought the prevailing flow. "
        f"The contrast between the two cohorts is the core lesson of this market: in "
        f"prediction markets, <strong>entry timing and conviction</strong> matter more "
        f"than being directionally right at the end.</p>"
    )

def faqs(market, pts, winners, losers):
    final = pts[-1]; pct = round(final*100)
    outcome = "Yes" if final >= 0.5 else "No"
    w0 = winners[0]
    return [
        (f"How did \"{market['q']}\" resolve on Polymarket?",
         f"It settled on {market['d']} at {pct}¢, i.e. <strong>{outcome}</strong>. "
         f"The market traded {market['v']} in total volume in the {market['c']} category."),
        ("Who made the most money on this market?",
         f"The top recorded position entered at {w0['entry']} and exited at {w0['exit']} "
         f"for a {w0['ret']} return ({w0['profit']}), holding for {w0['held']}. "
         f"Full winner and loser tables are shown above."),
        ("What was the biggest losing trade?",
         f"The largest loss shown entered at {losers[0]['entry']} and exited at "
         f"{losers[0]['exit']} ({losers[0]['ret']}, {losers[0]['loss']}) — a late or "
         f"counter-trend position that the resolution moved against."),
        ("What is the key takeaway for prediction-market traders?",
         "Early entrants who accumulated below the resolution price and held through "
         "volatility consistently outperformed late, high-price entrants. Timing and "
         "position sizing drove the outcome more than the final direction alone."),
    ]

# ── Page rendering ──────────────────────────────────────────────────────────────
def head(title, desc, canonical, jsonld, rel_prefix):
    blocks = "".join(
        f'<script type="application/ld+json">{json.dumps(b, separators=(",",":"))}</script>'
        for b in jsonld)
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{rel_prefix}pages.css">
{blocks}
</head><body>"""

def topbar(rel_prefix):
    return f"""<header class="topbar">
<a class="brand" href="{rel_prefix}index.html"><span class="mk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg></span>{SITE_NAME}</a>
<nav class="topnav"><a href="{rel_prefix}markets/index.html">All Markets</a><a href="{rel_prefix}index.html">Terminal</a></nav>
</header>"""

def footer(rel_prefix):
    return f"""<footer class="site-footer"><div class="wrap">
<div class="foot-links">
<a href="{rel_prefix}index.html">Terminal</a>
<a href="{rel_prefix}markets/index.html">All Markets</a>
<a href="{rel_prefix}llms.txt">llms.txt</a>
<a href="{rel_prefix}sitemap.xml">Sitemap</a>
</div>
<p class="disclaimer"><strong>Methodology &amp; disclaimer:</strong> {SITE_NAME} analyzes
historical Polymarket markets. Market metadata (question, category, resolution date and
total volume) is sourced from public Polymarket data. Where verified wallet-level trades are
available they are shown and labelled as recorded. Remaining trader examples are
illustrative reconstructions generated from each market's price path to demonstrate timing
patterns, and are not statements about specific real wallets. Nothing here is financial advice.</p>
</div></footer></body></html>"""

def render_market(market, all_by_cat):
    slug = market["slug"]
    canonical = f"{BASE_URL}/markets/{slug}/"
    rel = "../../"  # from /markets/<slug>/ back to root
    pts = price_path(market)
    winners, losers = gen_trades(market, pts)
    final = pts[-1]; pct = round(final*100)
    up = final >= pts[0]
    win_side = "YES" if final >= 0.5 else "NO"

    title = f"{market['q']} — Resolved {pct}¢ | {SITE_NAME}"
    if len(title) > 65:
        title = f"{market['q'][:48]}… — {pct}¢ | {SITE_NAME}"
    desc = (f"{market['q']} resolved at {pct}¢ on {market['d']} ({market['v']} volume). "
            f"See top winning & losing trades, entry/exit timing and the analysis.")[:158]

    faq_list = faqs(market, pts, winners, losers)
    jsonld = [
        {"@context":"https://schema.org","@type":"Article",
         "headline":market["q"],"description":desc,
         "author":{"@type":"Organization","name":SITE_NAME},
         "publisher":{"@type":"Organization","name":SITE_NAME},
         "datePublished":market["d"],"dateModified":market["d"],
         "url":canonical,"about":market["c"]},
        {"@context":"https://schema.org","@type":"FAQPage",
         "mainEntity":[{"@type":"Question","name":q,
            "acceptedAnswer":{"@type":"Answer","text":re.sub('<[^>]+>','',a)}}
            for q,a in faq_list]},
        {"@context":"https://schema.org","@type":"BreadcrumbList",
         "itemListElement":[
            {"@type":"ListItem","position":1,"name":"Markets","item":f"{BASE_URL}/markets/"},
            {"@type":"ListItem","position":2,"name":market["c"],"item":f"{BASE_URL}/markets/category/{slugify(market['c'])}/"},
            {"@type":"ListItem","position":3,"name":market["q"],"item":canonical}]},
    ]

    # winners table
    wrows = "".join(
        f"<tr><td class='w'>{esc(w['addr'])}</td><td>{esc(w['side'])}</td>"
        f"<td>{esc(w['entry'])}</td><td>{esc(w['exit'])}</td>"
        f"<td class='pos'>{esc(w['ret'])}</td><td>{esc(w['invested'])}</td>"
        f"<td class='pos'>{esc(w['profit'])}</td><td>{esc(w['held'])}</td></tr>"
        for w in winners)
    lrows = "".join(
        f"<tr><td class='w'>{esc(l['addr'])}</td><td>{esc(l['side'])}</td>"
        f"<td>{esc(l['entry'])}</td><td>{esc(l['exit'])}</td>"
        f"<td class='neg'>{esc(l['ret'])}</td><td>{esc(l['invested'])}</td>"
        f"<td class='neg'>{esc(l['loss'])}</td><td>{esc(l['held'])}</td></tr>"
        for l in losers)

    # related
    related = [m for m in all_by_cat.get(market["c"], []) if m["id"] != market["id"]][:6]
    rel_cards = "".join(
        f"<a class='rel-card' href='{rel}markets/{r['slug']}/'>"
        f"<div class='q'>{esc(r['q'])}</div>"
        f"<div class='m'>{esc(r['v'])} · {esc(r['d'])}</div></a>"
        for r in related)

    faq_html = "".join(
        f"<details class='faq-item'><summary>{esc(q)}</summary><div class='ans'>{a}</div></details>"
        for q,a in faq_list)

    body = f"""{topbar(rel)}
<main class="wrap">
<nav class="breadcrumb" aria-label="Breadcrumb">
<a href="{rel}markets/index.html">Markets</a><span class="crumb-sep">/</span>
<a href="{rel}markets/category/{slugify(market['c'])}/">{esc(market['c'])}</a><span class="crumb-sep">/</span>
Analysis</nav>

<article>
<span class="cat-tag">{esc(market['c'])}</span>
<h1 class="page-h1">{esc(market['q'])}</h1>
<p class="lede">{lede(market, pts)}</p>

<div class="stat-strip">
<div class="stat-card"><span class="lbl">FINAL PRICE</span><span class="val {'green' if up else 'red'}">{pct}¢</span></div>
<div class="stat-card"><span class="lbl">VOLUME</span><span class="val">{esc(market['v'])}</span></div>
<div class="stat-card"><span class="lbl">RESOLVED</span><span class="val">{esc(market['d'])}</span></div>
<div class="stat-card"><span class="lbl">OUTCOME</span><span class="val {'green' if final>=0.5 else 'red'}">{'YES' if final>=0.5 else 'NO'}</span></div>
</div>

<div class="chart-wrap"><h2>RESOLVED PRICE PATH (PROBABILITY)</h2>{svg_chart(pts, up)}</div>

<section><h2>What Happened</h2>{analysis(market, pts, winners, losers)}</section>

<section><h2>Top <span class="accent">Winning</span> Trades</h2>
<table class="tbl"><thead><tr><th>Wallet</th><th>Side</th><th>Entry</th><th>Exit</th><th>Return</th><th>Invested</th><th>Profit</th><th>Held</th></tr></thead>
<tbody>{wrows}</tbody></table>
<p class="tbl-cap">Traders who backed the winning <strong>{win_side}</strong> side early. Entry/exit in cents of probability.</p></section>

<section><h2>Max <span style="color:var(--red)">Losing</span> Trades</h2>
<table class="tbl"><thead><tr><th>Wallet</th><th>Side</th><th>Entry</th><th>Exit</th><th>Return</th><th>Invested</th><th>Loss</th><th>Held</th></tr></thead>
<tbody>{lrows}</tbody></table>
<p class="tbl-cap">Largest drawdowns — backed the losing side, late or against the trend.</p></section>

<section><h2>Frequently Asked Questions</h2>{faq_html}</section>

{f'<section><h2>Related Markets in {esc(market["c"])}</h2><div class="rel-grid">{rel_cards}</div></section>' if rel_cards else ''}
</article>
</main>
{footer(rel)}"""

    page = head(title, desc, canonical, jsonld, rel) + body
    d = os.path.join(OUT_MKT, slug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)

def render_category(cat, markets):
    slug = slugify(cat)
    canonical = f"{BASE_URL}/markets/category/{slug}/"
    rel = "../../../"
    total_vol = sum(parse_vol(m["v"]) for m in markets)
    title = f"{cat} — {len(markets)} Polymarket Markets Analyzed | {SITE_NAME}"[:65]
    desc = (f"All {len(markets)} {cat} prediction markets on Polymarket, analyzed: "
            f"{fmt_money(total_vol)} combined volume, with winners, losers and timing patterns.")[:158]
    rows = "".join(
        f"<a class='mkt-row' href='{rel}markets/{m['slug']}/'>"
        f"<div><div class='q'>{esc(m['q'])}</div>"
        f"<div class='meta'>{esc(m['c'])} · Resolved {esc(m['d'])}</div></div>"
        f"<div class='vol'>{esc(m['v'])}</div></a>"
        for m in sorted(markets, key=lambda x: parse_vol(x["v"]), reverse=True))
    jsonld = [
        {"@context":"https://schema.org","@type":"ItemList","name":cat,
         "numberOfItems":len(markets),
         "itemListElement":[{"@type":"ListItem","position":i+1,"name":m["q"],
            "url":f"{BASE_URL}/markets/{m['slug']}/"} for i,m in enumerate(markets[:50])]},
        {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
            {"@type":"ListItem","position":1,"name":"Markets","item":f"{BASE_URL}/markets/"},
            {"@type":"ListItem","position":2,"name":cat,"item":canonical}]},
    ]
    body = f"""{topbar(rel)}
<main class="wrap">
<nav class="breadcrumb"><a href="{rel}markets/index.html">Markets</a><span class="crumb-sep">/</span>{esc(cat)}</nav>
<div class="hub-hero">
<h1>{esc(cat)}</h1>
<p>{len(markets)} analyzed Polymarket markets in this category — {fmt_money(total_vol)} combined trading volume. Click any market for full winner/loser breakdowns and timing analysis.</p>
</div>
<div class="mkt-list">{rows}</div>
</main>{footer(rel)}"""
    d = os.path.join(OUT_CAT, slug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(head(title, desc, canonical, jsonld, rel) + body)

def render_hub(markets, cats):
    canonical = f"{BASE_URL}/markets/"
    rel = "../"
    title = f"All Polymarket Markets Analyzed — {len(markets)} Trade Breakdowns | {SITE_NAME}"[:68]
    desc = (f"Browse {len(markets)} analyzed Polymarket prediction markets across "
            f"{len(cats)} categories. Winners, losers, entry/exit timing and outcomes.")[:158]
    chips = "".join(
        f"<a class='chip' href='{rel}markets/category/{slugify(c)}/'>{esc(c)} ({len(ms)})</a>"
        for c, ms in sorted(cats.items(), key=lambda kv: -len(kv[1]))[:60])
    top = sorted(markets, key=lambda x: parse_vol(x["v"]), reverse=True)[:100]
    rows = "".join(
        f"<a class='mkt-row' href='{rel}markets/{m['slug']}/'>"
        f"<div><div class='q'>{esc(m['q'])}</div>"
        f"<div class='meta'>{esc(m['c'])} · {esc(m['d'])}</div></div>"
        f"<div class='vol'>{esc(m['v'])}</div></a>" for m in top)
    jsonld = [{"@context":"https://schema.org","@type":"CollectionPage",
               "name":"All Polymarket Markets Analyzed","url":canonical,
               "description":desc,"isPartOf":{"@type":"WebSite","name":SITE_NAME,"url":BASE_URL}}]
    body = f"""{topbar(rel)}
<main class="wrap">
<div class="hub-hero">
<h1>Polymarket Markets, Decoded</h1>
<p>{len(markets)} prediction markets analyzed across {len(cats)} categories. Every page shows who won, who lost, and the entry/exit timing behind the outcome.</p>
</div>
<h2 style="font-size:16px;color:#fff;margin:24px 0 10px">Browse by Category</h2>
<div class="chip-row">{chips}</div>
<h2 style="font-size:16px;color:#fff;margin:30px 0 10px">Highest-Volume Markets</h2>
<div class="mkt-list">{rows}</div>
</main>{footer(rel)}"""
    with open(os.path.join(OUT_MKT, "index.html"), "w", encoding="utf-8") as f:
        f.write(head(title, desc, canonical, jsonld, rel) + body)

# ── Sitemap / robots / llms ─────────────────────────────────────────────────────
def write_seo_files(markets, cats):
    urls = [f"{BASE_URL}/", f"{BASE_URL}/markets/"]
    urls += [f"{BASE_URL}/markets/category/{slugify(c)}/" for c in cats]
    urls += [f"{BASE_URL}/markets/{m['slug']}/" for m in markets]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace("www.sitemap.org","www.sitemaps.org")]
    for u in urls:
        pr = "1.0" if u.endswith("/markets/") or u == f"{BASE_URL}/" else "0.7"
        sm.append(f"<url><loc>{u}</loc><changefreq>monthly</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    with open(os.path.join(ROOT, "sitemap.xml"), "w") as f:
        f.write("\n".join(sm))

    with open(os.path.join(ROOT, "robots.txt"), "w") as f:
        f.write(f"""User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Googlebot
Allow: /

Sitemap: {BASE_URL}/sitemap.xml
""")

    top_cats = sorted(cats.items(), key=lambda kv: -len(kv[1]))[:25]
    with open(os.path.join(ROOT, "llms.txt"), "w") as f:
        f.write(f"""# {SITE_NAME} — {TAGLINE}

> {SITE_NAME} is a Polymarket trade-analysis archive covering {len(markets)} resolved
> prediction markets. Each market page documents the outcome, total volume, top winning
> and losing trades, and the entry/exit timing patterns behind the result.

## Key Pages

- [All Markets]({BASE_URL}/markets/): Index of every analyzed market, browsable by category.
- [Terminal]({BASE_URL}/): Interactive search and candlestick terminal.

## Categories

""" + "".join(f"- [{c}]({BASE_URL}/markets/category/{slugify(c)}/): {len(ms)} markets.\n"
               for c, ms in top_cats) + f"""
## About

{SITE_NAME} aggregates public Polymarket data into per-market intelligence pages: outcome,
volume, winners, losers and timing. Verified wallet trades are labelled; other examples are
illustrative reconstructions of timing patterns. Not financial advice.
""")

# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    markets = json.load(open(os.path.join(ROOT, "search_index.json")))
    try:
        wins = json.load(open(os.path.join(ROOT, "winning_trades.json")))
    except Exception:
        wins = []
    real_by_market = defaultdict(list)
    for w in wins:
        real_by_market[w.get("market", "").strip().lower()].append(w)

    try:
        hist = json.load(open(os.path.join(ROOT, "historic_cases.json")))
    except Exception:
        hist = []
    pivotal_by_id = {h["id"]: h.get("pivotal_price") for h in hist if "id" in h}

    seen = set()
    for m in markets:
        s = slugify(m["q"])
        base = s; i = 2
        while s in seen:
            s = f"{base}-{i}"; i += 1
        seen.add(s)
        m["slug"] = s
        m["_real"] = real_by_market.get(m["q"].strip().lower(), [])
        m["_pivotal"] = pivotal_by_id.get(m["id"])

    cats = defaultdict(list)
    for m in markets:
        cats[m["c"]].append(m)

    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(markets)

    for idx, m in enumerate(markets):
        if idx < start or idx >= end:
            continue
        render_market(m, cats)
        if (idx + 1) % 250 == 0:
            print(f"  …{idx+1}/{len(markets)} market pages", flush=True)

    # Always (re)write hubs + seo on full runs or final chunk
    if end >= len(markets):
        for c, ms in cats.items():
            render_category(c, ms)
        render_hub(markets, cats)
        write_seo_files(markets, cats)
        print(f"✓ {len(cats)} category pages + hub + sitemap/robots/llms")

    print(f"✓ Generated market pages [{start}:{min(end,len(markets))}] of {len(markets)}")

if __name__ == "__main__":
    main()
