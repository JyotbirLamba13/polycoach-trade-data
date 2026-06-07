let candleSeries = null;
let chart = null;
let searchIndex = [];
let recentAnalyzed = [];
let selectedIndex = -1;
let currentMarket = null;
let currentInterval = 3600;
let currentChartData = [];
let activePriceLines = [];
let selectedTrade = null; // { type: 'winner'|'loser', idx: 0|1|2 }

// ─── Hashing & wallet generation ────────────────────────────────────────────

function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    return h;
}

function generateAddress(seed) {
    const hex = '0123456789abcdef';
    let s = seed >>> 0 || 1;
    let addr = '';
    for (let i = 0; i < 40; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        addr += hex[s >>> 28];
    }
    return '0x' + addr;
}

function shortAddr(addr) { return `${addr.slice(0, 8)}...${addr.slice(-6)}`; }

function seededRng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtMoney(n) {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
}

function fmtDuration(seconds) {
    const h = Math.round(seconds / 3600);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return d < 14 ? `${d}d` : `${Math.round(d / 7)}w`;
}

// ─── Init ────────────────────────────────────────────────────────────────────

// ─── Hero animations ─────────────────────────────────────────────────────────

function initHeroCanvas() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 55 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.2,
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p, i) => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            ctx.fillStyle = 'rgba(41,98,255,0.45)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();

            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const d = Math.hypot(p.x - q.x, p.y - q.y);
                if (d < 140) {
                    ctx.strokeStyle = `rgba(41,98,255,${0.13 * (1 - d / 140)})`;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.stroke();
                }
            }
        });
        requestAnimationFrame(draw);
    }
    draw();
}

function animateCounter(elId, target, duration, fmt) {
    const el = document.querySelector(elId);
    if (!el) return;
    const start = performance.now();
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(Math.floor(eased * target));
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function typewriterPlaceholder(input, texts, speed = 75) {
    if (!input) return;
    let ti = 0, ci = 0, deleting = false;
    function tick() {
        const text = texts[ti];
        if (!deleting) {
            input.placeholder = text.slice(0, ++ci);
            if (ci >= text.length) { deleting = true; setTimeout(tick, 2200); return; }
        } else {
            input.placeholder = text.slice(0, --ci);
            if (ci <= 0) { deleting = false; ti = (ti + 1) % texts.length; }
        }
        setTimeout(tick, deleting ? speed / 2 : speed);
    }
    tick();
}

let realById = {};      // id -> full real market record (markets_real.json)
let whalesById = {};    // id -> { winners, losers, trades, lo, hi } (whales_real.json)

function fmtVol(n) {
    n = Math.abs(n || 0);
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${Math.round(n)}`;
}
function realYes(m) {
    try { return parseFloat(JSON.parse(m.outcome_prices.replace(/'/g, '"'))[0]); }
    catch (e) { return null; }
}

async function init() {
    try {
        const r = await fetch('markets_real.json');
        const raw = await r.json();
        realById = {};
        searchIndex = raw.map(m => {
            realById[m.id] = m;
            return {
                id: m.id, q: m.question, c: m.event_title || 'Other',
                d: (m.end_date || '').slice(0, 10), v: fmtVol(m.volume), _real: m,
            };
        });
    } catch (e) { console.error("Failed to load markets_real.json", e); }

    try {
        whalesById = await (await fetch('whales_real.json')).json();
    } catch (e) { whalesById = {}; }

    initHeroCanvas();

    const totalVolB = searchIndex.reduce((s, m) => s + (m._real.volume || 0), 0) / 1e9;
    setTimeout(() => {
        animateCounter('#stat-markets', searchIndex.length, 1600, v => v.toLocaleString());
        animateCounter('#stat-volume',  Math.round(totalVolB * 10), 1600, v => `$${(v / 10).toFixed(1)}B+`);
        animateCounter('#stat-whales',  Object.keys(whalesById).length || 800, 1600, v => v.toLocaleString());
    }, 650);

    typewriterPlaceholder(document.querySelector('#main-search'), [
        'Search markets, wallets, events...',
        'Try: Trump 2024',
        'Try: Bitcoin above $100K',
        'Try: Federal Reserve rate cut',
        'Try: Gaza Ceasefire 2025',
    ]);

    setupSearch("#main-search", "#search-suggestions");
    setupSearch("#terminal-top-search", "#terminal-suggestions");

    document.querySelector("#return-search").addEventListener("click", () => {
        document.querySelector("#hero-search").style.display = "flex";
        document.querySelector("#terminal-view").style.display = "none";
        document.body.classList.add("search-mode");
    });

    document.querySelectorAll(".pill").forEach(p => {
        p.addEventListener("click", () => {
            const query = p.dataset.search.toLowerCase();
            const match = searchIndex.find(m => m.q.toLowerCase().includes(query));
            if (match) loadMarketTerminal(match.id);
        });
    });

    document.querySelectorAll(".t-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".t-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const label = btn.textContent.trim();
            if (label === "1H") currentInterval = 3600;
            else if (label === "4H") currentInterval = 14400;
            else if (label === "1D") currentInterval = 86400;
            if (currentMarket) {
                document.querySelector("#chart-loading").style.display = "block";
                setTimeout(() => renderDarkChart(currentMarket, currentInterval), 50);
            }
        });
    });
}

// ─── Search ──────────────────────────────────────────────────────────────────

function setupSearch(inputSel, suggSel) {
    const input = document.querySelector(inputSel);
    const sugg = document.querySelector(suggSel);

    input.addEventListener("input", e => {
        const val = e.target.value.toLowerCase();
        selectedIndex = -1;
        if (val.length < 2) { sugg.classList.remove("active"); return; }
        const filtered = searchIndex.filter(m => m.q.toLowerCase().includes(val)).slice(0, 10);
        if (filtered.length) {
            sugg.innerHTML = filtered.map((m, i) => `
                <div class="suggestion-item" data-id="${m.id}" id="sug-${i}">
                    <strong>${m.q}</strong>
                    <span>${m.c} • ${m.v} Volume • ${m.d}</span>
                </div>`).join("");
            sugg.classList.add("active");
        } else {
            sugg.classList.remove("active");
        }
    });

    input.addEventListener("keydown", e => {
        const items = sugg.querySelectorAll(".suggestion-item");
        if (!sugg.classList.contains("active")) return;
        if (e.key === "ArrowDown") { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, items.length - 1); updateSelection(items); }
        else if (e.key === "ArrowUp") { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateSelection(items); }
        else if (e.key === "Enter" && selectedIndex > -1) { e.preventDefault(); items[selectedIndex].click(); }
    });

    document.addEventListener("click", e => {
        if (e.target.closest(".suggestion-item")) {
            loadMarketTerminal(e.target.closest(".suggestion-item").dataset.id);
            sugg.classList.remove("active");
            input.value = "";
            input.blur();
        } else if (!e.target.closest(inputSel)) {
            sugg.classList.remove("active");
        }
    });
}

function updateSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle("selected", i === selectedIndex);
        if (i === selectedIndex) item.scrollIntoView({ block: "nearest" });
    });
}

// ─── Market load ─────────────────────────────────────────────────────────────

function loadMarketTerminal(id) {
    const market = searchIndex.find(m => m.id === id);
    if (!market) return;

    currentMarket = market;
    currentInterval = 3600;
    selectedTrade = null; // reset on new market

    document.querySelectorAll(".t-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".t-btn")[0].classList.add("active");

    document.querySelector("#hero-search").style.display = "none";
    document.querySelector("#terminal-view").style.display = "flex";
    document.body.classList.remove("search-mode");

    document.querySelector("#display-title").textContent = market.q;
    document.querySelector("#display-vol").textContent = market.v;
    document.querySelector("#display-date").textContent = market.d;
    document.querySelector("#display-cat").textContent = market.c;

    renderMarketSummary(market);

    if (!recentAnalyzed.find(m => m.id === id)) {
        recentAnalyzed.unshift(market);
        if (recentAnalyzed.length > 8) recentAnalyzed.pop();
        renderRecentSidebar();
    }

    document.querySelector("#chart-loading").style.display = "block";
    setTimeout(() => renderDarkChart(market, currentInterval), 200);
}

// Default real summary shown on every market load (not gated behind a trade click)
function renderMarketSummary(market) {
    const m = market._real || {};
    const w = whalesById[market.id];
    const resolved = m.closed === 1;
    const yes = realYes(m);
    const pct = yes == null ? null : Math.round(yes * 100);

    // Full report link -> SEO page
    const fr = document.querySelector("#full-report");
    if (fr && m.slug) fr.href = `markets/${m.slug}/`;

    const outcome = resolved
        ? `Resolved ${yes >= 0.5 ? 'YES' : 'NO'} at ${pct}¢`
        : `Open · trading ${pct}¢ (YES)`;
    const opened = (m.created_at || '').slice(0, 10);

    const cells = [
        ['VOLUME', market.v],
        ['TRADES', w ? w.trades.toLocaleString() : '—'],
        ['HIGH', w ? `${w.hi}¢` : '—'],
        ['LOW', w ? `${w.lo}¢` : '—'],
        ['OUTCOME', outcome],
    ];
    const verb = resolved ? 'resolved' : 'is currently trading at';
    const tradesTxt = w ? `${w.trades.toLocaleString()} trades` : 'thousands of trades';
    const rangeTxt = w ? ` Price ranged from ${w.lo}¢ to ${w.hi}¢.` : '';
    const summaryLine =
        `${market.q} drew ${market.v} in volume across ${tradesTxt} on Polymarket.${rangeTxt} ` +
        `It ${verb} ${pct == null ? '' : pct + '¢'}${resolved ? ` (${yes >= 0.5 ? 'YES' : 'NO'})` : ''}.`;

    document.querySelector("#market-summary").innerHTML = `
        <p class="summary-line">${summaryLine}</p>
        <div class="summary-cells">
            ${cells.map(([l, v]) => `<div class="sc"><span class="sc-l">${l}</span><span class="sc-v">${v}</span></div>`).join('')}
        </div>`;
}

function renderRecentSidebar() {
    document.querySelector("#recent-list").innerHTML = recentAnalyzed.map(m => `
        <div class="market-item" onclick="loadMarketTerminal('${m.id}')">
            <h4>${m.q}</h4>
            <div class="meta">${m.v} Vol</div>
        </div>`).join("");
}

// ─── Chart data generation ───────────────────────────────────────────────────

function generateChartData(market, interval) {
    const rng = seededRng(djb2(market.id + String(interval)));
    const numCandles = interval === 86400 ? 60 : interval === 14400 ? 120 : 200;
    const volatility = interval === 86400 ? 5 : interval === 14400 ? 2.5 : 1;
    const now = Math.floor(Date.now() / 1000);
    const alignedNow = Math.floor(now / interval) * interval;
    let price = market.v.includes("M") ? 65 : 35;
    const data = [];

    for (let i = 0; i < numCandles; i++) {
        const time = alignedNow - (numCandles - i) * interval;
        const swing = volatility + rng() * volatility * 3;
        const open = price;
        const close = open + (rng() - 0.47) * swing;
        data.push({
            time,
            open: Math.max(1, open) / 100,
            high: Math.max(open, close, open + rng() * volatility * 1.5) / 100,
            low: Math.min(open, close, open - rng() * volatility * 1.5) / 100,
            close: Math.min(99, close) / 100,
        });
        price = close;
    }
    return data;
}

// ─── Trade data generation ───────────────────────────────────────────────────

function generateTradeData(market) {
    const rng = seededRng(djb2(market.id + 'trades_v3'));
    const isHighVol = market.v.includes("M");
    const scale = isHighVol ? 5 : 1;

    function makeWallet(tag) {
        return generateAddress(djb2(market.id + '_' + tag));
    }

    function makeTrade(tag, entryFrac, exitFrac, type, pnlMin, pnlMax, investedMin, investedMax, reason) {
        const pnl = (pnlMin + Math.floor(rng() * (pnlMax - pnlMin))) * scale;
        const invested = (investedMin + Math.floor(rng() * (investedMax - investedMin))) * scale;
        // entryTime / exitTime as fractions of chart range — resolved in updateTerminalPanels
        return { addr: makeWallet(tag), entryFrac, exitFrac, pnl: type === 'winner' ? pnl : -pnl, invested, type, reason };
    }

    const winners = [
        makeTrade('w_alpha', 0.02, 0.98, 'winner', 140000, 280000, 260000, 480000,
            "Entered during maximum uncertainty — market pricing only ~15% chance. Spotted early institutional accumulation and held through two major volatility spikes. Classic conviction play with near-perfect entry timing."),
        makeTrade('w_beta',  0.20, 0.97, 'winner',  60000, 140000, 130000, 280000,
            "Accumulated across three entries during the mid-market correction while weak hands were exiting. Identified a narrative compression pattern that typically precedes a breakout. Reduced slippage with staged sizing."),
        makeTrade('w_gamma', 0.44, 0.96, 'winner',  18000,  55000,  45000, 110000,
            "Late momentum trade after primary resistance broke with volume confirmation. Lower risk, lower reward — textbook trend-following execution into final settlement. No overnight exposure risk."),
    ];

    const losers = [
        makeTrade('l_alpha', 0.54, 0.99, 'loser',  90000, 200000, 180000, 380000,
            "Bet NO at peak crowd overconfidence. Entered counter-trend expecting a reversion that never materialized. Held to full resolution with no stop-loss — lost nearly the entire stake as market settled YES."),
        makeTrade('l_beta',  0.32, 0.67, 'loser',  35000,  90000,  80000, 180000,
            "Bought YES mid-range but panic-sold into a temporary dip, locking in a 40% loss. Market rebounded sharply within hours of exit. Correct thesis, catastrophically poor execution — a textbook weak-hand event."),
        makeTrade('l_gamma', 0.72, 0.99, 'loser',  12000,  38000,  30000,  80000,
            "Late contrarian bet on NO, attempting to scalp a pullback with market already at 85%+ implied probability. Entered with no statistical edge and was wiped at settlement. No position sizing discipline."),
    ];

    return { winners, losers };
}

// ─── Find nearest candle ─────────────────────────────────────────────────────

function nearestIdx(chartData, time) {
    let best = 0, bestDiff = Infinity;
    chartData.forEach((c, i) => {
        const d = Math.abs(c.time - time);
        if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
}

// ─── Chart rendering ──────────────────────────────────────────────────────────

function renderDarkChart(market, interval = 3600) {
    const container = document.getElementById("candlestick-chart");
    if (!container) return;
    container.innerHTML = "";
    activePriceLines = [];

    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 480,
        layout: {
            background: { color: "#15191e" },
            textColor: "#d1d4dc",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
        },
        grid: { vertLines: { color: "#2b2f36" }, horzLines: { color: "#2b2f36" } },
        rightPriceScale: { borderColor: "#2b2f36" },
        timeScale: { borderColor: "#2b2f36", timeVisible: true },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: "#707a8a", labelBackgroundColor: "#2962ff" },
            horzLine: { color: "#707a8a", labelBackgroundColor: "#2962ff" },
        },
        // Let the PAGE scroll over the chart by default; drag still pans, crosshair still works.
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    });

    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: "#00c076", downColor: "#ff3b30",
        borderVisible: false,
        wickUpColor: "#00c076", wickDownColor: "#ff3b30",
    });

    currentChartData = generateChartData(market, interval);
    candleSeries.setData(currentChartData);
    chart.timeScale().fitContent();

    new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    }).observe(container);

    document.querySelector("#chart-loading").style.display = "none";
    updateTerminalPanels(market, currentChartData);
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function updateTerminalPanels(market, chartData) {
    const { winners, losers } = generateTradeData(market);
    const startTime = chartData[0].time;
    const endTime = chartData[chartData.length - 1].time;
    const range = endTime - startTime;

    function resolveIndices(trade) {
        const entryTime = startTime + Math.floor(trade.entryFrac * range);
        const exitTime  = startTime + Math.floor(trade.exitFrac  * range);
        return { entryIdx: nearestIdx(chartData, entryTime), exitIdx: nearestIdx(chartData, exitTime), entryTime, exitTime };
    }

    function buildCard(trade, cssClass) {
        const { entryIdx, exitIdx, entryTime, exitTime } = resolveIndices(trade);
        const entryPct  = Math.round(chartData[entryIdx].close * 100);
        const exitPct   = Math.round(chartData[exitIdx].close  * 100);
        const returnPct = Math.round((trade.pnl / trade.invested) * 100);
        const duration  = fmtDuration(exitTime - entryTime);
        const pnlStr    = trade.pnl >= 0 ? `+${fmtMoney(trade.pnl)}` : `-${fmtMoney(Math.abs(trade.pnl))}`;
        const pnlCls    = trade.pnl >= 0 ? 'card-pnl pnl' : 'card-pnl pnl loss';
        const retCls    = trade.pnl >= 0 ? 'cs-val green' : 'cs-val red';
        const retStr    = (returnPct >= 0 ? '+' : '') + returnPct + '%';
        const polyUrl   = `https://polymarket.com/profile/${trade.addr}`;
        return `
            <div class="${cssClass} clickable">
                <div class="card-top">
                    <a class="wallet-link" href="${polyUrl}" target="_blank" rel="noopener"
                       onclick="event.stopPropagation()">${shortAddr(trade.addr)} ↗</a>
                    <span class="${pnlCls}">${pnlStr}</span>
                </div>
                <div class="card-body">
                    <div class="cs"><span class="cs-lbl">ENTRY</span><span class="cs-val">${entryPct}¢</span></div>
                    <div class="cs"><span class="cs-lbl">EXIT</span><span class="cs-val">${exitPct}¢</span></div>
                    <div class="cs"><span class="cs-lbl">RETURN</span><span class="${retCls}">${retStr}</span></div>
                    <div class="cs"><span class="cs-lbl">HELD</span><span class="cs-val">${duration}</span></div>
                    <div class="cs cs-invested">
                        <span class="cs-lbl">INVESTED</span>
                        <span class="cs-val">${fmtMoney(trade.invested)}</span>
                    </div>
                </div>
            </div>`;
    }

    document.querySelector("#whale-feed").innerHTML  = winners.map(w => buildCard(w, 'winner-card')).join("");
    document.querySelector("#loser-feed").innerHTML  = losers.map(l  => buildCard(l,  'loser-card')).join("");

    document.querySelector("#analysis-text").textContent = "Click any trade to see entry/exit on chart and full analysis.";
    document.querySelector("#stat-entry").textContent   = "--";
    document.querySelector("#stat-outcome").textContent = "--";
    document.querySelector("#stat-detail").textContent  = "--";

    document.querySelectorAll(".winner-card").forEach((card, i) => {
        card.addEventListener("click", () => selectTrade('winner', i, winners, losers, chartData));
    });
    document.querySelectorAll(".loser-card").forEach((card, i) => {
        card.addEventListener("click", () => selectTrade('loser', i, winners, losers, chartData));
    });

    // Restore selection after timeframe switch
    if (selectedTrade) {
        const cards = selectedTrade.type === 'winner'
            ? document.querySelectorAll(".winner-card")
            : document.querySelectorAll(".loser-card");
        if (cards[selectedTrade.idx]) cards[selectedTrade.idx].classList.add("active-trade");
        applyTradeToChart(selectedTrade.type, selectedTrade.idx, winners, losers, chartData);
    }
}

function selectTrade(type, idx, winners, losers, chartData) {
    selectedTrade = { type, idx };
    clearActiveCards();
    const cards = type === 'winner'
        ? document.querySelectorAll(".winner-card")
        : document.querySelectorAll(".loser-card");
    if (cards[idx]) cards[idx].classList.add("active-trade");
    applyTradeToChart(type, idx, winners, losers, chartData);
}

function applyTradeToChart(type, idx, winners, losers, chartData) {
    const trade = (type === 'winner' ? winners : losers)[idx];
    if (!trade) return;

    const startTime = chartData[0].time;
    const endTime   = chartData[chartData.length - 1].time;
    const range = endTime - startTime;
    const entryTime = startTime + Math.floor(trade.entryFrac * range);
    const exitTime  = startTime + Math.floor(trade.exitFrac  * range);
    const entryIdx  = nearestIdx(chartData, entryTime);
    const exitIdx   = nearestIdx(chartData, exitTime);

    clearPriceLines();

    const entryPrice = chartData[entryIdx].close;
    const exitPrice  = chartData[exitIdx].close;
    const isWinner = trade.pnl >= 0;

    activePriceLines.push(candleSeries.createPriceLine({
        price: entryPrice, color: "#2962ff",
        lineWidth: 2, lineStyle: 2,
        axisLabelVisible: true, title: "ENTRY",
    }));
    activePriceLines.push(candleSeries.createPriceLine({
        price: exitPrice, color: isWinner ? "#00c076" : "#ff3b30",
        lineWidth: 2, lineStyle: 2,
        axisLabelVisible: true, title: isWinner ? "EXIT ✓" : "EXIT ✗",
    }));

    chart.timeScale().setVisibleRange({
        from: chartData[Math.max(0, entryIdx - 8)].time,
        to:   chartData[Math.min(chartData.length - 1, exitIdx + 8)].time,
    });

    const entryPct  = Math.round(entryPrice * 100);
    const exitPct   = Math.round(exitPrice  * 100);
    const returnPct = Math.round((trade.pnl / trade.invested) * 100);
    const pnlStr    = isWinner ? `+${fmtMoney(trade.pnl)}` : `-${fmtMoney(Math.abs(trade.pnl))}`;
    const retStr    = (returnPct >= 0 ? '+' : '') + returnPct + '%';
    const duration  = fmtDuration(exitTime - entryTime);

    document.querySelector("#analysis-text").textContent = trade.reason;
    document.querySelector("#stat-entry").textContent    = `${entryPct}¢`;
    document.querySelector("#stat-outcome").textContent  = `${exitPct}¢  ·  ${pnlStr}  (${retStr})`;
    document.querySelector("#stat-detail").textContent   = `${fmtMoney(trade.invested)}  ·  ${duration}`;
}

function clearPriceLines() {
    activePriceLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch (e) {} });
    activePriceLines = [];
}

function clearActiveCards() {
    document.querySelectorAll(".winner-card, .loser-card").forEach(c => c.classList.remove("active-trade"));
}

document.addEventListener("DOMContentLoaded", init);
