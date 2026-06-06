import duckdb
import json
from datetime import datetime

MARKETS_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"
TRADES_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/trades.parquet"

def get_connection():
    return duckdb.connect()

def generate_signals(con):
    print("\n--- Generating Live Trending Signals ---")
    try:
        trending_markets = con.execute(f"""
            SELECT question, volume, event_title as category, created_at
            FROM read_parquet('{MARKETS_URL}')
            WHERE active = 1 AND volume IS NOT NULL
            ORDER BY volume DESC
            LIMIT 10
        """).df()
        
        signals = []
        for _, row in trending_markets.iterrows():
            signals.append({
                "question": row['question'],
                "volume": round(row['volume'], 2),
                "category": row['category'] if row['category'] else "General",
                "created": row['created_at'].strftime('%Y-%m-%d') if hasattr(row['created_at'], 'strftime') else str(row['created_at'])
            })
        with open('latest_signals.json', 'w') as f:
            json.dump(signals, f, indent=2)
        print(f"✅ Generated {len(signals)} signals.")
    except Exception as e:
        print(f"❌ Signals error: {e}")

def generate_winning_trades(con):
    print("\n--- Analyzing Winning Trades ---")
    try:
        resolved_markets = con.execute(f"""
            SELECT id, question, volume
            FROM read_parquet('{MARKETS_URL}')
            WHERE closed = 1 AND volume > 10000000
            ORDER BY volume DESC
            LIMIT 5
        """).df()
        
        winners = []
        for _, m in resolved_markets.iterrows():
            early_buyers = con.execute(f"""
                SELECT taker as wallet, price, usd_amount, timestamp
                FROM read_parquet('{TRADES_URL}')
                WHERE market_id = '{m['id']}' AND price < 0.25 AND usd_amount > 2000
                ORDER BY usd_amount DESC LIMIT 4
            """).df()
            
            for _, b in early_buyers.iterrows():
                tokens = b['usd_amount'] / b['price']
                profit = (1.0 - b['price']) * tokens
                winners.append({
                    "market": m['question'],
                    "wallet": f"{b['wallet'][:6]}...{b['wallet'][-4:]}",
                    "entry_price": f"{int(b['price']*100)}¢",
                    "exit_price": "100¢",
                    "invested": f"${int(b['usd_amount']):,}",
                    "profit": f"${int(profit):,}",
                    "raw_profit": profit,
                    "date": datetime.fromtimestamp(b['timestamp']).strftime('%Y-%m-%d')
                })
        
        winners = sorted(winners, key=lambda x: x['raw_profit'], reverse=True)[:12]
        with open('winning_trades.json', 'w') as f:
            json.dump(winners, f, indent=2)
        print(f"✅ Generated {len(winners)} winning trades.")
    except Exception as e:
        print(f"❌ Winning trades error: {e}")

def generate_historic_cases(con):
    print("\n--- Generating Historic Case Studies ---")
    try:
        pivotal_markets = con.execute(f"""
            SELECT id, question, volume, end_date, event_title as category
            FROM read_parquet('{MARKETS_URL}')
            WHERE closed = 1 AND volume > 10000000
            ORDER BY volume DESC LIMIT 4
        """).df()
        
        case_studies = []
        for _, m in pivotal_markets.iterrows():
            trades = con.execute(f"SELECT price, usd_amount, timestamp FROM read_parquet('{TRADES_URL}') WHERE market_id = '{m['id']}' ORDER BY timestamp DESC LIMIT 20").df()
            if trades.empty: continue
            
            case_studies.append({
                "id": m['id'],
                "question": m['question'],
                "category": m['category'] if m['category'] else "Politics",
                "volume": f"${(m['volume']/1000000):.1f}M",
                "end_date": m['end_date'].strftime('%Y-%m-%d') if hasattr(m['end_date'], 'strftime') else str(m['end_date']),
                "diagnosis": "Pivotal Settlement Analysis",
                "pivotal_price": f"{int(trades['price'].iloc[0]*100)}¢",
                "trade_sample": [
                    {"p": round(t['price'], 2), "v": round(t['usd_amount'], 2)}
                    for _, t in trades.head(5).iterrows()
                ]
            })
        with open('historic_cases.json', 'w') as f:
            json.dump(case_studies, f, indent=2)
        print(f"✅ Generated {len(case_studies)} case studies.")
    except Exception as e:
        print(f"❌ Case studies error: {e}")

if __name__ == "__main__":
    connection = get_connection()
    generate_signals(connection)
    generate_winning_trades(connection)
    generate_historic_cases(connection)
    print("\n🚀 All analysis complete.")
