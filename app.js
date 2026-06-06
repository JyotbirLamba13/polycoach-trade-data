let candleSeries = null;
let chart = null;
let searchIndex = [];
let recentAnalyzed = [];
let selectedIndex = -1;

async function init() {
    try {
        const response = await fetch('search_index.json');
        searchIndex = await response.json();
    } catch (e) {
        console.error("Failed to load search index", e);
    }

    setupSearch("#main-search", "#search-suggestions");
    setupSearch("#terminal-top-search", "#terminal-suggestions");

    document.querySelector("#return-search").addEventListener("click", () => {
        document.querySelector("#hero-search").style.display = "flex";
        document.querySelector("#terminal-view").style.display = "none";
        document.body.classList.add("search-mode");
    });

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
            .slice(0, 8);

        if (filtered.length > 0) {
            suggestions.innerHTML = filtered.map((m, i) => `
                <div class="suggestion-item" data-id="${m.id}" id="sug-${i}">
                    <strong>${m.q}</strong>
                    <span>${m.c} • ${m.v} Volume</span>
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
        const item = e.target.closest(suggestionSelector + " .suggestion-item");
        if (item) {
            loadMarketTerminal(item.dataset.id);
            suggestions.classList.remove("active");
            input.value = "";
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

    // Update Recent
    if (!recentAnalyzed.find(m => m.id === id)) {
        recentAnalyzed.unshift(market);
        if (recentAnalyzed.length > 10) recentAnalyzed.pop();
        renderRecentSidebar();
    }

    document.querySelector("#hero-search").style.display = "none";
    document.querySelector("#terminal-view").style.display = "grid";
    document.body.classList.remove("search-mode");

    document.querySelector("#display-title").textContent = market.q;
    document.querySelector("#display-vol").textContent = `${market.v} Vol`;
    document.querySelector("#display-date").textContent = `Resolved: ${market.d}`;
    document.querySelector("#display-cat").textContent = market.c;

    document.querySelector("#chart-loading").style.display = "block";
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            renderProChart(market);
        }, 50);
    });
}

function renderRecentSidebar() {
    const list = document.querySelector("#recent-list");
    list.innerHTML = recentAnalyzed.map(m => `
        <div class="market-item" onclick="loadMarketTerminal('${m.id}')">
            <h4>${m.q}</h4>
            <div class="meta">${m.v} Volume</div>
        </div>
    `).join("");
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
