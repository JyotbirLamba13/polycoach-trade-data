# PolyAlpha

Historical analysis of 13,500 Polymarket markets with wallet-level P&L computed from on-chain data: what profitable traders did differently, market by market.

**Live:** https://polycoach-trade-data.pages.dev

PolyAlpha started as PolyCoach, a product case study for a Polymarket trader intelligence platform.

The case study asks:

> How might we help losing Polymarket traders understand why they lose, learn from profitable traders on the same markets, and make better entry and exit decisions?

## Product Concept

Most Polymarket users do not lose because they lack raw data. They lose because they lack feedback loops:

- Was the entry too late?
- Did profitable traders behave differently on the same market?
- Did similar historical markets reward this setup?
- Was the user directionally wrong, or just poorly timed?
- What personal trading rule would have prevented the mistake?

PolyCoach turns public market/trade data into a decision-support experience.

## Prototype Features

- Trade setup analyzer from a market title or URL
- Historical similarity summary
- Winner vs loser behavior comparison
- Decision checklist before entering a trade
- Profile-level trade diagnosis
- Loss-attribution feedback loop
- Case study and trust guardrails

## Run Locally

This is a static app with no package install required.

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Portfolio Positioning

Suggested case study title:

> Why Did I Lose This Trade?

Suggested subtitle:

> Designing a Polymarket intelligence product that helps traders learn from profitable and losing behavior.

## Data

- Market metadata and trades come from the public [Polymarket_data](https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data) dataset on Hugging Face, queried with DuckDB.
- `extract_markets.py` and `precompute_whales.py` build the market and wallet files (`app_markets.json`, `whales_real.json`); `generate_pages.py` writes one static page per market under `markets/`.
- A GitHub Action (`.github/workflows/update_signals.yml`) reruns `remote_analysis.py` every 6 hours to refresh `latest_signals.json` and the search index.
