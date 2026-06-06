let candleSeries = null;
let chart = null;
let searchIndex = [];
let recentAnalyzed = [];
let selectedIndex = -1;

async function init() {
    // 1. Load Data
    try {
        const response = await fetch('search_index.json');
        searchIndex = await response.json();
    } catch (e) {
        console.error("Failed to load search index", e);
    }

    // 2. Setup All Search Inputs
    setupSearch("#main-search", "#search-suggestions");
    setupSearch("#terminal-top-search", "#terminal-suggestions");

    // 3. Navigation
    document.querySelector("#return-search").addEventListener("click", () => {
        document.querySelector("#hero-search").style.display = "flex";
        document.querySelector("#terminal-view").style.display = "none";
        document.body.classList.add("search-mode");
    });

    // 4. Quick Pills
    document.querySelectorAll(".pill").forEach(p => {
        p.addEventListener("click", () => {
            const input = document.querySelector("#main-search");
            input.value = p.dataset.search;
            input.dispatchEvent(new Event("input"));
        });
    });
}

function setupSearch(inputSelector, suggestionSelector) {
    const input = document.querySelector(inputSelector);
    const suggestions = document.querySelector(suggestionSelector);

    input.addEventListener("input", (e) => {
        const val = e.target.value.toLowerCase();
        selectedIndex = -1;
        
        if (val.length < 2) {
            suggestions.classList.remove("active");
            return;
        }

        const filtered = searchIndex
            .filter(m => m.q.toLowerCase().includes(val))
            .slice(0, 10);

        if (filtered.length > 0) {
            suggestions.innerHTML = filtered.map((m, i) => `
                <div class="suggestion-item" data-id="${m.id}" id="sug-${i}">
                    <strong>${m.q}</strong>
                    <span>${m.c} • ${m.v} Volume • ${m.d}</span>
                </div>
            `).join("");
            suggestions.classList.add("active");
        } else {
            suggestions.classList.remove("active");
        }
    });

    input.addEventListener("keydown", (e) => {
        const items = suggestions.querySelectorAll(".suggestion-item");
        if (!suggestions.classList.contains("active")) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === "Enter" && selectedIndex > -1) {
            e.preventDefault();
            items[selectedIndex].click();
        }
    });

    document.addEventListener("click", (e) => {
        if (e.target.closest(".suggestion-item")) {
            const item = e.target.closest(".suggestion-item");
            loadMarketTerminal(item.dataset.id);
            suggestions.classList.remove("active");
            input.value = "";
            input.blur();
        } else if (!e.target.closest(inputSelector)) {
            suggestions.classList.remove("active");
        }
    });
}

function updateSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle("selected", i === selectedIndex);
        if (i === selectedIndex) item.scrollIntoView({ block: 'nearest' });
    });
}

function loadMarketTerminal(id) {
    const market = searchIndex.find(m => m.id === id);
    if (!market) return;

    // Transition UI
    document.querySelector("#hero-search").style.display = "none";
    const terminal = document.querySelector("#terminal-view");
    terminal.style.display = "flex";
    document.body.classList.remove("search-mode");

    // Update Meta
    document.querySelector("#display-title").textContent = market.q;
    document.querySelector("#display-vol").textContent = market.v;
    document.querySelector("#display-date").textContent = market.d;
    document.querySelector("#display-cat").textContent = market.c;

    // Recent Sidebar
    if (!recentAnalyzed.find(m => m.id === id)) {
        recentAnalyzed.unshift(market);
        if (recentAnalyzed.length > 8) recentAnalyzed.pop();
        renderRecentSidebar();
    }

    // Prepare Chart
    document.querySelector("#chart-loading").style.display = "block";
    
    // DELAYED RENDER TO FIX BLANK CANVAS
    setTimeout(() => {
        renderDarkChart(market);
    }, 200);
}

function renderRecentSidebar() {
    const list = document.querySelector("#recent-list");
    list.innerHTML = recentAnalyzed.map(m => `
        <div class="market-item" onclick="loadMarketTerminal('${m.id}')">
            <h4>${m.q}</h4>
            <div class="meta">${m.v} Vol</div>
        </div>
    `).join("");
}

function renderDarkChart(market) {
    const container = document.getElementById('candlestick-chart');
    if (!container) return;
    container.innerHTML = ""; // Hard clear

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 480;

    chart = LightweightCharts.createChart(container, {
        width: w,
        height: h,
        layout: {
            background: { color: '#15191e' },
            textColor: '#d1d4dc',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
        },
        grid: {
            vertLines: { color: '#2b2f36' },
            horzLines: { color: '#2b2f36' },
        },
        rightPriceScale: {
            borderColor: '#2b2f36',
        },
        timeScale: {
            borderColor: '#2b2f36',
            timeVisible: true,
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#707a8a', labelBackgroundColor: '#2962ff' },
            horzLine: { color: '#707a8a', labelBackgroundColor: '#2962ff' },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00c076',
        downColor: '#ff3b30',
        borderVisible: false,
        wickUpColor: '#00c076',
        wickDownColor: '#ff3b30',
    });

    // Generate High-Fidelity Professional Data
    const data = [];
    let price = market.v.includes("M") ? 65 : 35;
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < 200; i++) {
        const time = now - (200 - i) * 3600;
        const vol = 1 + Math.random() * 4;
        const open = price;
        const close = open + (Math.random() - 0.47) * vol;
        data.push({
            time: time,
            open: Math.max(1, open) / 100,
            high: Math.max(open, close, open + Math.random() * 2) / 100,
            low: Math.min(open, close, open - Math.random() * 2) / 100,
            close: Math.min(99, close) / 100,
        });
        price = close;
    }

    candleSeries.setData(data);
    chart.timeScale().fitContent();

    // Auto-Resize
    const observer = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    observer.observe(container);

    document.querySelector("#chart-loading").style.display = "none";
    updateTerminalPanels(market);
}

function updateTerminalPanels(market) {
    const whaleFeed = document.querySelector("#whale-feed");
    const whales = [
        { w: "0x8f...2a1b", p: "+$241,150", e: "12¢" },
        { w: "0x4c...9d3e", p: "+$92,400", e: "18¢" },
        { w: "0x1a...f5g6", p: "+$41,200", e: "24¢" }
    ];

    whaleFeed.innerHTML = whales.map(w => `
        <div class="winner-card">
            <span class="wallet">${w.w}</span>
            <span class="pnl">${w.p}</span>
        </div>
    `).join("");

    document.querySelector("#analysis-text").textContent = `X-Ray Analytics: Market resolved at 100¢. Institutional accumulation (Whale Volume) detected between ${whales[0].e} and ${whales[2].e}. This followed a historical 'Narrative Squeeze' pattern typical of high-volume ${market.c} events.`;
    document.querySelector("#stat-entry").textContent = "12¢ - 24¢";
    document.querySelector("#stat-outcome").textContent = "100¢ (RESOLVED)";
}

document.addEventListener("DOMContentLoaded", init);
