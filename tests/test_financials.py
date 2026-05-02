import unittest
import sys
import os

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
        self.assertEqual(result["shipping_cost"], 4.25)
        self.assertEqual(result["net_profit"], 2.95)

    def test_worker_loss_leader_flagging(self):
        """Test that a $5.00 listing is properly flagged for human review."""
        manifest = Manifest()
        manifest.financials["listing_price"] = 5.00
        manifest.financials["acquisition_cost"] = 1.00
        
        # Calculate expected profit manually for reference
        # Fees: (5.00 * 0.1495) + 0.30 = 0.7475 + 0.30 = 1.0475 -> 1.05
        # Shipping: 4.25
        # Acq: 1.00
        # Profit: 5.00 - 1.05 - 4.25 - 1.00 = -1.30
        
        processed_manifest = process_financials(manifest)
        
        self.assertEqual(processed_manifest.status, "flagged_for_review")
        self.assertTrue(processed_manifest.flags["human_review_required"])
        self.assertLess(processed_manifest.financials["net_profit"], 2.00)

if __name__ == "__main__":
    unittest.main()
