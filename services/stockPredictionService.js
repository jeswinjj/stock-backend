const config = require('../config/predictionConfig');
const { calculateEMA, calculateRSI, calculateMACD, calculateBollingerBands, calculateATR, calculateSMA } = require('./technicalAnalysisService');

const round = (value, decimals = 2) => value == null || !Number.isFinite(value) ? null : Number(value.toFixed(decimals));
const pct = (a, b) => b ? round(Math.abs(a - b) / b * 100) : null;

function detectSwingLows(bars, lookback = config.swingLookback) {
    const swings = [];
    for (let i = lookback; i < bars.length - lookback; i++) {
        if (bars.slice(i - lookback, i).every(b => bars[i].low < b.low) && bars.slice(i + 1, i + lookback + 1).every(b => bars[i].low < b.low)) swings.push({ index: i, price: bars[i].low, volume: bars[i].volume || 0 });
    }
    return swings;
}
function detectSwingHighs(bars, lookback = config.swingLookback) {
    const swings = [];
    for (let i = lookback; i < bars.length - lookback; i++) {
        if (bars.slice(i - lookback, i).every(b => bars[i].high > b.high) && bars.slice(i + 1, i + lookback + 1).every(b => bars[i].high > b.high)) swings.push({ index: i, price: bars[i].high, volume: bars[i].volume || 0 });
    }
    return swings;
}
function clusterLevels(swings, bars, currentPrice, kind) {
    const groups = [];
    [...swings].sort((a, b) => a.price - b.price).forEach(swing => {
        const group = groups.find(item => Math.abs(swing.price - item.average) / item.average <= config.clusterPercent);
        if (group) { group.items.push(swing); group.average = group.items.reduce((sum, x) => sum + x.price, 0) / group.items.length; }
        else groups.push({ average: swing.price, items: [swing] });
    });
    const avgVolume = bars.reduce((sum, b) => sum + (b.volume || 0), 0) / Math.max(bars.length, 1);
    return groups.map(group => {
        const latestIndex = Math.max(...group.items.map(x => x.index));
        const volumeRatio = avgVolume ? group.items.reduce((sum, x) => sum + x.volume, 0) / group.items.length / avgVolume : 1;
        const recency = (latestIndex + 1) / bars.length;
        const strength = Math.min(100, Math.round(group.items.length * 18 + recency * 25 + Math.min(volumeRatio, 2) * 12));
        return { price: round(group.average), low: round(Math.min(...group.items.map(x => x.price))), high: round(Math.max(...group.items.map(x => x.price))), touches: group.items.length, strength, distancePercent: pct(currentPrice, group.average), kind };
    }).sort((a, b) => b.strength - a.strength);
}
const clusterSupportLevels = (swings, bars, price) => clusterLevels(swings, bars, price, 'SUPPORT');
const clusterResistanceLevels = (swings, bars, price) => clusterLevels(swings, bars, price, 'RESISTANCE');

function detectMarketStructure(bars) {
    const lows = detectSwingLows(bars).slice(-3), highs = detectSwingHighs(bars).slice(-3);
    if (lows.length < 2 || highs.length < 2) return { type: 'INSUFFICIENT_DATA', bias: 'NEUTRAL', higherHigh: false, higherLow: false, lowerHigh: false, lowerLow: false };
    const higherLow = lows.at(-1).price > lows.at(-2).price, lowerLow = lows.at(-1).price < lows.at(-2).price;
    const higherHigh = highs.at(-1).price > highs.at(-2).price, lowerHigh = highs.at(-1).price < highs.at(-2).price;
    const bias = higherHigh && higherLow ? 'BULLISH' : lowerHigh && lowerLow ? 'BEARISH' : 'NEUTRAL';
    return { type: bias === 'BULLISH' ? 'HIGHER_HIGH_HIGHER_LOW' : bias === 'BEARISH' ? 'LOWER_HIGH_LOWER_LOW' : 'RANGE_BOUND', bias, higherHigh, higherLow, lowerHigh, lowerLow };
}
function detectCandlestickPatterns(bars) {
    const i = bars.length - 1, b = bars[i], prev = bars[i - 1];
    if (!b || !prev) return { name: null, type: null, detected: false, confidence: 0 };
    const body = Math.abs(b.close - b.open), range = Math.max(b.high - b.low, 0.0001), upper = b.high - Math.max(b.open, b.close), lower = Math.min(b.open, b.close) - b.low;
    if (prev.close < prev.open && b.close > b.open && b.open <= prev.close && b.close >= prev.open) return { name: 'Bullish Engulfing', type: 'BULLISH', detected: true, confidence: 75, candleIndex: i, explanation: 'Current bullish body engulfs the preceding bearish body.' };
    if (prev.close > prev.open && b.close < b.open && b.open >= prev.close && b.close <= prev.open) return { name: 'Bearish Engulfing', type: 'BEARISH', detected: true, confidence: 75, candleIndex: i, explanation: 'Current bearish body engulfs the preceding bullish body.' };
    if (body / range < 0.12) return { name: 'Doji', type: 'NEUTRAL', detected: true, confidence: 50, candleIndex: i, explanation: 'Open and close are almost equal, showing indecision.' };
    if (lower >= body * 2 && upper <= body) return { name: 'Hammer', type: 'BULLISH', detected: true, confidence: 62, candleIndex: i, explanation: 'Long lower wick indicates rejection of lower prices.' };
    if (upper >= body * 2 && lower <= body) return { name: 'Shooting Star', type: 'BEARISH', detected: true, confidence: 62, candleIndex: i, explanation: 'Long upper wick indicates rejection of higher prices.' };
    return { name: null, type: null, detected: false, confidence: 0 };
}
function detectChartPatterns(bars) {
    const lows = detectSwingLows(bars).slice(-3), highs = detectSwingHighs(bars).slice(-3);
    if (lows.length >= 2 && pct(lows.at(-1).price, lows.at(-2).price) <= config.patternTolerancePercent * 100 && highs.length && highs.at(-1).index > lows.at(-2).index) return { name: 'DOUBLE_BOTTOM', type: 'BULLISH', confidence: 65 };
    if (highs.length >= 2 && pct(highs.at(-1).price, highs.at(-2).price) <= config.patternTolerancePercent * 100 && lows.length && lows.at(-1).index > highs.at(-2).index) return { name: 'DOUBLE_TOP', type: 'BEARISH', confidence: 65 };
    return { name: null, type: null, confidence: 0 };
}
function generatePrediction(allBars, index = allBars.length - 1) {
    const bars = allBars.slice(0, index + 1).filter(b => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low));
    if (bars.length < config.minimumBars) return { error: 'INSUFFICIENT_HISTORY', requiredBars: config.minimumBars, availableBars: bars.length };
    const i = bars.length - 1, price = bars[i].close, previous = bars[i - 1];
    const ema20 = calculateEMA(bars, config.emaPeriods.short)[i], ema50 = calculateEMA(bars, config.emaPeriods.medium)[i], ema200 = calculateEMA(bars, config.emaPeriods.long)[i];
    const rsiSeries = calculateRSI(bars, config.rsi.period), rsi = rsiSeries[i];
    const macdSeries = calculateMACD(bars), macd = macdSeries.macdLine[i], signal = macdSeries.signalLine[i];
    const atr = calculateATR(bars, config.atrPeriod)[i], bb = calculateBollingerBands(bars), averageVolume = calculateSMA(bars.map(b => ({ close: b.volume || 0 })), config.volume.period)[i] || price;
    const relativeVolume = averageVolume ? (bars[i].volume || 0) / averageVolume : 1;
    const supports = clusterSupportLevels(detectSwingLows(bars), bars, price), resistances = clusterResistanceLevels(detectSwingHighs(bars), bars, price);
    const supportLevels = supports.filter(x => x.price < price).sort((a,b) => b.price - a.price), resistanceLevels = resistances.filter(x => x.price > price).sort((a,b) => a.price - b.price);
    const support = supportLevels[0] || null, resistance = resistanceLevels[0] || null;
    const structure = detectMarketStructure(bars.slice(-config.structureLookback));
    const candlePattern = detectCandlestickPatterns(bars), chartPattern = detectChartPatterns(bars.slice(-config.structureLookback));
    const pattern = candlePattern.detected ? candlePattern : chartPattern;
    const trendDirection = price > ema20 && ema20 > ema50 && ema50 > ema200 ? 'STRONG_BULLISH' : price > ema50 && ema20 > ema50 ? 'BULLISH' : price < ema20 && ema20 < ema50 && ema50 < ema200 ? 'STRONG_BEARISH' : price < ema50 && ema20 < ema50 ? 'BEARISH' : 'NEUTRAL';
    const macdState = macd != null && signal != null ? (macd > signal ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
    const rsiState = rsi == null ? 'UNAVAILABLE' : rsi < 30 ? 'OVERSOLD' : rsi < 50 ? 'WEAK' : rsi <= 70 ? 'POSITIVE' : 'OVERBOUGHT';
    const breakout = resistance && bars[i].high > resistance.price && price <= resistance.price ? { detected: true, type: 'FAILED_BREAKOUT', level: resistance.price, volumeRatio: round(relativeVolume), confirmed: false } : resistance && previous.close <= resistance.price && price > resistance.price ? { detected: true, type: 'BULLISH_BREAKOUT', level: resistance.price, volumeRatio: round(relativeVolume), confirmed: relativeVolume >= config.breakoutConfirmationVolume } : support && previous.close >= support.price && price < support.price ? { detected: true, type: 'BEARISH_BREAKDOWN', level: support.price, volumeRatio: round(relativeVolume), confirmed: relativeVolume >= config.breakoutConfirmationVolume } : { detected: false, status: resistance && pct(price, resistance.price) <= config.nearbyLevelPercent * 100 ? 'APPROACHING_RESISTANCE' : 'NONE' };
    const positive = [], warnings = [], neutral = [], signals = []; let score = 50, bullish = 0, bearish = 0;
    const add = (type, message, points) => { signals.push({ type, message, points }); if (type === 'BULLISH') { score += points; bullish++; positive.push(message); } if (type === 'BEARISH') { score -= points; bearish++; warnings.push(message); } };
    if (trendDirection.includes('BULLISH')) add('BULLISH', `Trend is ${trendDirection.replace('_', ' ').toLowerCase()} with price/EMA alignment.`, config.score.trend); else if (trendDirection.includes('BEARISH')) add('BEARISH', `Trend is ${trendDirection.replace('_', ' ').toLowerCase()} with price/EMA alignment.`, config.score.trend); else neutral.push('EMA alignment is mixed, indicating a range-bound trend.');
    if (macdState === 'BULLISH' && rsiState === 'POSITIVE') add('BULLISH', `RSI is ${rsi} and MACD is above its signal line.`, config.score.momentum); else if (macdState === 'BEARISH' && rsiState === 'WEAK') add('BEARISH', `RSI is ${rsi} and MACD is below its signal line.`, config.score.momentum);
    if (structure.bias === 'BULLISH') add('BULLISH', 'Market structure shows higher highs and higher lows.', config.score.structure); else if (structure.bias === 'BEARISH') add('BEARISH', 'Market structure shows lower highs and lower lows.', config.score.structure);
    if (breakout.detected && breakout.type === 'BULLISH_BREAKOUT' && breakout.confirmed) add('BULLISH', `Confirmed breakout above ${breakout.level} on ${breakout.volumeRatio}x volume.`, config.score.breakout); else if (breakout.detected && breakout.type === 'BEARISH_BREAKDOWN') add('BEARISH', `Support breakdown below ${breakout.level}${breakout.confirmed ? ' with volume confirmation' : ''}.`, config.score.breakout);
    if (relativeVolume >= config.volume.high) add('BULLISH', `Relative volume is ${round(relativeVolume)}x the 20-day average.`, config.score.volume); else if (relativeVolume < config.volume.low) warnings.push(`Volume is weak at ${round(relativeVolume)}x the 20-day average.`);
    if (pattern.detected && pattern.type === 'BULLISH') add('BULLISH', `${pattern.name} pattern detected.`, config.score.pattern); else if (pattern.detected && pattern.type === 'BEARISH') add('BEARISH', `${pattern.name} pattern detected.`, config.score.pattern);
    if (resistance && pct(price, resistance.price) <= config.nearbyLevelPercent * 100 && !breakout.detected) { warnings.push(`Price is ${pct(price, resistance.price)}% below nearby resistance at ${resistance.price}.`); score -= 8; }
    score = Math.max(0, Math.min(100, Math.round(score))); const bias = score >= config.thresholds.bullish ? 'BULLISH' : score >= config.thresholds.neutral ? 'NEUTRAL' : score >= config.thresholds.bearish ? 'BEARISH' : 'STRONG_BEARISH';
    let recommendation = 'HOLD'; if (score >= config.thresholds.bullish && !trendDirection.includes('BEARISH') && bullish >= config.minimumConfirmations && !(resistance && pct(price, resistance.price) <= config.nearbyLevelPercent * 100 && !breakout.detected)) recommendation = 'BUY'; if (score < config.thresholds.bearish && trendDirection.includes('BEARISH') && bearish >= config.minimumConfirmations) recommendation = 'SELL';
    const stop = support ? support.low : (atr ? price - atr * 2 : null), target = resistance ? resistance.price : (atr ? price + atr * 2 : null), riskReward = stop && target && price > stop ? round((target - price) / (price - stop)) : null;
    return { currentPrice: round(price), prediction: { recommendation, bias, setupStrength: score, confidence: score, strength: score >= 70 ? 'STRONG' : score >= 55 ? 'MODERATE' : 'WEAK' }, support: { levels: supportLevels.slice(0, 3), primary: support?.price || null, nearest: support?.price || null, distancePercent: support ? pct(price, support.price) : null }, resistance: { levels: resistanceLevels.slice(0, 3), primary: resistance?.price || null, nearest: resistance?.price || null, distancePercent: resistance ? pct(price, resistance.price) : null }, pattern, trend: { direction: trendDirection, ema20, ema50, ema200 }, momentum: { rsi, rsiState, macd, signal, macdState }, volume: { current: bars[i].volume || 0, average: round(averageVolume), relativeVolume: round(relativeVolume), state: relativeVolume >= 2 ? 'VERY_HIGH' : relativeVolume >= 1.5 ? 'HIGH' : relativeVolume >= 1 ? 'NORMAL' : relativeVolume >= .75 ? 'BELOW_AVERAGE' : 'LOW' }, marketStructure: structure, breakout, volatility: { atr, atrPercent: atr ? round(atr / price * 100) : null, bollinger: { upper: bb.upper[i], middle: bb.middle[i], lower: bb.lower[i] } }, risk: { atrPercent: atr ? round(atr / price * 100) : null }, signals, rationale: { positive, warnings, neutral }, hypotheticalSetup: recommendation === 'BUY' && stop && target ? { entry: round(price), stop: round(stop), target: round(target), riskReward } : null };
}
module.exports = { config, detectSwingLows, detectSwingHighs, clusterSupportLevels, clusterResistanceLevels, detectMarketStructure, detectCandlestickPatterns, detectChartPatterns, generatePrediction };
