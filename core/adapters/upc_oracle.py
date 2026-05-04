import json
import os

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
HUB_MAPPINGS_PATH = os.path.join(CURRENT_DIR, "..", "..", "data", "hub_mappings.json")

def lookup_by_hub_code(hub_code: str) -> dict:
    """
    Simulates a database check to look up UPC/Title using a Hub Code.
    """
    print(f" [API] Searching Oracle for Hub Code: {hub_code}")
    
    try:
        with open(HUB_MAPPINGS_PATH, "r") as f:
            mappings = json.load(f)
    except FileNotFoundError:
        print(" [!] Oracle Database (hub_mappings.json) not found.")
        mappings = {}

    if hub_code in mappings:
        result = mappings[hub_code]
        result["confidence"] = 0.95
        return result
    
    return {
        "title": None,
        "artist": None,
        "publisher": None,
        "upc": None,
        "format": "Game Disc",
        "confidence": 0.0,
    }
