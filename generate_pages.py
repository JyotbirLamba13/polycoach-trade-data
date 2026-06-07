#!/usr/bin/env python3
"""
PolyAlpha SEO Page Generator (REAL DATA)
----------------------------------------
Builds one SEO page per market from REAL Polymarket data:
  * markets_real.json  — real outcome, open/close dates, status, slug, volume
                         (from SII-WANGZJ/Polymarket_data markets.parquet)
  * whales_real.json   — real top winners/losers with real wallets + PnL
                         (from users.parquet; precompute_whales.py). Optional;
                         markets without it show a backfill note + live link.

Resolved markets get full analysis. Open markets get live odds + a link to bet
on Polymarket (no resolved-analysis, no whale PnL — they haven't settled).

Outputs: /markets/<slug>/, /markets/category/<slug>/, /markets/ hub,
sitemap.xml, robots.txt, llms.txt. Idempotent; safe to re-run.
"""
import json, os, re, html, ast, sys
from collections import defaultdict

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL  = "https://polycoach-trade-data.pages.dev"  # Cloudflare Pages; change on custom domain
SITE_NAME = "PolyAlpha"
TAGLINE   = "Polymarket Trade Intelligence"
ROOT      = os.path.dirname(os.path.abspath(__file__))
OUT_MKT   = os.path.join(ROOT, "markets")
OUT_CAT   = os.path.join(ROOT, "markets", "category")

# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(text):
    text = re.sub(r"[^\w\s-]", "", (text or "").lower())
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:90].strip("-") or "market"

def esc(s):
    return html.escape(str(s), quote=True)

def fmt_money(n):
    n = abs(n or 0)
    if n >= 1e9: return f"${n/1e9:.2f}B"
    if n >= 1e6: return f"${n/1e6:.1f}M"
    if n >= 1e3: return f"${n/1e3:.0f}K"
    return f"${int(n)}"

def yes_price(m):
    try:
        return float(ast.literal_eval(m["outcome_prices"])[0])
    except Exception:
        return None

def short_addr(a):
    return f"{a[:6]}…{a[-4:]}" if a and len(a) > 12 else (a or "—")

def poly_url(m):
    es, s = m.get("event_slug"), m.get("slug")
    if es and s: return f"https://polymarket.com/event/{es}/{s}"
    if s:        return f"https://polymarket.com/market/{s}"
    return "https://polymarket.com"

def poly_profile(addr):
    return f"https://polymarket.com/profile/{addr}"

def cat_of(m):
    return m.get("event_title") or "Other"

def date_of(s):
    return (s or "")[:10]

def is_resolved(m):
    return m.get("closed") == 1

# ── Real probability bar (truthful viz, no fabricated price path) ───────────────
def prob_bar(yes, resolved):
    pct = round((yes or 0) * 100)
    label = "RESOLVED" if resolved else "LIVE ODDS"
    yes_txt = f"YES {pct}¢" if pct >= 14 else ""
    no_txt = f"NO {100-pct}¢" if (100 - pct) >= 14 else ""
    return (f'<div class="probbar-wrap"><div class="probbar-label">{label}</div>'
            f'<div class="probbar"><div class="pb-yes" style="width:{pct}%">{yes_txt}</div>'
            f'<div class="pb-no" style="width:{100-pct}%">{no_txt}</div></div></div>')

# ── Content ─────────────────────────────────────────────────────────────────────
def lede(m):
    y = yes_price(m); pct = round((y or 0) * 100)
    cat = cat_of(m); opened = date_of(m.get("created_at")); vol = fmt_money(m.get("volume"))
    if is_resolved(m):
        outcome = "Yes" if (y or 0) >= 0.5 else "No"
        return (f"{esc(m['question'])} was a Polymarket prediction market in the "
                f"{esc(cat)} category. It opened on {esc(opened)} and resolved "
                f"<strong>{outcome}</strong> ({pct}¢) on {esc(date_of(m.get('end_date')))}, "
                f"with {esc(vol)} in total trading volume. Below: the real wallets that "
                f"won and lost the most, with their entry, exit and profit.")
    return (f"{esc(m['question'])} is a live Polymarket market in the {esc(cat)} category, "
            f"open since {esc(opened)} with {esc(vol)} traded so far. It currently prices "
            f"<strong>Yes at {pct}¢</strong>. This market has not resolved yet — follow or "
            f"trade it live on Polymarket.")

def faqs(m, whales):
    y = yes_price(m); pct = round((y or 0) * 100)
    out = []
    if is_resolved(m):
        outcome = "Yes" if (y or 0) >= 0.5 else "No"
        out.append((f"How did \"{m['question']}\" resolve on Polymarket?",
            f"It resolved <strong>{outcome}</strong> at {pct}¢ on {date_of(m.get('end_date'))}, "
            f"with {fmt_money(m.get('volume'))} in total volume."))
        if whales and whales.get("winners"):
            w = whales["winners"][0]
            out.append(("Who made the most money on this market?",
                f"Wallet {short_addr(w['addr'])} backed the {w['side']} side, entering near "
                f"{w['entry']}, for a realized {w['pnl']} ({w['ret']}) on {w['invested']} deployed."))
        if whales and whales.get("losers"):
            l = whales["losers"][0]
            out.append(("Who lost the most on this market?",
                f"Wallet {short_addr(l['addr'])} backed the {l['side']} side and lost {l['pnl'][1:]} "
                f"({l['ret']}) on {l['invested']} deployed."))
    else:
        out.append((f"Has \"{m['question']}\" resolved yet?",
            f"No — it is still open. Yes currently trades at {pct}¢ "
            f"({fmt_money(m.get('volume'))} volume so far). Trade or follow it live on Polymarket."))
        out.append(("When does this market close?",
            f"Its scheduled end date is {date_of(m.get('end_date'))}. It opened {date_of(m.get('created_at'))}."))
    out.append(("Where does this data come from?",
        "Market outcome, dates, status and volume come from public Polymarket data. Wallet-level "
        "winners and losers are computed from on-chain Polymarket trade records (maker/taker "
        "fills on Polygon). Not financial advice."))
    return out

# ── Tables ────────────────────────────────────────────────────────────────────
def trade_table(rows, kind):
    pos = kind == "winners"
    val_cls = "pos" if pos else "neg"
    val_col = "Profit" if pos else "Loss"
    body = "".join(
        f"<tr><td class='w'><a class='wlink' href='{poly_profile(r['addr'])}' target='_blank' rel='noopener'>{esc(short_addr(r['addr']))} ↗</a></td>"
        f"<td>{esc(r['side'])}</td><td>{esc(r['entry'])}</td><td>{esc(r['exit'])}</td>"
        f"<td class='{val_cls}'>{esc(r['ret'])}</td><td>{esc(r['invested'])}</td>"
        f"<td class='{val_cls}'>{esc(r['pnl'])}</td><td>{esc(r['held'])}</td></tr>"
        for r in rows)
    return (f"<table class='tbl'><thead><tr><th>Wallet</th><th>Side</th><th>Entry</th><th>Exit</th>"
            f"<th>Return</th><th>Invested</th><th>{val_col}</th><th>Held</th></tr></thead>"
            f"<tbody>{body}</tbody></table>")

# ── HTML shell ──────────────────────────────────────────────────────────────────
def head(title, desc, canonical, jsonld, rel):
    blocks = "".join(f'<script type="application/ld+json">{json.dumps(b,separators=(",",":"))}</script>' for b in jsonld)
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}"><meta name="twitter:description" content="{esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{rel}pages.css">
{blocks}
</head><body>"""

def topbar(rel):
    return f"""<header class="topbar">
<a class="brand" href="{rel}index.html"><span class="mk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg></span>{SITE_NAME}</a>
<nav class="topnav"><a href="{rel}markets/index.html">All Markets</a><a href="{rel}index.html">Terminal</a></nav>
</header>"""

def footer(rel):
    return f"""<footer class="site-footer"><div class="wrap">
<div class="foot-links"><a href="{rel}index.html">Terminal</a><a href="{rel}markets/index.html">All Markets</a><a href="{rel}llms.txt">llms.txt</a><a href="{rel}sitemap.xml">Sitemap</a></div>
<p class="disclaimer"><strong>Data:</strong> Market question, category, outcome, open/close dates, status and
volume are sourced from public Polymarket data. Wallet-level winners and losers are computed from on-chain
Polymarket trade records (Polygon OrderFilled fills). Figures may differ slightly from Polymarket's own UI due
to settlement and fee handling. Nothing here is financial advice.</p>
</div></footer></body></html>"""

# ── Market page ─────────────────────────────────────────────────────────────────
def render_market(m, by_cat, whales_all):
    slug = m["slug"]; canonical = f"{BASE_URL}/markets/{slug}/"; rel = "../../"
    cat = cat_of(m); y = yes_price(m); pct = round((y or 0) * 100)
    resolved = is_resolved(m); whales = whales_all.get(m["id"])
    opened, closed = date_of(m.get("created_at")), date_of(m.get("end_date"))
    outcome = ("Yes" if (y or 0) >= 0.5 else "No")
    purl = poly_url(m)

    if resolved:
        title = f"{m['question']} — Resolved {outcome} ({pct}¢) | {SITE_NAME}"
        if len(title) > 66: title = f"{m['question'][:44]}… — {outcome} {pct}¢ | {SITE_NAME}"
        desc = (f"{m['question']} resolved {outcome} at {pct}¢ on {closed} ({fmt_money(m.get('volume'))} "
                f"volume). Real winning & losing wallets, entry/exit and PnL.")[:158]
    else:
        title = f"{m['question']} — Live at {pct}¢ | {SITE_NAME}"
        if len(title) > 66: title = f"{m['question'][:50]}… — {pct}¢ | {SITE_NAME}"
        desc = (f"{m['question']} is open on Polymarket, Yes at {pct}¢ ({fmt_money(m.get('volume'))} "
                f"volume). Live odds, open date and link to trade.")[:158]

    faq = faqs(m, whales)
    jsonld = [
        {"@context":"https://schema.org","@type":"Article","headline":m["question"],
         "description":desc,"author":{"@type":"Organization","name":SITE_NAME},
         "publisher":{"@type":"Organization","name":SITE_NAME},
         "datePublished":opened or closed,"dateModified":date_of(m.get("updated_at")) or closed,
         "url":canonical,"about":cat},
        {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
            {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":re.sub('<[^>]+>','',a)}} for q,a in faq]},
        {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
            {"@type":"ListItem","position":1,"name":"Markets","item":f"{BASE_URL}/markets/"},
            {"@type":"ListItem","position":2,"name":cat,"item":f"{BASE_URL}/markets/category/{slugify(cat)}/"},
            {"@type":"ListItem","position":3,"name":m["question"],"item":canonical}]},
    ]

    related = [r for r in by_cat.get(cat, []) if r["id"] != m["id"]][:6]
    rel_cards = "".join(
        f"<a class='rel-card' href='{rel}markets/{r['slug']}/'><div class='q'>{esc(r['question'])}</div>"
        f"<div class='m'>{esc(fmt_money(r.get('volume')))} · {'Resolved' if is_resolved(r) else 'Open'}</div></a>"
        for r in related)
    faq_html = "".join(f"<details class='faq-item'><summary>{esc(q)}</summary><div class='ans'>{a}</div></details>" for q,a in faq)

    # status-specific main content
    if resolved and whales and (whales.get("winners") or whales.get("losers")):
        analysis = (
            f"<section><h2>Top <span class='accent'>Winning</span> Wallets</h2>{trade_table(whales['winners'],'winners')}"
            f"<p class='tbl-cap'>Real wallets ranked by realized profit. Click any wallet to view its public Polymarket profile.</p></section>"
            f"<section><h2>Max <span style='color:var(--red)'>Losing</span> Wallets</h2>{trade_table(whales['losers'],'losers')}"
            f"<p class='tbl-cap'>Real wallets with the largest losses on this market.</p></section>")
    elif resolved:
        analysis = (f"<section><h2>Whale Analysis</h2><div class='callout'>Real wallet-level winners and "
                    f"losers for this market are being backfilled from on-chain trade data. "
                    f"Meanwhile, view this market and its traders on "
                    f"<a href='{purl}' target='_blank' rel='noopener'>Polymarket ↗</a>.</div></section>")
    else:
        analysis = (f"<section><h2>This Market Is Still Open</h2>"
                    f"<div class='callout'>Yes currently trades at <strong>{pct}¢</strong> with "
                    f"{fmt_money(m.get('volume'))} in volume. It hasn't resolved, so there are no final "
                    f"winners or losers yet.<br><br><a class='cta' href='{purl}' target='_blank' rel='noopener'>"
                    f"Trade or follow on Polymarket ↗</a></div></section>")

    stat_status = "RESOLVED" if resolved else "OPEN"
    stat_status_cls = "green" if resolved else "amber"
    price_lbl = "FINAL PRICE" if resolved else "LIVE (YES)"
    date_lbl = "RESOLVED" if resolved else "CLOSES"

    body = f"""{topbar(rel)}
<main class="wrap">
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="{rel}markets/index.html">Markets</a><span class="crumb-sep">/</span>
<a href="{rel}markets/category/{slugify(cat)}/">{esc(cat)}</a><span class="crumb-sep">/</span>{'Analysis' if resolved else 'Live'}</nav>
<article>
<span class="cat-tag">{esc(cat)}</span>
<h1 class="page-h1">{esc(m['question'])}</h1>
<p class="lede">{lede(m)}</p>
<div class="stat-strip">
<div class="stat-card"><span class="lbl">{price_lbl}</span><span class="val {'green' if (y or 0)>=0.5 else 'red'}">{pct}¢</span></div>
<div class="stat-card"><span class="lbl">VOLUME</span><span class="val">{esc(fmt_money(m.get('volume')))}</span></div>
<div class="stat-card"><span class="lbl">OPENED</span><span class="val">{esc(opened)}</span></div>
<div class="stat-card"><span class="lbl">{date_lbl}</span><span class="val">{esc(closed)}</span></div>
</div>
{prob_bar(y, resolved)}
<p class="poly-link-row"><span class="status-pill {stat_status_cls}">{stat_status}</span>
<a class="poly-link" href="{purl}" target="_blank" rel="noopener">View on Polymarket ↗</a></p>
{analysis}
<section><h2>Frequently Asked Questions</h2>{faq_html}</section>
{f'<section><h2>Related Markets in {esc(cat)}</h2><div class="rel-grid">{rel_cards}</div></section>' if rel_cards else ''}
</article></main>
{footer(rel)}"""
    d = os.path.join(OUT_MKT, slug); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(head(title, desc, canonical, jsonld, rel) + body)

# ── Category hub ────────────────────────────────────────────────────────────────
def render_category(cat, ms):
    slug = slugify(cat); canonical = f"{BASE_URL}/markets/category/{slug}/"; rel = "../../../"
    total_vol = sum(x.get("volume") or 0 for x in ms)
    res = [x for x in ms if is_resolved(x)]; opn = [x for x in ms if not is_resolved(x)]
    title = f"{cat} — {len(ms)} Polymarket Markets Analyzed | {SITE_NAME}"[:66]
    desc = (f"All {len(ms)} {cat} Polymarket markets: {fmt_money(total_vol)} combined volume, "
            f"{len(res)} resolved, {len(opn)} open — with real winners, losers and outcomes.")[:158]
    def row(x):
        st = "Resolved" if is_resolved(x) else "Open"
        return (f"<a class='mkt-row' href='{rel}markets/{x['slug']}/'><div><div class='q'>{esc(x['question'])}</div>"
                f"<div class='meta'>{st} · {esc(date_of(x.get('end_date')))}</div></div>"
                f"<div class='vol'>{esc(fmt_money(x.get('volume')))}</div></a>")
    order = sorted(ms, key=lambda x: x.get("volume") or 0, reverse=True)
    rows = "".join(row(x) for x in order)
    jsonld = [
        {"@context":"https://schema.org","@type":"ItemList","name":cat,"numberOfItems":len(ms),
         "itemListElement":[{"@type":"ListItem","position":i+1,"name":x["question"],
            "url":f"{BASE_URL}/markets/{x['slug']}/"} for i,x in enumerate(order[:50])]},
        {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
            {"@type":"ListItem","position":1,"name":"Markets","item":f"{BASE_URL}/markets/"},
            {"@type":"ListItem","position":2,"name":cat,"item":canonical}]}]
    body = f"""{topbar(rel)}
<main class="wrap">
<nav class="breadcrumb"><a href="{rel}markets/index.html">Markets</a><span class="crumb-sep">/</span>{esc(cat)}</nav>
<div class="hub-hero"><h1>{esc(cat)}</h1>
<p>{len(ms)} Polymarket markets · {fmt_money(total_vol)} combined volume · {len(res)} resolved, {len(opn)} open.</p></div>
<div class="mkt-list">{rows}</div></main>{footer(rel)}"""
    d = os.path.join(OUT_CAT, slug); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(head(title, desc, canonical, jsonld, rel) + body)

# ── Master hub (with embedded client-side search/filter) ────────────────────────
def render_hub(markets, cats):
    canonical = f"{BASE_URL}/markets/"; rel = "../"
    n_res = sum(1 for m in markets if is_resolved(m)); n_opn = len(markets) - n_res
    title = f"All Polymarket Markets Analyzed — {len(markets)} Outcomes | {SITE_NAME}"[:68]
    desc = (f"Search {len(markets)} analyzed Polymarket markets ({n_res} resolved, {n_opn} open) "
            f"across {len(cats)} categories. Real outcomes, winners, losers.")[:158]
    # compact index for client-side search
    idx = [{"q":m["question"],"s":m["slug"],"v":round((m.get("volume") or 0)),
            "c":cat_of(m),"r":1 if is_resolved(m) else 0,
            "p":round((yes_price(m) or 0)*100),"d":date_of(m.get("end_date"))} for m in markets]
    chips = "".join(f"<button class='chip' data-cat='{esc(c)}'>{esc(c)} ({len(ms)})</button>"
                    for c,ms in sorted(cats.items(), key=lambda kv:-len(kv[1]))[:40])
    jsonld = [{"@context":"https://schema.org","@type":"CollectionPage","name":"All Polymarket Markets Analyzed",
               "url":canonical,"description":desc,"isPartOf":{"@type":"WebSite","name":SITE_NAME,"url":BASE_URL}}]
    body = f"""{topbar(rel)}
<main class="wrap">
<div class="hub-hero"><h1>Polymarket Markets, Decoded</h1>
<p>{len(markets)} markets analyzed across {len(cats)} categories — {n_res} resolved, {n_opn} open. Real outcomes, real winning and losing wallets.</p></div>
<div class="hub-search"><input id="hubq" type="text" placeholder="Search {len(markets)} markets…" autocomplete="off">
<div class="hub-filters"><button class="fbtn active" data-st="all">All</button><button class="fbtn" data-st="1">Resolved</button><button class="fbtn" data-st="0">Open</button>
<select id="hubsort"><option value="v">Sort: Volume</option><option value="d">Sort: Date</option></select></div></div>
<div class="chip-row" id="chips">{chips}</div>
<p class="results-count" id="rc"></p>
<div class="mkt-list" id="hublist"></div>
<button id="hubmore" class="more-btn">Show more</button>
</main>{footer(rel)}
<script>
const IDX={json.dumps(idx,separators=(",",":"))};
const fm=n=>n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1e3?'$'+(n/1e3).toFixed(0)+'K':'$'+n;
let q='',st='all',cat='',sort='v',shown=60;
const list=document.getElementById('hublist'),rc=document.getElementById('rc'),more=document.getElementById('hubmore');
function filt(){{let r=IDX.filter(m=>(!q||m.q.toLowerCase().includes(q))&&(st==='all'||m.r==+st)&&(!cat||m.c===cat));
r.sort((a,b)=>sort==='v'?b.v-a.v:(b.d>a.d?1:-1));return r;}}
function render(){{const r=filt();rc.textContent='About '+r.length.toLocaleString()+' markets';
list.innerHTML=r.slice(0,shown).map(m=>`<a class="mkt-row" href="../markets/${{m.s}}/"><div><div class="q">${{m.q.replace(/</g,'&lt;')}}</div><div class="meta">${{m.c}} · ${{m.r?'Resolved '+m.p+'¢':'Open '+m.p+'¢'}} · ${{m.d}}</div></div><div class="vol">${{fm(m.v)}}</div></a>`).join('');
more.style.display=r.length>shown?'block':'none';}}
document.getElementById('hubq').addEventListener('input',e=>{{q=e.target.value.toLowerCase();shown=60;render();}});
document.querySelectorAll('.fbtn').forEach(b=>b.addEventListener('click',()=>{{document.querySelectorAll('.fbtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');st=b.dataset.st;shown=60;render();}}));
document.getElementById('hubsort').addEventListener('change',e=>{{sort=e.target.value;render();}});
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{{if(cat===c.dataset.cat){{cat='';c.classList.remove('on');}}else{{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));cat=c.dataset.cat;c.classList.add('on');}}shown=60;render();}}));
more.addEventListener('click',()=>{{shown+=60;render();}});
render();
</script>"""
    with open(os.path.join(OUT_MKT, "index.html"), "w", encoding="utf-8") as f:
        f.write(head(title, desc, canonical, jsonld, rel) + body)

# ── SEO files ───────────────────────────────────────────────────────────────────
def write_seo_files(markets, cats):
    urls = [f"{BASE_URL}/", f"{BASE_URL}/markets/"]
    urls += [f"{BASE_URL}/markets/category/{slugify(c)}/" for c in cats]
    urls += [f"{BASE_URL}/markets/{m['slug']}/" for m in markets]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        pr = "1.0" if (u.endswith("/markets/") or u == f"{BASE_URL}/") else "0.7"
        sm.append(f"<url><loc>{u}</loc><changefreq>weekly</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    open(os.path.join(ROOT,"sitemap.xml"),"w").write("\n".join(sm))
    open(os.path.join(ROOT,"robots.txt"),"w").write(
        "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\n"
        "User-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nUser-agent: Googlebot\nAllow: /\n\n"
        f"Sitemap: {BASE_URL}/sitemap.xml\n")
    top = sorted(cats.items(), key=lambda kv:-len(kv[1]))[:25]
    open(os.path.join(ROOT,"llms.txt"),"w").write(
        f"# {SITE_NAME} — {TAGLINE}\n\n> {SITE_NAME} analyzes {len(markets)} Polymarket markets with real "
        f"outcomes and real wallet-level winners/losers computed from on-chain trade data.\n\n## Key Pages\n\n"
        f"- [All Markets]({BASE_URL}/markets/): searchable index of every market.\n"
        f"- [Terminal]({BASE_URL}/): interactive search terminal.\n\n## Categories\n\n" +
        "".join(f"- [{c}]({BASE_URL}/markets/category/{slugify(c)}/): {len(ms)} markets.\n" for c,ms in top) +
        "\n## About\n\nReal Polymarket data: outcomes, dates and volume from public Polymarket sources; "
        "winners/losers computed from on-chain Polygon trade records. Not financial advice.\n")

# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    markets = json.load(open(os.path.join(ROOT,"markets_real.json")))
    try:
        whales_all = json.load(open(os.path.join(ROOT,"whales_real.json")))
    except Exception:
        whales_all = {}

    seen=set()
    for m in markets:
        s = m.get("slug") or slugify(m["question"])
        base=s; i=2
        while s in seen: s=f"{base}-{i}"; i+=1
        seen.add(s); m["slug"]=s

    cats = defaultdict(list)
    for m in markets: cats[cat_of(m)].append(m)

    start = int(sys.argv[1]) if len(sys.argv)>1 else 0
    end = int(sys.argv[2]) if len(sys.argv)>2 else len(markets)
    for i,m in enumerate(markets):
        if i<start or i>=end: continue
        render_market(m, cats, whales_all)
        if (i+1)%500==0: print(f"  …{i+1}/{len(markets)} pages", flush=True)
    if end>=len(markets):
        for c,ms in cats.items(): render_category(c,ms)
        render_hub(markets,cats); write_seo_files(markets,cats)
        wn = len(whales_all)
        print(f"✓ {len(cats)} categories + hub + sitemap/robots/llms; real whales on {wn} markets")
    print(f"✓ pages [{start}:{min(end,len(markets))}] of {len(markets)}")

if __name__ == "__main__":
    main()
