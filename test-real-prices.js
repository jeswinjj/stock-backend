const { getLivePrice, getMultiplePrices } = require('./services/nseService');

async function testNSEFetch() {
    console.log('--- Testing NSE Real-Time Fetch ---');

    const symbols = ['RELIANCE', 'TCS', 'INFY'];
    console.log('Fetching batch prices for:', symbols);

    try {
        const prices = await getMultiplePrices(symbols);
        console.log('Fetched Prices:', prices);

        if (Object.keys(prices).length > 0) {
            console.log('✅ Real-time fetching working correctly!');
        } else {
            console.log('❌ No prices fetched. Check connectivity or symbols.');
        }
    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

testNSEFetch();
