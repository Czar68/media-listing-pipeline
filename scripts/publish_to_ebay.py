import os
import sys
import json
import shutil
import argparse

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.adapters.ebay_client import EbayClient
from core.adapters.s3_client import S3Client

DRAFTS_DIR = os.path.join(ROOT_DIR, "data", "drafts")
PUBLISHED_DIR = os.path.join(ROOT_DIR, "data", "storage", "published")

os.makedirs(PUBLISHED_DIR, exist_ok=True)

def publish_drafts(limit: int):
    client = EbayClient()
    s3 = S3Client()
    published_count = 0
    
    if not os.path.exists(DRAFTS_DIR):
        print(f" [!] Drafts directory not found: {DRAFTS_DIR}")
        return

    for filename in os.listdir(DRAFTS_DIR):
        if not filename.endswith(".json"):
            continue
            
        if published_count >= limit:
            print(f" [*] Reached limit of {limit} publications. Stopping.")
            break
            
        filepath = os.path.join(DRAFTS_DIR, filename)
        
        try:
            with open(filepath, "r") as f:
                draft = json.load(f)
                
            if draft.get("draft_status") != "READY_TO_PUBLISH":
                continue
                
            sku = draft.get("sku", "UNKNOWN_SKU")
            title = draft.get("title", "Unknown Title")
            aspects = {"Brand": "Unknown"} # mock aspects
            
            image_paths = draft.get("source_manifest", {}).get("image_paths", [])
            image_urls = []
            for path in image_paths:
                # Remap /app/... paths to local filesystem equivalent
                local_path = path.replace("/app/", os.path.join(ROOT_DIR, "").replace("\\", "/") + "/").replace("//", "/")
                try:
                    url = s3.upload_image(local_path)
                    image_urls.append(url)
                except Exception:
                    pass
            
            print(f" [*] Processing draft: {filename} (SKU: {sku})")
            
            # Publish to eBay
            response = client.create_inventory_item(sku=sku, title=title, aspects=aspects, image_urls=image_urls)
            
            if response.get("success"):
                ebay_listing_id = response.get("ebay_listing_id")
                
                # If we are actually live, save the ID and move the file
                if not response.get("dry_run") and ebay_listing_id:
                    draft["ebay_listing_id"] = ebay_listing_id
                    draft["draft_status"] = "PUBLISHED"
                    
                    # Write updated draft back temporarily
                    with open(filepath, "w") as f:
                        json.dump(draft, f, indent=2)
                        
                    # Move to published dir
                    new_filepath = os.path.join(PUBLISHED_DIR, filename)
                    shutil.move(filepath, new_filepath)
                    print(f" [v] Successfully published and moved {filename} to {new_filepath}")
                    published_count += 1
                else:
                    print(f" [-] DRY RUN successful for {filename}. Not moving file.")
                    published_count += 1 # Count dry-runs towards limit as well
            else:
                print(f" [x] Failed to publish {filename}")
                
        except Exception as e:
            print(f" [!] Error processing {filename}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Publisher for eBay")
    parser.add_argument("--limit", type=int, default=5, help="Maximum number of drafts to publish (Safety Gate)")
    args = parser.parse_args()
    
    print(f" [*] Starting Live Publisher with limit={args.limit}")
    publish_drafts(args.limit)
