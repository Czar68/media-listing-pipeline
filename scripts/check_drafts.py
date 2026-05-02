import os
import json
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
DRAFTS_DIR = os.path.join(ROOT_DIR, "data", "drafts")

def main():
    if not os.path.exists(DRAFTS_DIR):
        print(f" [!] Drafts directory not found at {DRAFTS_DIR}")
        sys.exit(1)

    print("\nDrafts Summary Table:")
    print("-" * 85)
    print(f"{'ID':<38} | {'Title':<20} | {'Profit':<8} | {'Status'}")
    print("-" * 85)

    files = [f for f in os.listdir(DRAFTS_DIR) if f.endswith(".json")]
    
    if not files:
        print("No drafts found.")
        return

    for filename in files:
        filepath = os.path.join(DRAFTS_DIR, filename)
        try:
            with open(filepath, "r") as f:
                draft = json.load(f)
                
            tx_id = draft.get("transaction_id", "Unknown")
            title = draft.get("title", "Unknown Title")
            # Truncate title for display if too long
            display_title = title[:17] + "..." if len(title) > 20 else title
            
            financials = draft.get("financials", {})
            profit = financials.get("net_profit", 0.0)
            status = draft.get("draft_status", "UNKNOWN")
            
            print(f"{tx_id:<38} | {display_title:<20} | ${profit:<7.2f} | {status}")
        except Exception as e:
            print(f"Error reading {filename}: {e}")

if __name__ == "__main__":
    main()
