const {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateATR,
    calculateVWAP,
    analyzeStock
} = require('../services/technicalAnalysisService');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
}

function testTechnicalAnalysis() {
    console.log("Starting Technical Analysis Unit Tests...");

    // Mock 30 bars with incremental prices
    const bars = [];
    for (let i = 1; i <= 50; i++) {
        const close = 100 + i * 2 + (i % 2 === 0 ? 1 : -1);
        bars.push({
            date: new Date(2026, 0, i),
            open: close - 1,
            high: close + 2,
            low: close - 2,
            close: close,
            volume: 10000 + i * 500
        });
    }

    // 1. Test SMA
    const sma5 = calculateSMA(bars, 5);
    assert(sma5.length === 50, "SMA length should match input bars");
    assert(sma5[0] === null, "SMA before period should be null");
    assert(sma5[4] !== null, "SMA at period - 1 should be numeric");
    console.log("✓ SMA calculation test passed");

    // 2. Test EMA
    const ema10 = calculateEMA(bars, 10);
    assert(ema10.length === 50, "EMA length should match input bars");
    assert(ema10[8] === null, "EMA before period should be null");
    assert(ema10[9] !== null, "EMA at period - 1 should be numeric");
    console.log("✓ EMA calculation test passed");

    // 3. Test RSI
    const rsi = calculateRSI(bars, 14);
    assert(rsi.length === 50, "RSI length should match input bars");
    assert(rsi[13] === null, "RSI before period should be null");
    assert(rsi[14] >= 0 && rsi[14] <= 100, "RSI must be between 0 and 100");
    console.log("✓ RSI calculation test passed");

    // 4. Test MACD
    const macd = calculateMACD(bars, 12, 26, 9);
    assert(macd.macdLine.length === 50, "MACD line length should match input bars");
    assert(macd.signalLine.length === 50, "MACD signal line length should match input bars");
    assert(macd.histogram.length === 50, "MACD histogram length should match input bars");
    console.log("✓ MACD calculation test passed");

    // 5. Test Bollinger Bands
    const bb = calculateBollingerBands(bars, 20, 2);
    assert(bb.middle.length === 50, "BB middle length should match input bars");
    assert(bb.upper[19] > bb.middle[19], "BB upper must be greater than middle");
    assert(bb.lower[19] < bb.middle[19], "BB lower must be less than middle");
    console.log("✓ Bollinger Bands calculation test passed");

    // 6. Test ATR
    const atr = calculateATR(bars, 14);
    assert(atr.length === 50, "ATR length should match input bars");
    assert(atr[13] !== null && atr[13] > 0, "ATR should be positive number");
    console.log("✓ ATR calculation test passed");

    // 7. Test VWAP
    const vwap = calculateVWAP(bars);
    assert(vwap.length === 50, "VWAP length should match input bars");
    assert(vwap[0] > 0, "VWAP should be positive number");
    console.log("✓ VWAP calculation test passed");

    // 8. Test Analyze Stock
    const analysis = analyzeStock(bars);
    assert(analysis !== null, "Analysis should not be null");
    assert(analysis.score.value >= 0 && analysis.score.value <= 100, "Score should be between 0 and 100");
    assert(Array.isArray(analysis.signals), "Signals should be an array");
    console.log(`✓ Stock Analysis Engine test passed (Score: ${analysis.score.value}/100 - ${analysis.score.label})`);

    console.log("ALL TECHNICAL ANALYSIS TESTS PASSED SUCCESSFULLY!");
}

testTechnicalAnalysis();
