#!/usr/bin/env python3
"""
Extract the top-N binary (Yes/No) Polymarket markets by volume from the
HuggingFace markets.parquet into:
  * markets_real.json  - full fields, used by generate_pages.py (server-side only)
  * app_markets.json   - slim fields (no token/condition ids), loaded by the SPA

Usage: python3 extract_markets.py [N]   (default 13500)
"""
import duckdb, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
M = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 13500

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute("SET temp_directory='/tmp/duckdb_spill';")

rows = con.execute(f"""
  SELECT id, question, slug, event_id, event_slug, event_title,
         closed, active, archived, outcome_prices, answer1, answer2,
         volume, condition_id, token1, token2,
         CAST(created_at AS VARCHAR) AS created_at,
         CAST(end_date  AS VARCHAR) AS end_date
  FROM read_parquet('{M}')
  WHERE answer1='Yes' AND answer2='No' AND volume > 0
  ORDER BY volume DESC
  LIMIT {N}
""").fetchall()
cols = [c[0] for c in con.description]
full = [dict(zip(cols, r)) for r in rows]
json.dump(full, open(os.path.join(ROOT, "markets_real.json"), "w"), default=str)

# slim index for the SPA (drop heavy token/condition ids the client never needs)
slim_keys = ["id", "question", "slug", "event_title", "closed", "active",
             "outcome_prices", "volume", "created_at", "end_date"]
slim = [{k: m[k] for k in slim_keys} for m in full]
json.dump(slim, open(os.path.join(ROOT, "app_markets.json"), "w"), default=str)

closed = sum(1 for m in full if m["closed"] == 1)
print(f"Wrote markets_real.json ({len(full)}) + app_markets.json (slim)")
print(f"  resolved: {closed} | open: {len(full)-closed}")
print(f"  markets_real.json: {os.path.getsize(ROOT+'/markets_real.json')//1024} KB"
      f" | app_markets.json: {os.path.getsize(ROOT+'/app_markets.json')//1024} KB")
