const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const FundamentalSnapshot = require('../models/FundamentalSnapshot');
const ANALYSIS_CONFIG = require('../config/analysisConfig');

/**
 * Safely parses numeric value, returning null if invalid/NaN/undefined
 */
function safeNum(val, scale = 1, decimal = 2) {
    if (val === null || val === undefined || isNaN(val)) return null;
    const num = Number(val) * scale;
    if (!isFinite(num)) return null;
    return Number(num.toFixed(decimal));
}

/**
 * Normalizes raw Yahoo Finance quoteSummary data into clean fundamental model
 */
function normalizeFundamentals(symbol, rawData) {
    const summary = rawData.summaryDetail || {};
    const financial = rawData.financialData || {};
    const stats = rawData.defaultKeyStatistics || {};
    const price = rawData.price || {};

    const currentPrice = safeNum(financial.currentPrice || price.regularMarketPrice || summary.regularMarketPreviousClose);
    const high52 = safeNum(summary.fiftyTwoWeekHigh);
    const low52 = safeNum(summary.fiftyTwoWeekLow);

    let distanceFrom52WHigh = null;
    let distanceFrom52WLow = null;
    if (currentPrice !== null && high52 !== null && high52 > 0) {
        distanceFrom52WHigh = Number((((currentPrice - high52) / high52) * 100).toFixed(2));
    }
    if (currentPrice !== null && low52 !== null && low52 > 0) {
        distanceFrom52WLow = Number((((currentPrice - low52) / low52) * 100).toFixed(2));
    }

    // ROE calculation fallback if not direct
    let roe = safeNum(financial.returnOnEquity, 100);
    if (roe === null && stats.trailingEps !== undefined && stats.bookValue !== undefined && stats.bookValue > 0) {
        roe = Number(((stats.trailingEps / stats.bookValue) * 100).toFixed(2));
    }

    // Debt to Equity normalized to ratio (e.g., 0.36)
    let debtToEquity = safeNum(financial.debtToEquity);
    if (debtToEquity !== null && debtToEquity > 5) {
        // If Yahoo returned percentage (e.g. 36.65%), convert to ratio 0.3665
        debtToEquity = Number((debtToEquity / 100).toFixed(2));
    }

    return {
        symbol: symbol.trim().toUpperCase(),
        companyName: price.longName || price.shortName || symbol,
        lastUpdated: new Date().toISOString(),

        market: {
            marketCap: safeNum(summary.marketCap || price.marketCap, 1, 0),
            enterpriseValue: safeNum(stats.enterpriseValue, 1, 0),
            currentPrice,
            fiftyTwoWeekHigh: high52,
            fiftyTwoWeekLow: low52,
            distanceFrom52WHigh,
            distanceFrom52WLow
        },

        valuation: {
            pe: safeNum(summary.trailingPE || stats.trailingPE),
            forwardPE: safeNum(summary.forwardPE || stats.forwardPE),
            pb: safeNum(stats.priceToBook),
            ps: safeNum(summary.priceToSalesTrailing12Months),
            peg: safeNum(stats.pegRatio),
            evToEbitda: safeNum(stats.enterpriseToEbitda),
            dividendYield: safeNum(summary.dividendYield, 100)
        },

        profitability: {
            eps: safeNum(stats.trailingEps),
            roe,
            roa: safeNum(financial.returnOnAssets, 100),
            profitMargin: safeNum(financial.profitMargins || stats.profitMargins, 100),
            operatingMargin: safeNum(financial.operatingMargins, 100),
            grossMargin: safeNum(financial.grossMargins, 100)
        },

        growth: {
            revenueGrowth: safeNum(financial.revenueGrowth, 100),
            earningsGrowth: safeNum(financial.earningsGrowth, 100),
            epsGrowth: safeNum(stats.earningsQuarterlyGrowth, 100)
        },

        financialHealth: {
            totalDebt: safeNum(financial.totalDebt, 1, 0),
            totalCash: safeNum(financial.totalCash, 1, 0),
            debtToEquity,
            currentRatio: safeNum(financial.currentRatio),
            quickRatio: safeNum(financial.quickRatio),
            freeCashFlow: safeNum(financial.freeCashflow, 1, 0)
        },

        dividend: {
            dividendRate: safeNum(summary.dividendRate),
            dividendYield: safeNum(summary.dividendYield, 100),
            payoutRatio: safeNum(summary.payoutRatio, 100),
            exDividendDate: summary.exDividendDate || stats.lastDividendDate || null
        },

        ownership: {
            promoterHolding: safeNum(stats.heldPercentInsiders, 100),
            institutionalHolding: safeNum(stats.heldPercentInstitutions, 100)
        }
    };
}

/**
 * Fetches fundamentals for symbol with 24-hour MongoDB caching
 * @param {string} symbol 
 */
async function getStockFundamentals(symbol) {
    try {
        if (!symbol || typeof symbol !== 'string') {
            throw new Error('Symbol is required');
        }

        const cleanSymbol = symbol.trim().toUpperCase();

        // 1. Check MongoDB cache first
        try {
            const cached = await FundamentalSnapshot.findOne({
                symbol: cleanSymbol,
                expiresAt: { $gt: new Date() }
            });

            if (cached && cached.data) {
                return cached.data;
            }
        } catch (dbErr) {
            console.warn(`Fundamental cache lookup skipped for ${cleanSymbol}:`, dbErr.message);
        }

        // 2. Fetch live quoteSummary from Yahoo Finance
        const yahooSymbol = cleanSymbol.endsWith('.NS') ? cleanSymbol : `${cleanSymbol}.NS`;
        const modules = ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'price'];

        let rawData;
        try {
            rawData = await yahooFinance.quoteSummary(yahooSymbol, { modules });
        } catch (e) {
            // Fallback without .NS
            rawData = await yahooFinance.quoteSummary(cleanSymbol, { modules });
        }

        if (!rawData) {
            throw new Error(`Unable to fetch fundamental data for ${cleanSymbol}`);
        }

        // 3. Normalize into fundamental schema
        const normalized = normalizeFundamentals(cleanSymbol, rawData);

        // 4. Cache in MongoDB
        try {
            const expiresAt = new Date(Date.now() + ANALYSIS_CONFIG.cacheTTL * 1000);
            await FundamentalSnapshot.findOneAndUpdate(
                { symbol: cleanSymbol },
                {
                    symbol: cleanSymbol,
                    data: normalized,
                    source: 'yahoo-finance',
                    fetchedAt: new Date(),
                    expiresAt
                },
                { upsert: true, new: true }
            );
        } catch (dbErr) {
            console.warn(`Failed to save fundamental cache for ${cleanSymbol}:`, dbErr.message);
        }

        return normalized;
    } catch (err) {
        console.error(`Error in getStockFundamentals for ${symbol}:`, err.message);
        throw err;
    }
}

module.exports = {
    getStockFundamentals,
    normalizeFundamentals
};
