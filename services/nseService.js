const axios = require('axios');
const csv = require('csv-parser');
const { Readable } = require('stream');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const BASE_URL = 'https://www.nseindia.com';

/**
 * Fetch live price for a single NSE symbol
 * @param {string} symbol - NSE Stock Symbol (e.g., RELIANCE)
 */
async function getLivePriceData(symbol) {
    try {
        const cleanSymbol = symbol.trim().toUpperCase();
        const yahooSymbol = cleanSymbol.endsWith('.NS') ? cleanSymbol : `${cleanSymbol}.NS`;

        let result;
        try {
            result = await yahooFinance.quote(yahooSymbol);
        } catch (e) {
            // Try without .NS suffix if the first try fails
            result = await yahooFinance.quote(cleanSymbol);
        }

        if (!result) return null;

        return {
            price: result.regularMarketPrice,
            change: result.regularMarketChange || 0,
            changePercent: result.regularMarketChangePercent || 0,
            lastUpdatedAt: result.regularMarketTime || new Date()
        };
    } catch (err) {
        console.error(`Error fetching price for ${symbol}:`, err.message);
        return null;
    }
}

/**
 * Fetch live prices for multiple symbols sequentially with delay
 */
async function getMultiplePricesSequentially(symbols) {
    const results = {};
    if (!symbols || symbols.length === 0) return results;

    try {
        const yahooSymbols = symbols.map(s => {
            const clean = s.trim().toUpperCase();
            return clean.endsWith('.NS') ? clean : `${clean}.NS`;
        });

        const quotes = await yahooFinance.quote(yahooSymbols);
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

        quotesArray.forEach(quote => {
            if (quote) {
                const yahooSym = quote.symbol.toUpperCase();
                const origSym = yahooSym.endsWith('.NS') ? yahooSym.slice(0, -3) : yahooSym;

                results[origSym] = {
                    price: quote.regularMarketPrice,
                    change: quote.regularMarketChange || 0,
                    changePercent: quote.regularMarketChangePercent || 0,
                    lastUpdatedAt: quote.regularMarketTime || new Date()
                };
            }
        });

        const missingSymbols = symbols.filter(s => !results[s.trim().toUpperCase()]);
        for (const sym of missingSymbols) {
            const data = await getLivePriceData(sym);
            if (data) {
                results[sym.trim().toUpperCase()] = data;
            }
        }
    } catch (err) {
        console.error('Error fetching multiple prices:', err.message);
        for (const sym of symbols) {
            const data = await getLivePriceData(sym);
            if (data) {
                results[sym.trim().toUpperCase()] = data;
            }
        }
    }

    return results;
}

/**
 * Fetch all NSE equities from the official CSV list
 */
async function getAllNSEStocks() {
    const url = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';

    try {
        console.log(`Fetching from: ${url}`);
        const response = await axios.get(url);
        console.log(`Response status: ${response.status}`);
        console.log(`Response data type: ${typeof response.data}`);
        console.log(`Response data length: ${response.data?.length}`);

        if (!response.data) {
            throw new Error('Empty response from NSE');
        }

        const results = [];
        let rowCount = 0;

        return new Promise((resolve, reject) => {
            Readable.from(response.data)
                .pipe(csv())
                .on('data', (row) => {
                    // Trim keys and values
                    const cleanRow = {};
                    Object.keys(row).forEach(key => {
                        cleanRow[key.trim()] = row[key]?.trim();
                    });

                    const symbol = cleanRow['SYMBOL'];
                    const name = cleanRow['NAME OF COMPANY'];
                    const series = cleanRow['SERIES'];
                    const isin = cleanRow['ISIN NUMBER'] || cleanRow['ISIN'];

                    if (series === 'EQ') {
                        results.push({
                            symbol,
                            name,
                            series,
                            isin
                        });
                    }
                })

                .on('end', () => resolve(results))
                .on('error', (err) => {
                    console.error('Error parsing NSE CSV:', err);
                    reject(err);
                });
        });
    } catch (err) {
        console.error('Error fetching NSE equity list:', err.message);
        throw err;
    }
}

module.exports = {
    getLivePriceData,
    getMultiplePricesSequentially,
    getAllNSEStocks
};

