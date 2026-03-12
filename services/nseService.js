const axios = require('axios');

const BASE_URL = 'https://www.nseindia.com';
const QUOTE_API = `${BASE_URL}/api/quote-equity?symbol=`;

let cookies = '';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
};

/**
 * Initialize session with NSE India to get cookies
 */
async function initSession() {
    try {
        console.log('Initializing NSE Session...');
        const response = await axios.get(BASE_URL, {
            headers: HEADERS,
            timeout: 10000
        });

        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            cookies = setCookie.map(cookie => cookie.split(';')[0]).join('; ');
            console.log('NSE Session initialized successfully');
        } else {
            console.warn('NSE Session initialized but no cookies received');
        }
    } catch (err) {
        console.error('Failed to initialize NSE session:', err.message);
        // Sometimes the main page fails but we can still try to get cookies from any subpage
        try {
            const altResponse = await axios.get(`${BASE_URL}/get-quotes/equity?symbol=RELIANCE`, {
                headers: HEADERS,
                timeout: 10000
            });
            const altCookie = altResponse.headers['set-cookie'];
            if (altCookie) {
                cookies = altCookie.map(cookie => cookie.split(';')[0]).join('; ');
                console.log('NSE Session initialized successfully (Alternative)');
            }
        } catch (altErr) {
            console.error('Alternative session init failed:', altErr.message);
            throw new Error('NSE Session Initialization Failed');
        }
    }
}

/**
 * Fetch live price for a single NSE symbol
 * @param {string} symbol - NSE Stock Symbol (e.g., RELIANCE)
 */
async function getLivePriceData(symbol) {
    try {
        if (!cookies) await initSession();

        const url = `${QUOTE_API}${encodeURIComponent(symbol)}`;
        const response = await axios.get(url, {
            headers: {
                ...HEADERS,
                'Accept': '*/*',
                'Cookie': cookies,
                'Referer': `${BASE_URL}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
                'Host': 'www.nseindia.com',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 8000
        });

        const data = response.data;
        if (!data.priceInfo || !data.priceInfo.lastPrice) {
            console.error(`Invalid data structure from NSE for ${symbol}`);
            return null;
        }

        return {
            price: data.priceInfo.lastPrice,
            change: data.priceInfo.change || 0,
            changePercent: data.priceInfo.pChange || 0,
            lastUpdatedAt: new Date()
        };
    } catch (err) {
        console.error(`Error fetching NSE price for ${symbol}:`, err.message);

        // If 401/403, retry session initialization once
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            console.log('Session expired, re-initializing...');
            cookies = '';
            // We don't recurse here to prevent infinite loop, 
            // the next call will re-init.
        }
        return null;
    }
}

/**
 * Fetch live prices for multiple symbols sequentially with delay
 */
async function getMultiplePricesSequentially(symbols) {
    const results = {};
    const batchSize = 6;

    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        const responses = await Promise.all(
            batch.map(symbol => getLivePriceData(symbol))
        );

        responses.forEach((data, idx) => {
            if (data) results[batch[idx]] = data;
        });

        if (i + batchSize < symbols.length) {
            await new Promise(r => setTimeout(r, 400)); // throttle
        }
    }

    return results;
}

module.exports = {
    getLivePriceData,
    getMultiplePricesSequentially
};
