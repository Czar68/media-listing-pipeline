import os
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:pipeline_secret@localhost:5433/media_pipeline")
engine = create_engine(DATABASE_URL)

class PricingOracle:
    def __init__(self):
        self.engine = engine

    def get_market_price(self, upc_or_title: str):
        """
        Queries the market_values table for the given upc (or title acting as upc).
        If the record is older than 7 days, or doesn't exist, it triggers a mock 'eBay Sold Search'
        and returns a mock updated price.
        """
        if not upc_or_title:
            return None
            
        try:
            with self.engine.connect() as conn:
                query = text("SELECT average_sold_price, last_updated FROM market_values WHERE upc = :upc LIMIT 1")
                result = conn.execute(query, {"upc": upc_or_title}).fetchone()
                
                if result:
                    price, last_updated = result
                    # Check if older than 7 days
                    if last_updated and (datetime.now() - last_updated) > timedelta(days=7):
                        print(f" [PricingOracle] Record for {upc_or_title} is stale. Triggering mock eBay Sold Search...")
                        return self._mock_ebay_sold_search(upc_or_title)
                    print(f" [PricingOracle] Found cached price for {upc_or_title}: {price}")
                    return float(price)
                else:
                    print(f" [PricingOracle] No record found for {upc_or_title}. Triggering mock eBay Sold Search...")
                    return self._mock_ebay_sold_search(upc_or_title)
        except Exception as e:
            print(f" [PricingOracle] DB Error: {e}")
            return None

    def _mock_ebay_sold_search(self, upc_or_title: str) -> float:
        """
        Mocks a live eBay search.
        """
        # Return a deterministic mock price based on length of upc/title
        mock_price = 12.99 + (len(str(upc_or_title)) * 0.50)
        print(f" [PricingOracle] Mock eBay Sold Search returned: {mock_price}")
        return float(mock_price)
