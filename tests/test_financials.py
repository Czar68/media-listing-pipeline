import unittest
import sys
import os
from unittest.mock import patch

# Ensure root is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ingestor.schema import Manifest
from core.financials.calculator import calculate_financials
from core.ai_broker.financial_worker import process_financials

class TestFinancials(unittest.TestCase):

    def test_calculator_logic(self):
        """Test the pure mathematical logic for a $10.00 listing with $1.00 acquisition."""
        listing_price = 10.00
        acquisition_cost = 1.00
        
        result = calculate_financials(listing_price, acquisition_cost)
        
        self.assertEqual(result["ebay_fees"], 1.80)
        self.assertEqual(result["shipping_cost"], 4.95)
        self.assertEqual(result["packaging_cost"], 0.25)
        self.assertEqual(result["net_profit"], 2.00)

    def test_worker_default_listing_flagging(self):
        """Empty manifest gets default listing price; oracle gap triggers human review."""
        manifest = Manifest()
        manifest.financials["listing_price"] = 5.00
        manifest.financials["acquisition_cost"] = 1.00

        processed_manifest = process_financials(manifest)

        self.assertEqual(processed_manifest.status, "flagged_for_review")
        self.assertTrue(processed_manifest.flags["human_review_required"])
        # Oracle uses default $9.99 listing; unit basis $1.00 acq + $0.25 pack → net $2.00 (>= $1.50 floor).
        # human_review_required remains True from pricing fallback → flagged_for_review.
        self.assertAlmostEqual(processed_manifest.financials["net_profit"], 2.00, places=2)

    @patch("core.ai_broker.financial_worker.PricingOracle")
    def test_worker_net_below_margin_floor_flags_review(self, mock_oracle_cls):
        """Oracle listing low enough that net_profit < $1.50 triggers flagged_for_review."""
        mock_oracle_cls.return_value.get_market_price.return_value = 9.0
        manifest = Manifest()
        manifest.identity["upc"] = "000000000000"
        processed = process_financials(manifest)
        self.assertLess(processed.financials["net_profit"], 1.50)
        self.assertEqual(processed.status, "flagged_for_review")
        self.assertTrue(processed.flags["human_review_required"])

if __name__ == "__main__":
    unittest.main()
