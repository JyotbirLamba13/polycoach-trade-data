import duckdb
import json
from datetime import datetime

def generate_trending_signals():
    MARKETS_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"

    print("--- Generating Trending Signals from Markets Data ---")
    
    con = duckdb.connect()
    
    try:
        # Fetch the top active markets by volume
        print("Fetching top active markets...")
        trending_markets = con.execute(f"""
            SELECT question, volume, event_title as category, created_at
            FROM read_parquet('{MARKETS_URL}')
            WHERE active = 1 AND volume IS NOT NULL
            ORDER BY volume DESC
            LIMIT 12
        """).df()
        
        # Convert to JSON-friendly format
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
            
        print(f"✅ Successfully generated {len(signals)} trending signals in latest_signals.json")
        
    except Exception as e:
        print(f"❌ Error generating signals: {e}")

if __name__ == "__main__":
    generate_trending_signals()
