import duckdb
import json

def generate_search_index():
    MARKETS_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"
    print("--- Generating Comprehensive Search Index ---")
    
    con = duckdb.connect()
    
    try:
        # Extract the top 3,000 markets by volume for the autocomplete index
        print("Extracting top 3,000 markets...")
        search_index = con.execute(f"""
            SELECT id, question, volume, event_title as category, end_date
            FROM read_parquet('{MARKETS_URL}')
            WHERE question IS NOT NULL AND volume > 1000
            ORDER BY volume DESC
            LIMIT 3000
        """).df()
        
        index_data = []
        for _, row in search_index.iterrows():
            index_data.append({
                "id": str(row['id']),
                "q": row['question'],
                "v": f"${(row['volume']/1000000):.1f}M" if row['volume'] > 1000000 else f"${int(row['volume']/1000)}K",
                "c": row['category'] if row['category'] else "General",
                "d": row['end_date'].strftime('%Y-%m-%d') if hasattr(row['end_date'], 'strftime') else str(row['end_date'])
            })
            
        with open('search_index.json', 'w') as f:
            json.dump(index_data, f, indent=2)
            
        print(f"✅ Search index created with {len(index_data)} entries.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    generate_search_index()
