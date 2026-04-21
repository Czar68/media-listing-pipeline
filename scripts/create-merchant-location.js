require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ebayClient = require('../api/ebayClient');

async function createMerchantLocation() {
  const baseUrl = 'https://api.sandbox.ebay.com/sell/inventory/v1';
  
  const locationBody = {
    merchantLocationKey: "default-location",
    location: {
      address: {
        addressLine1: "123 Test St",
        city: "Cincinnati",
        stateOrProvince: "OH",
        postalCode: "45201",
        country: "US"
      }
    }
  };

  try {
    console.log('Creating merchant location...');
    console.log('Payload:', JSON.stringify(locationBody, null, 2));
    
    const response = await ebayClient.request({
      method: 'POST',
      url: `${baseUrl}/location`,
      body: locationBody,
    });
    
    console.log('Merchant location created successfully:');
    console.log(JSON.stringify(response, null, 2));
  } catch (err) {
    console.error('Error creating merchant location:', err.message);
    if (err.context?.bodyPreview) {
      console.error('Error body:', err.context.bodyPreview);
    }
  }
}

createMerchantLocation();
