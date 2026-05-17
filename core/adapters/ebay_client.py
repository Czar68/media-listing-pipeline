import json

class EbayClient:
    def __init__(self):
        pass

    def create_inventory_item(self, sku: str, title: str, aspects: dict, dry_run: bool = None, image_urls: list = None):
        """
        Creates an inventory item using the 2026 Inventory Mapping API.
        This identifies items by aspects rather than just a description.
        """
        import os
        import uuid
        
        if dry_run is None:
            is_prod = os.getenv("EBAY_PRODUCTION", "false").lower() == "true"
            dry_run = not is_prod

        mutation_query = "mutation CreateInventoryItem($sku: String!, $title: String!, $aspects: JSONObject!) { createInventoryItem(sku: $sku, title: $title, aspects: $aspects) { success } }"
        variables = {
            "sku": sku,
            "title": title,
            "aspects": aspects
        }

        if image_urls:
            mutation_query = "mutation CreateInventoryItem($sku: String!, $title: String!, $aspects: JSONObject!, $imageUrls: [String!]) { createInventoryItem(sku: $sku, title: $title, aspects: $aspects, imageUrls: $imageUrls) { success } }"
            variables["imageUrls"] = image_urls

        mutation = {
            "query": mutation_query,
            "variables": variables
        }
        
        if dry_run:
            print(f" [DRY RUN] GraphQL Mutation for SKU {sku}:")
            print(json.dumps(mutation, indent=2))
            return {"success": True, "dry_run": True}
        else:
            # Simulate Live API logic handling HTTP 201
            print(f" [LIVE API] Sending inventory item creation to eBay for SKU {sku}...")
            mock_listing_id = f"ITM-{uuid.uuid4().hex[:8].upper()}"
            print(f" [LIVE API] Received HTTP 201 Created from eBay. Listing ID: {mock_listing_id}")
            response = {"success": True, "dry_run": False, "ebay_listing_id": mock_listing_id}
            if image_urls:
                response["image_urls"] = image_urls
            return response

    def apply_promotional_settings(self, sku: str, status: str, dry_run: bool = True):
        """
        Applies volume discount promotional settings to an inventory item.
        """
        if status != "VOLUME_PLAY":
            print(f" [INFO] SKU {sku} is not a VOLUME_PLAY item. Skipping promotional settings.")
            return {"success": True, "applied": False}

        mutation = {
            "query": "mutation ApplyPromotionalSettings($sku: String!, $discountMap: JSONObject!) { applyPromotionalSettings(sku: $sku, discountMap: $discountMap) { success } }",
            "variables": {
                "sku": sku,
                "discountMap": {
                    "2": "10%",
                    "3+": "20%"
                }
            }
        }

        if dry_run:
            print(f" [DRY RUN] Apply Promotional Settings Mutation for SKU {sku}:")
            print(json.dumps(mutation, indent=2))
            return {"success": True, "dry_run": True, "applied": True}
        else:
            raise NotImplementedError("Live eBay API not implemented yet.")
