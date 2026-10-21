const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const StockMaster = require('../models/StockMaster');

/**
 * Maps standard resolution string to Yahoo Finance interval
 */
function mapResolutionToInterval(resolution) {
    const resUpper = (resolution || '1D').toUpperCase();
    switch (resUpper) {
        case '1':
        case '1M':
        case '1MIN':
            return '1m';
        case '5':
        case '5M':
        case '5MIN':
            return '5m';
        case '15':
        case '15M':
        case '15MIN':
            return '15m';
        case '30':
        case '30M':
        case '30MIN':
            return '30m';
        case '60':
        case '1H':
        case '60M':
            return '60m';
        case 'D':
        case '1D':
        case 'DAY':
            return '1d';
        case 'W':
        case '1W':
        case 'WEEK':
            return '1wk';
        case 'M':
        case '1MO':
        case 'MONTH':
            return '1mo';
        default:
            return '1d';
    }
}

/**
 * Calculates start date based on timeframe or 'from' timestamp
 */
function calculateStartDate(timeframe, from) {
    if (from) {
        const fromDate = new Date(typeof from === 'number' ? (from > 1e11 ? from : from * 1000) : from);
        if (!isNaN(fromDate.getTime())) {
            return fromDate;
        }
    }

    const now = new Date();
    const tfUpper = (timeframe || '1Y').toUpperCase();

    switch (tfUpper) {
        case '1D':
            return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        case '1W':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '1M':
            return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        case '3M':
            return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        case '6M':
            return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        case '1Y':
            return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        case '5Y':
            return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        case 'MAX':
            return new Date(2000, 0, 1);
        default:
            return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }
}

/**
 * Fetches historical OHLCV data for an NSE stock symbol
 * @param {string} symbol NSE ticker symbol (e.g., RELIANCE)
 * @param {string} resolution Chart resolution (1D, 1W, 1M, 5m, 15m, 60m)
 * @param {number|string|Date} from Start range
 * @param {number|string|Date} to End range
 */
async function getHistoricalOHLCV(symbol, resolution = '1D', from = null, to = null, timeframe = '1Y') {
    try {
        if (!symbol || typeof symbol !== 'string') {
            throw new Error('Symbol is required');
        }

        const cleanSymbol = symbol.trim().toUpperCase();
        const yahooSymbol = cleanSymbol.endsWith('.NS') ? cleanSymbol : `${cleanSymbol}.NS`;

        const interval = mapResolutionToInterval(resolution);
        const period1 = calculateStartDate(timeframe, from);
        const period2 = to ? new Date(typeof to === 'number' ? (to > 1e11 ? to : to * 1000) : to) : new Date();

        let result;
        try {
            result = await yahooFinance.chart(yahooSymbol, {
                period1,
                period2,
                interval
            });
        } catch (e) {
            // Try raw symbol without .NS suffix if .NS fetch fails
            result = await yahooFinance.chart(cleanSymbol, {
                period1,
                period2,
                interval
            });
        }

        if (!result || !result.quotes || result.quotes.length === 0) {
            return [];
        }

        // Clean, sanitize, and sort historical quotes chronologically
        const bars = result.quotes
            .filter(q => q && q.date && q.close !== null && !isNaN(q.close))
            .map(q => {
                const timestamp = new Date(q.date).getTime();
                const open = Number(q.open ?? q.close);
                const high = Number(q.high ?? Math.max(open, q.close));
                const low = Number(q.low ?? Math.min(open, q.close));
                const close = Number(q.close);
                const volume = Number(q.volume ?? 0);

                return {
                    time: Math.floor(timestamp / 1000), // UNIX timestamp in seconds
                    timestamp, // UNIX timestamp in ms
                    date: q.date,
                    open,
                    high,
                    low,
                    close,
                    volume
                };
            })
            .sort((a, b) => a.timestamp - b.timestamp);

        return bars;
    } catch (err) {
        console.error(`Error in getHistoricalOHLCV for ${symbol}:`, err.message);
        throw err;
    }
}

/**
 * Aggregates 1-minute OHLCV quotes into standard 3-minute candles aligned to NSE market session (09:15 - 15:30 IST)
 */
function aggregate1mTo3m(quotes) {
    if (!Array.isArray(quotes)) return [];
    const candles3m = [];
    let currentBucket = null;
    let bucketKey = null;

    for (const q of quotes) {
        if (!q || !q.date || isNaN(q.close)) continue;
        const d = new Date(q.date);
        // IST offset: +5:30 (5.5 * 3600 * 1000 ms)
        const istMs = d.getTime() + 5.5 * 3600 * 1000;
        const istDate = new Date(istMs);
        const dayStr = istDate.toISOString().slice(0, 10);
        const hours = istDate.getUTCHours();
        const mins = istDate.getUTCMinutes();
        
        // 9:15 AM IST is minute 555 from midnight, 3:30 PM is 930
        const totalMins = hours * 60 + mins;
        if (totalMins < 555 || totalMins >= 930) continue;

        const bucketIndex = Math.floor((totalMins - 555) / 3);
        const currentKey = dayStr + '_' + bucketIndex;

        const openVal = Number(q.open ?? q.close);
        const highVal = Number(q.high ?? Math.max(openVal, q.close));
        const lowVal = Number(q.low ?? Math.min(openVal, q.close));
        const closeVal = Number(q.close);
        const volVal = Number(q.volume || 0);

        if (bucketKey !== currentKey) {
            if (currentBucket) candles3m.push(currentBucket);
            bucketKey = currentKey;
            currentBucket = {
                day: dayStr,
                bucketIndex,
                date: q.date,
                timestamp: d.getTime(),
                time: Math.floor(d.getTime() / 1000),
                istTime: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
                open: openVal,
                high: highVal,
                low: lowVal,
                close: closeVal,
                volume: volVal
            };
        } else {
            currentBucket.high = Math.max(currentBucket.high, highVal);
            currentBucket.low = Math.min(currentBucket.low, lowVal);
            currentBucket.close = closeVal;
            currentBucket.volume += volVal;
        }
    }
    if (currentBucket) candles3m.push(currentBucket);
    return candles3m;
}

/**
 * Fetches 3-minute OHLCV intraday data for an NSE stock symbol
 * Uses parallel 7-day chunk requests to Yahoo Finance 1m chart API and aggregates into 3m candles
 */
async function getIntraday3mOHLCV(symbol, days = 30) {
    try {
        if (!symbol || typeof symbol !== 'string') {
            throw new Error('Symbol is required');
        }

        const cleanSymbol = symbol.trim().toUpperCase();
        const yahooSymbol = cleanSymbol.endsWith('.NS') ? cleanSymbol : `${cleanSymbol}.NS`;

        const now = Date.now();
        const chunkCount = Math.min(4, Math.ceil(days / 7));
        const promises = [];

        for (let i = chunkCount; i >= 1; i--) {
            const period1 = new Date(now - i * 7 * 86400000);
            const period2 = new Date(now - (i - 1) * 7 * 86400000);
            promises.push(
                yahooFinance.chart(yahooSymbol, { period1, period2, interval: '1m' })
                    .catch(() => yahooFinance.chart(cleanSymbol, { period1, period2, interval: '1m' }))
                    .catch(() => null)
            );
        }

        const results = await Promise.all(promises);
        const allQuotes = results
            .filter(Boolean)
            .flatMap(r => r.quotes || [])
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return aggregate1mTo3m(allQuotes);
    } catch (err) {
        console.error(`Error in getIntraday3mOHLCV for ${symbol}:`, err.message);
        throw err;
    }
}

module.exports = {
    getHistoricalOHLCV,
    getIntraday3mOHLCV,
    aggregate1mTo3m,
    mapResolutionToInterval
};

