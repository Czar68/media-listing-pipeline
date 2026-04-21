require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ebayClient = require('../api/ebayClient');

async function getMerchantLocations() {
  const baseUrl = 'https://api.sandbox.ebay.com/sell/inventory/v1';

  try {
    console.log('Getting existing merchant locations...');
    
    const response = await ebayClient.request({
      method: 'GET',
      url: `${baseUrl}/location`,
    });
    
    console.log('Existing merchant locations:');
    console.log(JSON.stringify(response, null, 2));
  } catch (err) {
    console.error('Error getting merchant locations:', err.message);
    if (err.context?.bodyPreview) {
      console.error('Error body:', err.context.bodyPreview);
    }
  }
}

getMerchantLocations();
