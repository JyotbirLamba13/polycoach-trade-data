import duckdb

def inspect_schema():
    MARKETS_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/markets.parquet"
    TRADES_URL = "https://huggingface.co/datasets/SII-WANGZJ/Polymarket_data/resolve/main/trades.parquet"
    
    con = duckdb.connect()
    
    print("--- Markets Schema ---")
    print(con.execute(f"DESCRIBE SELECT * FROM read_parquet('{MARKETS_URL}')").df())
    
    print("\n--- Trades Schema ---")
    print(con.execute(f"DESCRIBE SELECT * FROM read_parquet('{TRADES_URL}')").df())

if __name__ == "__main__":
    inspect_schema()
