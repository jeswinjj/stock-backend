const { normalizeFundamentals } = require('../services/fundamentalAnalysisService');
const { evaluateStockSignals } = require('../services/stockSignalService');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
}

function testFundamentalAndSignals() {
    console.log("Starting Fundamental & Signals Unit Tests...");

    // 1. Mock Yahoo Finance raw quoteSummary payload
    const mockRawYahoo = {
        price: { longName: 'Reliance Industries Ltd.', regularMarketPrice: 1425.30 },
        summaryDetail: {
            marketCap: 17500000000000,
            fiftyTwoWeekHigh: 1600.00,
            fiftyTwoWeekLow: 1050.00,
            trailingPE: 24.3,
            forwardPE: 21.8,
            dividendYield: 0.006,
            dividendRate: 6.0,
            payoutRatio: 0.20
        },
        financialData: {
            currentPrice: 1425.30,
            totalCash: 2500000000000,
            totalDebt: 3900000000000,
            debtToEquity: 37.0, // 37.0% -> normalized to 0.37 ratio
            revenueGrowth: 0.124, // 12.4%
            earningsGrowth: 0.158, // 15.8%
            returnOnEquity: 0.142, // 14.2%
            operatingMargins: 0.173,
            profitMargins: 0.094
        },
        defaultKeyStatistics: {
            trailingEps: 58.40,
            priceToBook: 3.2,
            pegRatio: 1.4,
            enterpriseValue: 20000000000000,
            enterpriseToEbitda: 14.7,
            heldPercentInsiders: 0.51,
            heldPercentInstitutions: 0.28
        }
    };

    // Test Normalization
    const fundamentals = normalizeFundamentals('RELIANCE', mockRawYahoo);
    assert(fundamentals.symbol === 'RELIANCE', "Symbol should be normalized uppercase");
    assert(fundamentals.market.currentPrice === 1425.30, "Current price mapped correctly");
    assert(fundamentals.valuation.pe === 24.3, "Trailing P/E mapped correctly");
    assert(fundamentals.profitability.roe === 14.2, "ROE percentage calculated correctly");
    assert(fundamentals.growth.revenueGrowth === 12.4, "Revenue growth percentage calculated correctly");
    assert(fundamentals.financialHealth.debtToEquity === 0.37, "Debt to Equity converted to ratio");
    assert(fundamentals.market.distanceFrom52WHigh < 0, "Distance from 52W High should be negative percentage");
    console.log("✓ Fundamental data normalization test passed");

    // 2. Mock Technical Analysis Output
    const mockTechnicals = {
        price: 1425.30,
        trend: {
            ema20: 1400.0,
            ema50: 1350.0,
            ema200: 1250.0,
            priceVsEma20: 'ABOVE',
            priceVsEma50: 'ABOVE',
            priceVsEma200: 'ABOVE'
        },
        momentum: {
            rsi: 61.4,
            macd: 12.5,
            signal: 8.2
        },
        volatility: {
            atr: 28.4,
            bollinger: { middle: 1380.0, upper: 1460.0, lower: 1300.0 }
        },
        volume: {
            current: 1200000,
            average: 1000000,
            relative: 1.2
        }
    };

    // Test Signal Engine
    const signals = evaluateStockSignals(mockTechnicals, fundamentals);
    assert(signals.overallScore >= 0 && signals.overallScore <= 100, "Overall score must be between 0 and 100");
    assert(signals.technicalScore >= 0 && signals.technicalScore <= 100, "Technical score must be between 0 and 100");
    assert(signals.fundamentalScore >= 0 && signals.fundamentalScore <= 100, "Fundamental score must be between 0 and 100");
    assert(signals.riskScore >= 0 && signals.riskScore <= 100, "Risk score must be between 0 and 100");
    assert(Array.isArray(signals.positiveSignals) && signals.positiveSignals.length > 0, "Should generate positive signals");
    assert(signals.classification !== null, "Classification must be defined");
    console.log(`✓ Signal Engine test passed (Overall Score: ${signals.overallScore}/100, Tech: ${signals.technicalScore}, Fund: ${signals.fundamentalScore}, Risk: ${signals.riskScore} - ${signals.classification})`);

    // 3. Test Edge Case: Null / Missing values & negative EPS
    const mockEmptyYahoo = { price: { regularMarketPrice: 50.0 } };
    const emptyFund = normalizeFundamentals('EMPTY', mockEmptyYahoo);
    assert(emptyFund.valuation.pe === null, "Missing P/E should be null");
    assert(emptyFund.profitability.roe === null, "Missing ROE should be null");

    const mockNegEpsYahoo = {
        price: { regularMarketPrice: 100.0 },
        defaultKeyStatistics: { trailingEps: -10.0 }
    };
    const negFund = normalizeFundamentals('LOSS', mockNegEpsYahoo);
    const negSignals = evaluateStockSignals(null, negFund);
    assert(negSignals.warningSignals.some(s => s.indicator === 'Negative P/E' || s.indicator === 'Earnings Deficit'), "Negative EPS should generate warning signal");
    console.log("✓ Null safety and Negative EPS edge case test passed");

    console.log("ALL FUNDAMENTAL & SIGNAL TESTS PASSED SUCCESSFULLY!");
}

testFundamentalAndSignals();
