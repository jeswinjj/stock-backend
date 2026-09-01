const { detectSwingLows, detectSwingHighs, clusterSupportLevels, clusterResistanceLevels, detectMarketStructure, generatePrediction } = require('../services/stockPredictionService');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const bars = Array.from({ length: 260 }, (_, i) => {
    const base = 100 + i * 0.55 + Math.sin(i / 4) * 3;
    return { date: new Date(2025, 0, i + 1), open: base - .5, high: base + 2, low: base - 2, close: base + (i % 3 - 1) * .2, volume: 100000 + (i % 9) * 1000 };
});
const lows = detectSwingLows(bars), highs = detectSwingHighs(bars);
assert(lows.length > 0 && highs.length > 0, 'Swing detector should find highs and lows');
assert(clusterSupportLevels(lows, bars, bars.at(-1).close).every(x => x.touches > 0), 'Support clusters should retain touches');
assert(clusterResistanceLevels(highs, bars, bars.at(-1).close).every(x => x.strength >= 0), 'Resistance clusters should include strength');
assert(detectMarketStructure(bars).type, 'Market structure should classify the bars');
const prediction = generatePrediction(bars);
assert(!prediction.error, '260 bars must be sufficient for prediction');
assert(['BUY', 'HOLD', 'SELL'].includes(prediction.prediction.recommendation), 'Recommendation must be deterministic and valid');
assert(prediction.prediction.setupStrength >= 0 && prediction.prediction.setupStrength <= 100, 'Setup strength must be normalized');
assert(prediction.currentPrice === Number(bars.at(-1).close.toFixed(2)), 'Prediction must use only the requested final bar');
assert(generatePrediction(bars, 100).error === 'INSUFFICIENT_HISTORY', 'Historical snapshots must enforce sufficient history');
console.log('Stock prediction tests passed');
