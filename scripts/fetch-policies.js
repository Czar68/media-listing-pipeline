require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ebayClient = require('../api/ebayClient');

async function fetchPolicies() {
  const baseUrl = 'https://api.sandbox.ebay.com/sell/account/v1';

  try {
    const paymentRes = await ebayClient.request({
      method: 'GET',
      url: `${baseUrl}/payment_policy?marketplace_id=EBAY_US`,
    });
    console.log('PAYMENT POLICIES:');
    console.log(JSON.stringify(paymentRes, null, 2));

    const fulfillmentRes = await ebayClient.request({
      method: 'GET',
      url: `${baseUrl}/fulfillment_policy?marketplace_id=EBAY_US`,
    });
    console.log('\nFULFILLMENT POLICIES:');
    console.log(JSON.stringify(fulfillmentRes, null, 2));

    const returnRes = await ebayClient.request({
      method: 'GET',
      url: `${baseUrl}/return_policy?marketplace_id=EBAY_US`,
    });
    console.log('\nRETURN POLICIES:');
    console.log(JSON.stringify(returnRes, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchPolicies();
