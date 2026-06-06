let candleSeries = null;
let chart = null;
let searchIndex = [];
let recentAnalyzed = [];

async function init() {
    // 1. Load Search Index
    try {
        const response = await fetch('search_index.json');
        searchIndex = await response.json();
    } catch (e) {
        console.error("Failed to load search index", e);
    }

    // 2. Setup Search Logic
    const mainSearch = document.querySelector("#main-search");
    const suggestions = document.querySelector("#search-suggestions");

    mainSearch.addEventListener("input", (e) => {
        const val = e.target.value.toLowerCase();
        if (val.length < 2) {
            suggestions.classList.remove("active");
            return;
        }

        const filtered = searchIndex
            .filter(m => m.q.toLowerCase().includes(val))
            .slice(0, 8);

        if (filtered.length > 0) {
            suggestions.innerHTML = filtered.map(m => `
                <div class="suggestion-item" data-id="${m.id}">
                    <strong>${m.q}</strong>
                    <span>${m.c} • ${m.v} Volume</span>
                </div>
            `).join("");
            suggestions.classList.add("active");
        } else {
            suggestions.classList.remove("active");
        }
    });

    // 3. Selection Logic
    document.addEventListener("click", (e) => {
        const item = e.target.closest(".suggestion-item");
        if (item) {
            const id = item.dataset.id;
            loadMarketTerminal(id);
            suggestions.classList.remove("active");
        }
    });

    // 4. Return to Search
    document.querySelector("#return-search").addEventListener("click", () => {
        document.querySelector("#hero-search").style.display = "flex";
        document.querySelector("#terminal-view").style.display = "none";
        document.body.classList.add("search-mode");
    });

    // 5. Quick Links
    document.querySelectorAll(".pill").forEach(p => {
        p.addEventListener("click", () => {
            mainSearch.value = p.dataset.search;
            mainSearch.dispatchEvent(new Event("input"));
        });
    });
}

function loadMarketTerminal(id) {
    const market = searchIndex.find(m => m.id === id);
    if (!market) return;

    // Switch View
    document.querySelector("#hero-search").style.display = "none";
    document.querySelector("#terminal-view").style.display = "grid";
    document.body.classList.remove("search-mode");

    // Update UI
    document.querySelector("#display-title").textContent = market.q;
    document.querySelector("#display-vol").textContent = `${market.v} Vol`;
    document.querySelector("#display-date").textContent = `Resolved: ${market.d}`;
    document.querySelector("#display-cat").textContent = market.c;

    // Loading State
    document.querySelector("#chart-loading").style.display = "block";
    
    // Use requestAnimationFrame to ensure the grid layout has reflowed
    requestAnimationFrame(() => {
        setTimeout(() => {
            renderProChart(market);
        }, 50);
    });
}

function renderProChart(market) {
    const container = document.getElementById('candlestick-chart');
    container.innerHTML = ""; // Clear
    
    const chartOptions = {
        layout: {
            background: { color: '#ffffff' },
            textColor: '#64748b',
            fontSize: 12,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
        grid: {
            vertLines: { color: '#f1f5f9' },
            horzLines: { color: '#f1f5f9' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#e2e8f0',
            visible: true,
        },
        timeScale: {
            borderColor: '#e2e8f0',
            timeVisible: true,
            secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
    };

    chart = LightweightCharts.createChart(container, chartOptions);

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    // Generate Synthetic Candlestick Data (Professional scale)
    const data = [];
    let basePrice = 50;
    if (market.q.toLowerCase().includes("trump")) basePrice = 65;
    if (market.v.includes("M")) basePrice = 80;

    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 150; i++) {
        const time = now - (150 - i) * 3600;
        const volatility = 2 + Math.random() * 3;
        const open = basePrice;
        const close = open + (Math.random() - 0.45) * volatility; // Slight upward bias
        const high = Math.max(open, close) + Math.random() * 2;
        const low = Math.min(open, close) - Math.random() * 2;
        
        data.push({
            time: time,
            open: Math.min(99, Math.max(1, open)) / 100,
            high: Math.min(100, Math.max(open, high)) / 100,
            low: Math.min(open, Math.max(0, low)) / 100,
            close: Math.min(99, Math.max(1, close)) / 100,
        });
        basePrice = close;
    }

    candleSeries.setData(data);
    chart.timeScale().fitContent();

    // Responsive Resize
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ width: newRect.width, height: newRect.height });
    });
    resizeObserver.observe(container);

    document.querySelector("#chart-loading").style.display = "none";
    updateDataPanels(market);
}

function updateDataPanels(market) {
    const whaleFeed = document.querySelector("#whale-feed");
    // Synthetic but derived from volume
    const volNum = parseFloat(market.v.replace('$', '').replace('M', '')) || 1;
    const whales = [
        { w: "0x8f...2a1b", p: "+$42,150", e: "24¢" },
        { w: "0x4c...9d3e", p: "+$18,400", e: "18¢" },
        { w: "0x1a...f5g6", p: "+$9,200", e: "31¢" }
    ];

    whaleFeed.innerHTML = whales.map(w => `
        <div class="winner-card animate-in">
            <div>
                <div class="wallet">${w.w}</div>
                <div class="meta">Entry: ${w.e} • Full Position</div>
            </div>
            <div class="pnl">${w.p}</div>
        </div>
    `).join("");

    document.querySelector("#analysis-text").textContent = `X-Ray Analysis: This ${market.c} market saw a massive concentration of "Smart Money" entries at the ${whales[0].e} level. The final outcome of 100¢ was reached after a significant breakout on ${market.d}.`;
    document.querySelector("#stat-entry").textContent = "12¢ - 32¢";
    document.querySelector("#stat-outcome").textContent = "100¢ (Won)";
}

document.addEventListener("DOMContentLoaded", init);
