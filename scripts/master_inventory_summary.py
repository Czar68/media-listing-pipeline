import os
import json
from sqlalchemy import create_engine, text

# Setup DB connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:pipeline_secret@localhost:5433/media_pipeline")

DRAFTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "drafts"))

def generate_summary():
    total_discs = 0
    projected_revenue = 0.0
    projected_profit = 0.0
    high_value_count = 0
    volume_play_count = 0
    
    # 1. Query market_values DB for scanned count
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM market_values")).fetchone()
            if result:
                total_discs = result[0]
    except Exception as e:
        print(f" [!] DB Warning: {e}")
        
    # 2. Parse drafts for projections
    draft_count = 0
    if os.path.exists(DRAFTS_DIR):
        for filename in os.listdir(DRAFTS_DIR):
            if filename.endswith(".json"):
                draft_count += 1
                filepath = os.path.join(DRAFTS_DIR, filename)
                with open(filepath, "r") as f:
                    try:
                        draft = json.load(f)
                        financials = draft.get("financials", {})
                        listing_price = financials.get("listing_price", 0.0)
                        net_profit = financials.get("net_profit", 0.0)
                        
                        projected_revenue += listing_price
                        projected_profit += net_profit
                        
                        if listing_price > 15.0:
                            high_value_count += 1
                        if listing_price < 10.0:
                            volume_play_count += 1
                    except Exception:
                        pass
                        
    # If DB count is less than draft count, use draft count
    total_discs = max(total_discs, draft_count)

    print("=== PORTFOLIO PROJECTION ===")
    print(f"Total Discs Scanned : {total_discs}")
    print(f"Projected Revenue   : ${projected_revenue:.2f}")
    print(f"Projected Net Profit: ${projected_profit:.2f}")
    print(f"High Value Count (>$15)   : {high_value_count}")
    print(f"Volume Play Count (<$10)  : {volume_play_count}")

if __name__ == "__main__":
    generate_summary()
