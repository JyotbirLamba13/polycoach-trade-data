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

    if (!recentAnalyzed.find(m => m.id === id)) {
        recentAnalyzed.unshift(market);
        if (recentAnalyzed.length > 10) recentAnalyzed.pop();
        renderRecentSidebar();
    }

    document.querySelector("#hero-search").style.display = "none";
    document.querySelector("#terminal-view").style.display = "flex";
    document.body.classList.remove("search-mode");

    document.querySelector("#display-title").textContent = market.q;
    document.querySelector("#display-vol").textContent = `${market.v} Vol`;
    document.querySelector("#display-date").textContent = `Resolved: ${market.d}`;
    document.querySelector("#display-cat").textContent = market.c;

    document.querySelector("#chart-loading").style.display = "block";
    
    // Robust delay for container rendering
    setTimeout(() => {
        renderProChart(market);
    }, 100);
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
    if (!container) return;
    container.innerHTML = ""; // Clear existing
    
    const containerRect = container.getBoundingClientRect();
    
    chart = LightweightCharts.createChart(container, {
        width: containerRect.width || 800,
        height: containerRect.height || 480,
        layout: {
            background: { color: '#ffffff' },
            textColor: '#64748b',
        },
        grid: {
            vertLines: { color: '#f1f5f9' },
            horzLines: { color: '#f1f5f9' },
        },
        timeScale: {
            borderColor: '#e2e8f0',
            timeVisible: true,
        },
        rightPriceScale: {
            borderColor: '#e2e8f0',
        }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    const data = [];
    let basePrice = market.v.includes("M") ? 75 : 45;
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < 120; i++) {
        const time = now - (120 - i) * 3600;
        const change = (Math.random() - 0.48) * 4;
        const open = basePrice;
        const close = open + change;
        data.push({
            time: time,
            open: Math.max(1, open) / 100,
            high: Math.max(open, close, open + Math.random()*2) / 100,
            low: Math.min(open, close, open - Math.random()*2) / 100,
            close: Math.min(99, close) / 100,
        });
        basePrice = close;
    }

    candleSeries.setData(data);
    chart.timeScale().fitContent();

    window.addEventListener('resize', () => {
        const newRect = container.getBoundingClientRect();
        chart.applyOptions({ width: newRect.width, height: newRect.height });
    });

    document.querySelector("#chart-loading").style.display = "none";
    updateDataPanels(market);
}

function updateDataPanels(market) {
    const whaleFeed = document.querySelector("#whale-feed");
    const whales = [
        { w: "0x8f...2a1b", p: "+$124,150", e: "14¢" },
        { w: "0x4c...9d3e", p: "+$68,400", e: "22¢" },
        { w: "0x1a...f5g6", p: "+$32,200", e: "28¢" }
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

    document.querySelector("#analysis-text").textContent = `Archive Verdict: This market settled at 100¢ on ${market.d}. Whale accumulation was most aggressive in the 10¢-25¢ range, indicating high-conviction institutional positions before the final narrative breakout.`;
    document.querySelector("#stat-entry").textContent = "14¢ - 28¢";
    document.querySelector("#stat-outcome").textContent = "Resolved (100¢)";
}

document.addEventListener("DOMContentLoaded", init);
