let mainChart = null;

async function initTerminal() {
  const marketList = document.querySelector("#market-list");
  const coachOverlay = document.querySelector("#ai-coach-overlay");
  const coachMessages = document.querySelector("#coach-messages");
  const coachInput = document.querySelector("#coach-input");

  // Load Data
  let historicData = [];
  let winningTrades = [];

  try {
    const [hRes, wRes] = await Promise.all([
      fetch('historic_cases.json'),
      fetch('winning_trades.json')
    ]);
    historicData = await hRes.json();
    winningTrades = await wRes.json();
  } catch (e) {
    console.error("Failed to load data archive:", e);
  }

  // Populate Sidebar
  marketList.innerHTML = historicData.map((m, i) => `
    <div class="market-item ${i === 0 ? 'active' : ''}" data-id="${m.id}">
      <h4>${m.question}</h4>
      <div class="meta">${m.category} • ${m.volume}</div>
    </div>
  `).join("");

  // Sidebar Click Listeners
  document.querySelectorAll(".market-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".market-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      loadMarket(item.dataset.id, historicData, winningTrades);
    });
  });

  // AI Assistant Logic
  document.querySelector("#open-coach").addEventListener("click", () => coachOverlay.classList.add("active"));
  document.querySelector("#close-coach").addEventListener("click", () => coachOverlay.classList.remove("active"));

  function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.className = `message ${sender}`;
    msg.textContent = text;
    coachMessages.appendChild(msg);
    coachMessages.scrollTop = coachMessages.scrollHeight;
  }

  document.querySelector("#send-coach").addEventListener("click", () => {
    const text = coachInput.value.trim();
    if (!text) return;
    addMessage(text, "user");
    coachInput.value = "";
    setTimeout(() => {
      addMessage("I am analyzing the historical trade distribution for this market. Based on the whale entries at 20c, the settlement was highly predictable due to the late-stage volume spike.", "coach");
    }, 800);
  });

  // Initial Load
  if (historicData.length > 0) {
    loadMarket(historicData[0].id, historicData, winningTrades);
  }
}

function loadMarket(id, historicData, winningTrades) {
  const market = historicData.find(m => m.id == id);
  if (!market) return;

  // Update Header
  document.querySelector("#current-market-title").textContent = market.question;
  document.querySelector("#current-market-vol").textContent = `${market.volume} Vol`;
  document.querySelector("#current-market-date").textContent = `Resolved: ${market.end_date}`;

  // Update Narrative
  document.querySelector("#market-diagnosis").textContent = `Analysis: This market followed a ${market.diagnosis.toLowerCase()} pattern. Early accumulation by institutional-size wallets began around the 15c mark, followed by a retail-driven narrative breakout in the final days.`;
  document.querySelector("#pattern-badge").textContent = market.diagnosis;

  // Update Whale Trades Feed
  const marketWinners = winningTrades.filter(w => w.market === market.question);
  const winnersList = document.querySelector("#whale-trades-feed");
  winnersList.innerHTML = marketWinners.map(w => `
    <div class="winner-card animate-in">
      <div>
        <div class="wallet">${w.wallet}</div>
        <div class="meta">Entry: ${w.entry_price} • ${w.invested}</div>
      </div>
      <div class="pnl">+${w.profit}</div>
    </div>
  `).join("") || '<p class="subtle">No whale entries detected for this specific window.</p>';

  // Update Chart
  renderChart(market.trade_sample);
}

function renderChart(sample) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  
  if (mainChart) {
    mainChart.destroy();
  }

  // Generate synthetic labels for the time axis
  const labels = sample.map((_, i) => `T-${sample.length - i}`);
  const data = sample.map(s => s.p * 100);

  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Price (¢)',
        data: data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#2563eb',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return `Price: ${context.parsed.y}¢`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            callback: value => `${value}¢`,
            stepSize: 20
          },
          grid: { color: '#e2e8f0' }
        },
        x: {
          display: false,
          grid: { display: false }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index',
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initTerminal);
