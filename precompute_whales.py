#!/usr/bin/env python3
"""
Precompute REAL winners/losers (with real wallets + PnL) per market from the
Polymarket users.parquet (23GB) on HuggingFace, via duckdb HTTP range reads.

PnL model (YES-token unified perspective, per resolved market):
  net_tokens = sum(buy tokens) - sum(sell tokens)
  net_usd    = sum(sell usd)   - sum(buy usd)        # cash from trading
  PnL        = net_usd + net_tokens * yes_resolution_price
  invested   = sum(buy usd)                            # gross capital deployed

Outputs whales_real.json: { market_id: {winners:[...], losers:[...]} }
Each trade row: addr, side(YES/NO), entry(¢), exit(¢), ret(%), invested, pnl, held, trades.

Usage:
  python3 precompute_whales.py            # top 500 resolved markets by volume
  python3 precompute_whales.py 1500       # top 1500
  python3 precompute_whales.py all        # every resolved market (heavy)
"""
import duckdb, json, sys, os, ast, time

ROOT = os.path.dirname(os.path.abspath(__file__))
# trades.parquet prunes by market_id (fast); users.parquet is user-sorted (full scan, slow)
T = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/trades.parquet"
OUT = os.path.join(ROOT, "whales_real.json")

def yes_price(m):
    try:
        return float(ast.literal_eval(m["outcome_prices"])[0])
    except Exception:
        return None

def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "500"
    markets = json.load(open(os.path.join(ROOT, "markets_real.json")))
    resolved = [m for m in markets if m.get("closed") == 1 and yes_price(m) is not None]
    resolved.sort(key=lambda m: m.get("volume") or 0, reverse=True)
    if arg != "all":
        resolved = resolved[:int(arg)]
    ids = {m["id"]: yes_price(m) for m in resolved}
    print(f"Precomputing real whales for {len(ids)} resolved markets…", flush=True)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET temp_directory='/tmp/duckdb_spill';")  # keep spill out of the repo
    # market_id -> yes_price mapping table
    vals = ",".join(f"('{mid}',{yp})" for mid, yp in ids.items())
    con.execute(f"CREATE TEMP TABLE yp(market_id VARCHAR, yes DOUBLE);")
    con.execute(f"INSERT INTO yp VALUES {vals};")

    # filter via the yp temp table (semi-join) -- avoids a huge IN-list string
    t0 = time.time()
    # Read filtered trades once; split each trade into its maker & taker as per-user rows.
    # direction is 'BUY'/'SELL'; buy = acquiring the (YES-unified) token.
    q = f"""
    WITH base AS (
      SELECT market_id, maker, taker, maker_direction AS md, taker_direction AS td,
             usd_amount, token_amount, timestamp
      FROM read_parquet('{T}') WHERE market_id IN (SELECT market_id FROM yp)
    ),
    u AS (
      SELECT market_id, maker AS address, md AS dir, usd_amount, token_amount, timestamp FROM base
      UNION ALL
      SELECT market_id, taker AS address, td AS dir, usd_amount, token_amount, timestamp FROM base
    ),
    agg AS (
      SELECT market_id, address,
        sum(CASE WHEN lower(dir) LIKE 'b%' THEN token_amount ELSE -token_amount END) AS net_tok,
        sum(CASE WHEN lower(dir) LIKE 'b%' THEN -usd_amount ELSE usd_amount END)      AS net_usd,
        sum(usd_amount) AS gross_usd,
        count(*) AS trades, min(timestamp) AS t0, max(timestamp) AS t1
      FROM u GROUP BY market_id, address
    ),
    pnl AS (
      SELECT a.*, (a.net_usd + a.net_tok * j.yes) AS pnl
      FROM agg a JOIN yp j USING (market_id) WHERE a.gross_usd > 1000
    ),
    ranked AS (
      SELECT *,
        row_number() OVER (PARTITION BY market_id ORDER BY pnl DESC) AS rk_win,
        row_number() OVER (PARTITION BY market_id ORDER BY pnl ASC)  AS rk_los
      FROM pnl
    )
    SELECT market_id, address, gross_usd, pnl, net_tok, trades, t0, t1,
           (rk_win<=5) AS is_win, (rk_los<=5) AS is_los
    FROM ranked WHERE rk_win<=5 OR rk_los<=5
    """
    rows = con.execute(q).fetchall()
    print(f"  query returned {len(rows)} rows in {time.time()-t0:.0f}s", flush=True)
    # per-market summary stats: total trades + real price high/low (for the summary panel)
    stats = con.execute(f"""SELECT market_id, count(*), min(price), max(price)
        FROM read_parquet('{T}') WHERE market_id IN (SELECT market_id FROM yp) GROUP BY market_id""").fetchall()
    tc = {r[0]: {"trades": int(r[1]), "lo": r[2], "hi": r[3]} for r in stats}

    def ts_days(a, b):
        # timestamps are unix (sec or ms)
        if a is None or b is None: return 0
        d = b - a
        if d > 4e10: d /= 1000  # ms -> s
        return max(0, int(d // 86400))

    def fmt_money(n):
        n = abs(n)
        if n >= 1e9: return f"${n/1e9:.2f}B"
        if n >= 1e6: return f"${n/1e6:.2f}M"
        if n >= 1e3: return f"${n/1e3:.0f}K"
        return f"${int(n)}"

    out = {}
    for (mid, addr, gross_usd, pnl, net_tok, trades, t0_, t1_, is_win, is_los) in rows:
        rec = out.setdefault(mid, {"winners": [], "losers": []})
        # Side = net directional exposure (positive token balance = net long YES)
        side = "YES" if (net_tok or 0) >= 0 else "NO"
        item = {
            "addr": addr, "side": side,
            "traded": fmt_money(gross_usd),
            "pnl": ("+" if pnl >= 0 else "-") + fmt_money(pnl),
            "held": f"{ts_days(t0_, t1_)}d",
            "trades": int(trades),
        }
        if is_win: rec["winners"].append((pnl, item))
        if is_los: rec["losers"].append((pnl, item))

    # sort + strip sort keys
    clean = {}
    for mid, rec in out.items():
        w = [i for _, i in sorted(rec["winners"], key=lambda x: -x[0])][:5]
        l = [i for _, i in sorted(rec["losers"], key=lambda x: x[0])][:5]
        s = tc.get(mid, {})
        clean[mid] = {
            "winners": w, "losers": l,
            "trades": s.get("trades", 0),
            "lo": round((s.get("lo") or 0) * 100),
            "hi": round((s.get("hi") or 0) * 100),
        }

    json.dump(clean, open(OUT, "w"), indent=0)
    print(f"✓ Wrote {OUT}: {len(clean)} markets with real whales", flush=True)

if __name__ == "__main__":
    main()
