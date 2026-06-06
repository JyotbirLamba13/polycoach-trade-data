import duckdb
import json
from datetime import datetime

def generate_historic_case_studies():
    MARKETS_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"
    TRADES_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/trades.parquet"

    print("--- Generating Historic Case Studies (Wayback Machine) ---")
    
    con = duckdb.connect()
    
    try:
        # Step 1: Find 3 high-volume closed markets with interesting volatility
        print("Selecting pivotal historical markets...")
        pivotal_markets = con.execute(f"""
            SELECT id, question, volume, end_date, event_title as category
            FROM read_parquet('{MARKETS_URL}')
            WHERE closed = 1 AND volume > 10000000
            ORDER BY volume DESC
            LIMIT 5
        """).df()
        
        case_studies = []
        
        for _, m in pivotal_markets.iterrows():
            print(f"Processing market: {m['question'][:50]}...")
            
            # Step 2: Get trade distribution/volatility for this market
            # We'll take a sample of trades to visualize the 'pivotal' moment (near the end)
            trades = con.execute(f"""
                SELECT price, usd_amount, timestamp
                FROM read_parquet('{TRADES_URL}')
                WHERE market_id = '{m['id']}'
                ORDER BY timestamp DESC
                LIMIT 100
            """).df()
            
            if trades.empty: continue
            
            # Simple logic to determine a 'lesson' from the history
            # If price was high and dropped near the end, or vice versa
            start_price = trades['price'].iloc[-1]
            end_price = trades['price'].iloc[0]
            
            diagnosis = "Stable settlement"
            if abs(end_price - start_price) > 0.3:
                diagnosis = "Late-stage volatility squeeze"
            elif end_price < 0.2 and start_price > 0.5:
                diagnosis = "Thesis collapse/Black swan"
            elif end_price > 0.8 and start_price < 0.4:
                diagnosis = "Narrative breakout"

            case_studies.append({
                "id": m['id'],
                "question": m['question'],
                "category": m['category'] if m['category'] else "Politics",
                "volume": f"${(m['volume']/1000000):.1f}M",
                "end_date": m['end_date'].strftime('%Y-%m-%d') if hasattr(m['end_date'], 'strftime') else str(m['end_date']),
                "diagnosis": diagnosis,
                "pivotal_price": f"{int(end_price*100)}¢",
                "trade_sample": [
                    {"p": round(t['price'], 2), "v": round(t['usd_amount'], 2), "t": datetime.fromtimestamp(t['timestamp']).strftime('%H:%M')}
                    for _, t in trades.head(5).iterrows()
                ]
            })
            
        with open('historic_cases.json', 'w') as f:
            json.dump(case_studies, f, indent=2)
            
        print(f"✅ Generated {len(case_studies)} historic case studies in historic_cases.json")
        
    except Exception as e:
        print(f"❌ Error generating historic cases: {e}")

if __name__ == "__main__":
    generate_historic_case_studies()
