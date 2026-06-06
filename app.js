const scenarios = {
  crypto: {
    label: "Late momentum entry",
    copy: "This setup resembles short-duration crypto markets where losing traders often buy after a visible odds move. The main risk is paying for information the market already absorbed.",
    score: 38,
    similar: 212,
    profitableRate: "34%",
    risk: "High",
    winnerEntry: 41,
    loserEntry: 78,
    insights: [
      ["Profitable pattern", "Entered before the main odds expansion or sold into the spike."],
      ["Losing pattern", "Bought after a sharp move with limited time for the price to recover."],
      ["Key question", "Are you buying new information, or buying the chart after everyone saw it?"]
    ],
    analogs: [
      ["BTC 15m direction", "YES moved from 51c to 74c within 9 minutes", "Late buyers underperformed"],
      ["ETH 5m direction", "Fast odds expansion with thin exit liquidity", "Reversal trapped buyers"],
      ["SOL 15m direction", "Profitable wallets entered before oracle drift", "Early entries won"]
    ],
    checklist: [
      ["Price move", "Has the market already moved more than 15c recently?"],
      ["Exit liquidity", "Can you exit without giving back most of your edge?"],
      ["Smart wallets", "Are strong wallets still entering, or are they selling into momentum?"]
    ],
    ranks: ["Entry was too late", "Exit window was too short", "Liquidity was too thin", "Thesis was copied from price movement"]
  },
  politics: {
    label: "Narrative overreaction",
    copy: "This looks like a slower information market where prices can overreact to headlines. Profitable traders often wait for confirmation or buy against exaggerated moves.",
    score: 64,
    similar: 146,
    profitableRate: "57%",
    risk: "Medium",
    winnerEntry: 49,
    loserEntry: 69,
    insights: [
      ["Profitable pattern", "Entered after the first headline cooled and liquidity normalized."],
      ["Losing pattern", "Chased the first move without checking whether the underlying event changed."],
      ["Key question", "Is this a real probability update or just a temporary attention spike?"]
    ],
    analogs: [
      ["Election winner", "Polling headline moved odds 18c", "Partial reversion followed"],
      ["Cabinet nomination", "Rumor-led spike before official confirmation", "Late buyers lost"],
      ["Primary race", "Sustained volume after price move", "Momentum held"]
    ],
    checklist: [
      ["Source quality", "Is the catalyst official, repeated, and material?"],
      ["Reversion risk", "Did similar headline spikes reverse within 24 hours?"],
      ["Category skill", "Do you have a track record in this category?"]
    ],
    ranks: ["Headline was over-weighted", "Entry was not patient enough", "No exit rule", "Position size was too aggressive"]
  },
  sports: {
    label: "Event-timing risk",
    copy: "Sports markets often punish traders who enter after public line movement. The edge depends on timing, injury/news quality, and whether market liquidity allows a clean exit.",
    score: 52,
    similar: 98,
    profitableRate: "49%",
    risk: "Medium",
    winnerEntry: 46,
    loserEntry: 66,
    insights: [
      ["Profitable pattern", "Entered before public news hit the price or exited before game volatility."],
      ["Losing pattern", "Bought after odds moved but before liquidity improved."],
      ["Key question", "Do you know something the market has not priced, or are you reacting to public movement?"]
    ],
    analogs: [
      ["NBA moneyline-style market", "Injury rumor moved odds 14c", "Mixed outcome"],
      ["Tennis match market", "Steam move before start", "Late buyers had poor exits"],
      ["NHL game market", "Lower liquidity amplified slippage", "Small edge vanished"]
    ],
    checklist: [
      ["News timing", "Was the latest catalyst already absorbed by odds movement?"],
      ["Slippage", "Would your entry and exit prices still leave enough upside?"],
      ["Game state", "Are you entering before or during a volatility window?"]
    ],
    ranks: ["Public news was already priced", "Slippage was ignored", "Exit plan was weak", "Category edge was low"]
  },
  general: {
    label: "Unclear edge",
    copy: "The product cannot see a strong historical edge from this setup. Similar trades were highly sensitive to entry price, liquidity, and whether the trader had category-specific skill.",
    score: 55,
    similar: 123,
    profitableRate: "51%",
    risk: "Medium",
    winnerEntry: 47,
    loserEntry: 68,
    insights: [
      ["Profitable pattern", "Waited for better entry or clear confirmation."],
      ["Losing pattern", "Entered without a defined reason the market was mispriced."],
      ["Key question", "What would make you exit if the market moved against you?"]
    ],
    analogs: [
      ["News market", "Moderate odds move with uncertain catalyst", "Mixed outcome"],
      ["Culture market", "High attention but shallow liquidity", "Late buyers underperformed"],
      ["Macro market", "Slow grind after early price move", "Patient entries did better"]
    ],
    checklist: [
      ["Thesis", "Can you state why the current odds are wrong?"],
      ["Sample", "Do similar markets show a repeatable pattern?"],
      ["Risk", "What loss would prove this trade is not working?"]
    ],
    ranks: ["No clear edge", "Entry was not benchmarked", "Liquidity risk", "Exit plan missing"]
  }
};

const profiles = {
  all: {
    archetype: "Late momentum buyer",
    copy: "This profile often enters after a visible move has already happened. The trader is directionally right more often than realized PnL suggests, but late entries compress upside and increase reversal risk.",
    pnl: "-$1,842",
    win: "46%",
    leak: "Entry timing",
    losses: [["Late entries", 42], ["Weak exits", 24], ["Low liquidity", 19], ["Bad thesis", 15]],
    rules: [
      ["Entry rule", "Do not enter after a 20c move unless volume is still expanding."],
      ["Exit rule", "Pre-commit an exit when the trade reaches 80c or thesis confirmation fails."],
      ["Sizing rule", "Cut size by 50% in markets with thin liquidity or short time remaining."]
    ]
  },
  crypto: {
    archetype: "Short-window chaser",
    copy: "This profile is most vulnerable in crypto 5m/15m markets, where odds update faster than the trader reacts. Losses cluster around late entries and poor exit liquidity.",
    pnl: "-$2,416",
    win: "43%",
    leak: "Chasing spikes",
    losses: [["Late entries", 51], ["Exit liquidity", 23], ["Overtrading", 17], ["Bad thesis", 9]],
    rules: [
      ["Cooldown rule", "Wait at least one full candle after a large odds move before entering."],
      ["Liquidity rule", "Avoid entries where the spread erases more than 20% of expected upside."],
      ["Frequency rule", "Limit short-duration trades to setups with a written catalyst."]
    ]
  },
  politics: {
    archetype: "Headline-reactive trader",
    copy: "This profile reacts quickly to news but sometimes overpays for headlines that reverse. Performance improves when entries are delayed until confirmation or liquidity stabilizes.",
    pnl: "$684",
    win: "54%",
    leak: "Headline risk",
    losses: [["Overreaction", 34], ["No confirmation", 27], ["Weak exits", 21], ["Sizing", 18]],
    rules: [
      ["Confirmation rule", "Require a primary source or repeated reporting before entering headline moves."],
      ["Reversion rule", "Avoid buying the first spike unless similar markets held the move."],
      ["Specialization rule", "Lean into politics, but separate durable catalysts from attention spikes."]
    ]
  },
  sports: {
    archetype: "Event-timing trader",
    copy: "This profile has reasonable thesis quality but loses edge around public news, pre-game steam, and thin markets where slippage hurts entries and exits.",
    pnl: "-$736",
    win: "48%",
    leak: "Slippage",
    losses: [["Slippage", 31], ["Late news", 29], ["Weak exits", 22], ["Bad thesis", 18]],
    rules: [
      ["Spread rule", "Skip markets where spread plus slippage makes the payoff unattractive."],
      ["News rule", "Only trade injury/news moves when the source arrives before the odds move."],
      ["Exit rule", "Do not hold through event volatility without a reason."]
    ]
  }
};

const navTabs = document.querySelectorAll(".nav-tab");
const views = document.querySelectorAll(".view");

async function loadHistoricCases() {
  const grid = document.querySelector("#historic-grid");
  try {
    const response = await fetch('historic_cases.json');
    const cases = await response.json();
    
    grid.innerHTML = cases.map(c => `
      <div class="historic-card">
        <div>
          <span class="historic-diagnosis">${c.diagnosis}</span>
          <h4>${c.question}</h4>
          <div class="historic-info">
            <span>${c.category}</span>
            <span>Resolved: ${c.end_date}</span>
          </div>
          <div class="mini-chart">
            ${c.trade_sample.map(t => `<div class="chart-bar" style="height: ${t.p * 100}%" title="Price: ${t.p}, Vol: $${t.v}"></div>`).join("")}
          </div>
        </div>
        <div class="historic-stats">
          <strong>${c.pivotal_price}</strong>
          <span>Final Price</span>
          <br>
          <strong>${c.volume}</strong>
          <span>Total Vol</span>
        </div>
      </div>
    `).join("");
    
    animateList("#historic-grid");
  } catch (e) {
    grid.innerHTML = '<p class="subtle">Archive unavailable. Run analysis script.</p>';
  }
}

navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.view;
    navTabs.forEach((item) => item.classList.toggle("active", item === tab));
    views.forEach((view) => view.classList.toggle("active", view.id === `${target}-view`));
    
    if (target === "case") {
      loadHistoricCases();
      animateList("#case-view .insight-list");
    }
  });
});

function getScenario(title) {
  const value = title.toLowerCase();
  if (value.includes("btc") || value.includes("bitcoin") || value.includes("eth") || value.includes("crypto")) return scenarios.crypto;
  if (value.includes("election") || value.includes("trump") || value.includes("president") || value.includes("politic")) return scenarios.politics;
  if (value.includes("nba") || value.includes("nfl") || value.includes("tennis") || value.includes("game")) return scenarios.sports;
  return scenarios.general;
}

function tuneScenario(base, odds, time) {
  const tuned = structuredClone(base);
  const oddsNumber = Number(odds);
  if (oddsNumber >= 75) {
    tuned.label = "Expensive late entry";
    tuned.score = Math.max(28, tuned.score - 12);
    tuned.risk = "High";
    tuned.copy = "The odds are already expensive. Historically, this type of entry leaves little room for error unless the trader has strong evidence the market is still underpricing the outcome.";
  } else if (oddsNumber <= 45) {
    tuned.label = "Early contrarian setup";
    tuned.score = Math.min(78, tuned.score + 14);
    tuned.risk = "Medium";
    tuned.copy = "This is closer to the entry range where profitable traders often appear, but the trade still needs a clear catalyst and enough liquidity to exit.";
  }
  if (time === "short") {
    tuned.score = Math.max(24, tuned.score - 8);
    tuned.copy += " Short time remaining raises execution risk.";
  }
  return tuned;
}

function animateValue(element, start, end, duration) {
  if (start === end) {
    element.textContent = end;
    return;
  }
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    element.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.textContent = end;
    }
  };
  window.requestAnimationFrame(step);
}

function animateList(containerSelector) {
  const items = document.querySelectorAll(`${containerSelector} > *`);
  items.forEach((item, index) => {
    item.style.animationDelay = `${index * 0.05}s`;
    item.classList.add("visible");
  });
}

function withShimmer(elementOrSelector, action) {
  const elements = typeof elementOrSelector === "string" 
    ? document.querySelectorAll(elementOrSelector) 
    : [elementOrSelector];
  
  elements.forEach(el => el.classList.add("shimmer"));
  
  setTimeout(() => {
    action();
    elements.forEach(el => el.classList.remove("shimmer"));
  }, 400); // 400ms simulate processing
}

function renderTrade(data) {
  const mainPanel = document.querySelector(".diagnosis-panel");
  
  withShimmer([mainPanel, document.querySelector(".compare-bars")], () => {
    document.querySelector("#setup-label").textContent = data.label;
    document.querySelector("#setup-copy").textContent = data.copy;
    
    // Score ring update with animation and dynamic color
    const scoreElement = document.querySelector("#setup-score");
    const currentScore = parseInt(scoreElement.textContent) || 0;
    animateValue(scoreElement, currentScore, data.score, 800);
    
    const ring = document.querySelector("#score-ring");
    ring.style.setProperty("--score", data.score);
    
    let scoreColor = "var(--red)";
    if (data.score >= 70) {
      scoreColor = "var(--green)";
    } else if (data.score >= 45) {
      scoreColor = "var(--yellow)";
    }
    ring.style.setProperty("--score-color", scoreColor);

    document.querySelector("#similar-count").textContent = data.similar;
    document.querySelector("#resolved-rate").textContent = data.profitableRate;
    
    const riskLabel = document.querySelector("#risk-label");
    riskLabel.textContent = data.risk;
    riskLabel.style.color = data.risk === "High" ? "var(--red)" : (data.risk === "Medium" ? "var(--yellow)" : "var(--green)");

    document.querySelector("#winner-entry").textContent = `Median entry: ${data.winnerEntry}¢`;
    document.querySelector("#loser-entry").textContent = `Median entry: ${data.loserEntry}¢`;
    
    const winnerBar = document.querySelector("#winner-bar");
    const loserBar = document.querySelector("#loser-bar");
    
    winnerBar.style.width = "0%";
    loserBar.style.width = "0%";
    
    setTimeout(() => {
      winnerBar.style.width = `${data.winnerEntry}%`;
      loserBar.style.width = `${data.loserEntry}%`;
    }, 50);

    document.querySelector("#trade-insights").innerHTML = data.insights
      .map(([label, text]) => `<li><strong>${label}:</strong> ${text}</li>`)
      .join("");
    animateList("#trade-insights");

    document.querySelector("#analog-table").innerHTML = data.analogs
      .map(([type, pattern, outcome]) => `<tr><td><strong>${type}</strong></td><td>${pattern}</td><td>${outcome}</td></tr>`)
      .join("");

    document.querySelector("#checklist").innerHTML = data.checklist
      .map(([label, text]) => `<li><strong>${label}:</strong> ${text}</li>`)
      .join("");
    animateList("#checklist");

    document.querySelector("#rank-list").innerHTML = data.ranks
      .map((text, index) => `<div class="rank-item"><span class="rank-number">${index + 1}</span><span>${text}</span></div>`)
      .join("");
    animateList("#rank-list");
  });
}

function renderProfile(data) {
  const profileSummary = document.querySelector(".profile-summary");
  
  withShimmer(profileSummary, () => {
    document.querySelector("#archetype").textContent = data.archetype;
    document.querySelector("#archetype-copy").textContent = data.copy;
    
    const pnlElement = document.querySelector("#profile-pnl");
    pnlElement.textContent = data.pnl;
    pnlElement.style.color = data.pnl.startsWith("-") ? "var(--red)" : "var(--green)";
    
    document.querySelector("#profile-win").textContent = data.win;
    document.querySelector("#profile-leak").textContent = data.leak;

    const lossStack = document.querySelector("#loss-stack");
    lossStack.innerHTML = data.losses
      .map(([label, value]) => `
        <div class="loss-row">
          <span>${label}</span>
          <div class="loss-track"><div class="loss-fill" style="width: 0%"></div></div>
          <strong>${value}%</strong>
        </div>
      `)
      .join("");
    animateList("#loss-stack");
      
    // Animate loss stack bars
    setTimeout(() => {
      const fills = lossStack.querySelectorAll(".loss-fill");
      data.losses.forEach(([_, value], idx) => {
        if (fills[idx]) fills[idx].style.width = `${value}%`;
      });
    }, 450); // After shimmer and fade in

    document.querySelector("#personal-rules").innerHTML = data.rules
      .map(([label, text]) => `<li><strong>${label}:</strong> ${text}</li>`)
      .join("");
    animateList("#personal-rules");
  });
}

async function loadSignals() {
  const list = document.querySelector("#signals-list");
  try {
    const response = await fetch('latest_signals.json');
    const signals = await response.json();
    
    list.innerHTML = signals.map(sig => `
      <div class="signal-card">
        <strong>${sig.question}</strong>
        <div class="signal-meta">
          <span class="signal-volume">$${(sig.volume / 1000000).toFixed(1)}M Vol</span>
          <span>${sig.category}</span>
        </div>
      </div>
    `).join("");
    
    animateList("#signals-list");
  } catch (e) {
    list.innerHTML = '<p class="subtle">Data feed unavailable. Run analysis script.</p>';
  }
}

document.querySelector("#trade-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#market-input").value;
  const odds = document.querySelector("#odds-input").value;
  const time = document.querySelector("#time-input").value;
  renderTrade(tuneScenario(getScenario(title), odds, time));
});

document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const focus = document.querySelector("#focus-input").value;
  renderProfile(profiles[focus] || profiles.all);
});

document.querySelectorAll(".feedback-options button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".feedback-options button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    document.querySelector("#feedback-note").textContent = `Feedback captured: "${button.textContent}". Future model versions would use this as labeled loss-attribution data.`;
  });
});

renderTrade(tuneScenario(scenarios.crypto, 72, "medium"));
renderProfile(profiles.all);
loadSignals();
