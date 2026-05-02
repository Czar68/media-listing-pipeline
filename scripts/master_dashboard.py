import os
import json

DRAFTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "drafts"))

def generate_dashboard():
    dashboard_lines = [
        "| SKU | Title | Suggested Price | Est. Profit | Market Demand |",
        "|-----|-------|-----------------|-------------|---------------|"
    ]
    
    if os.path.exists(DRAFTS_DIR):
        for filename in os.listdir(DRAFTS_DIR):
            if filename.endswith(".json"):
                filepath = os.path.join(DRAFTS_DIR, filename)
                with open(filepath, "r") as f:
                    try:
                        draft = json.load(f)
                        sku = draft.get("sku", "UNKNOWN")
                        title = draft.get("title", "Unknown Title")
                        financials = draft.get("financials", {})
                        
                        price = financials.get("listing_price", 0.0)
                        profit = financials.get("net_profit", 0.0)
                        
                        demand = "High" if price > 15.0 else "Low"
                        
                        dashboard_lines.append(f"| {sku} | {title} | ${price:.2f} | ${profit:.2f} | {demand} |")
                    except Exception as e:
                        pass
                        
    print("\n".join(dashboard_lines))
    
    dashboard_path = os.path.join(os.path.dirname(__file__), "..", "MASTER_DASHBOARD.md")
    with open(dashboard_path, "w") as f:
        f.write("# Master Inventory Dashboard\n\n")
        f.write("\n".join(dashboard_lines))
        f.write("\n")
        
    print(f"\n [v] Dashboard generated at {dashboard_path}")

if __name__ == "__main__":
    generate_dashboard()
