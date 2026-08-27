/**
 * Technical Analysis Service
 * Implements standard financial formulas for SMA, EMA, RSI, MACD, Bollinger Bands, ATR, VWAP,
 * Technical Score (0-100), and analytical signal generation.
 */

/**
 * Calculates Simple Moving Average (SMA)
 * @param {Array<{close: number}>} bars 
 * @param {number} period 
 * @returns {Array<number|null>} Array of SMA values aligned with input bars
 */
function calculateSMA(bars, period) {
    if (!bars || bars.length === 0 || period <= 0) return [];
    const results = new Array(bars.length).fill(null);

    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
        sum += bars[i].close;
        if (i >= period - 1) {
            if (i >= period) {
                sum -= bars[i - period].close;
            }
            results[i] = Number((sum / period).toFixed(2));
        }
    }
    return results;
}

/**
 * Calculates Exponential Moving Average (EMA)
 * Multiplier = 2 / (period + 1)
 */
function calculateEMA(bars, period) {
    if (!bars || bars.length < period || period <= 0) return new Array(bars ? bars.length : 0).fill(null);
    const results = new Array(bars.length).fill(null);

    const multiplier = 2 / (period + 1);

    // Initial EMA uses simple average over first `period` bars
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += bars[i].close;
    }
    let prevEMA = sum / period;
    results[period - 1] = Number(prevEMA.toFixed(2));

    for (let i = period; i < bars.length; i++) {
        const currentClose = bars[i].close;
        const currentEMA = (currentClose - prevEMA) * multiplier + prevEMA;
        results[i] = Number(currentEMA.toFixed(2));
        prevEMA = currentEMA;
    }

    return results;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing
 * Default period: 14
 */
function calculateRSI(bars, period = 14) {
    if (!bars || bars.length <= period) return new Array(bars ? bars.length : 0).fill(null);
    const results = new Array(bars.length).fill(null);

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
        const change = bars[i].close - bars[i - 1].close;
        if (change >= 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    results[period] = Number((100 - (100 / (1 + rs))).toFixed(2));

    // Wilder's smoothing for subsequent bars
    for (let i = period + 1; i < bars.length; i++) {
        const change = bars[i].close - bars[i - 1].close;
        const currentGain = change > 0 ? change : 0;
        const currentLoss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

        if (avgLoss === 0) {
            results[i] = 100;
        } else {
            rs = avgGain / avgLoss;
            results[i] = Number((100 - (100 / (1 + rs))).toFixed(2));
        }
    }

    return results;
}

/**
 * Calculates Moving Average Convergence Divergence (MACD)
 * Default: Fast=12, Slow=26, Signal=9
 */
function calculateMACD(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!bars || bars.length < slowPeriod) {
        return {
            macdLine: new Array(bars ? bars.length : 0).fill(null),
            signalLine: new Array(bars ? bars.length : 0).fill(null),
            histogram: new Array(bars ? bars.length : 0).fill(null)
        };
    }

    const fastEMA = calculateEMA(bars, fastPeriod);
    const slowEMA = calculateEMA(bars, slowPeriod);

    const macdLine = new Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            macdLine[i] = Number((fastEMA[i] - slowEMA[i]).toFixed(2));
        }
    }

    // Filter valid MACD points to compute Signal Line (EMA of MACD Line)
    const validMacdIndices = [];
    const validMacdValues = [];
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] !== null) {
            validMacdIndices.push(i);
            validMacdValues.push({ close: macdLine[i] });
        }
    }

    const rawSignal = calculateEMA(validMacdValues, signalPeriod);
    const signalLine = new Array(bars.length).fill(null);
    const histogram = new Array(bars.length).fill(null);

    for (let j = 0; j < validMacdIndices.length; j++) {
        const barIndex = validMacdIndices[j];
        if (rawSignal[j] !== null) {
            signalLine[barIndex] = rawSignal[j];
            histogram[barIndex] = Number((macdLine[barIndex] - signalLine[barIndex]).toFixed(2));
        }
    }

    return { macdLine, signalLine, histogram };
}

/**
 * Calculates Bollinger Bands
 * Default: Period=20, StdDev=2
 */
function calculateBollingerBands(bars, period = 20, stdDevMultiplier = 2) {
    const upper = new Array(bars ? bars.length : 0).fill(null);
    const middle = calculateSMA(bars, period);
    const lower = new Array(bars ? bars.length : 0).fill(null);

    if (!bars || bars.length < period) {
        return { upper, middle, lower };
    }

    for (let i = period - 1; i < bars.length; i++) {
        const mean = middle[i];
        if (mean === null) continue;

        let varianceSum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            varianceSum += Math.pow(bars[j].close - mean, 2);
        }
        const stdDev = Math.sqrt(varianceSum / period);

        upper[i] = Number((mean + stdDevMultiplier * stdDev).toFixed(2));
        lower[i] = Number((mean - stdDevMultiplier * stdDev).toFixed(2));
    }

    return { upper, middle, lower };
}

/**
 * Calculates Average True Range (ATR)
 * Default period: 14
 */
function calculateATR(bars, period = 14) {
    if (!bars || bars.length <= period) return new Array(bars ? bars.length : 0).fill(null);
    const results = new Array(bars.length).fill(null);

    const trs = [bars[0].high - bars[0].low];
    for (let i = 1; i < bars.length; i++) {
        const tr = Math.max(
            bars[i].high - bars[i].low,
            Math.abs(bars[i].high - bars[i - 1].close),
            Math.abs(bars[i].low - bars[i - 1].close)
        );
        trs.push(tr);
    }

    let firstATR = 0;
    for (let i = 0; i < period; i++) {
        firstATR += trs[i];
    }
    firstATR /= period;
    results[period - 1] = Number(firstATR.toFixed(2));

    let prevATR = firstATR;
    for (let i = period; i < bars.length; i++) {
        const currentATR = (prevATR * (period - 1) + trs[i]) / period;
        results[i] = Number(currentATR.toFixed(2));
        prevATR = currentATR;
    }

    return results;
}

/**
 * Calculates Volume Weighted Average Price (VWAP)
 */
function calculateVWAP(bars) {
    if (!bars || bars.length === 0) return [];
    const results = new Array(bars.length).fill(null);

    let cumulativeTPV = 0;
    let cumulativeVol = 0;

    for (let i = 0; i < bars.length; i++) {
        const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
        const vol = bars[i].volume || 0;

        cumulativeTPV += typicalPrice * vol;
        cumulativeVol += vol;

        if (cumulativeVol > 0) {
            results[i] = Number((cumulativeTPV / cumulativeVol).toFixed(2));
        }
    }

    return results;
}

/**
 * Full Technical Analysis Computation Engine
 */
function analyzeStock(bars) {
    if (!bars || bars.length === 0) {
        return null;
    }

    const lastIdx = bars.length - 1;
    const latestBar = bars[lastIdx];
    const currentPrice = latestBar.close;

    // Calculate all indicator series
    const ema20 = calculateEMA(bars, 20);
    const ema50 = calculateEMA(bars, 50);
    const ema200 = calculateEMA(bars, 200);

    const rsiSeries = calculateRSI(bars, 14);
    const macdData = calculateMACD(bars, 12, 26, 9);
    const bbData = calculateBollingerBands(bars, 20, 2);
    const atrSeries = calculateATR(bars, 14);
    const vwapSeries = calculateVWAP(bars);

    // Latest values
    const latestEma20 = ema20[lastIdx];
    const latestEma50 = ema50[lastIdx];
    const latestEma200 = ema200[lastIdx];

    const latestRsi = rsiSeries[lastIdx];
    const latestMacd = macdData.macdLine[lastIdx];
    const latestSignal = macdData.signalLine[lastIdx];
    const latestHist = macdData.histogram[lastIdx];

    const latestBBUpper = bbData.upper[lastIdx];
    const latestBBMiddle = bbData.middle[lastIdx];
    const latestBBLower = bbData.lower[lastIdx];

    const latestAtr = atrSeries[lastIdx];
    const latestVwap = vwapSeries[lastIdx];

    // Volume comparison
    const vol20Sma = calculateSMA(bars.map(b => ({ close: b.volume })), 20);
    const latestVol = latestBar.volume;
    const avgVol = vol20Sma[lastIdx] || latestVol;
    const relativeVol = avgVol > 0 ? Number((latestVol / avgVol).toFixed(2)) : 1.0;

    // --- Transparent Scoring Rules (Total: 100) ---
    let scoreVal = 0;
    const signals = [];
    const breakdown = {
        trend: { max: 30, points: 0 },
        momentum: { max: 30, points: 0 },
        volatility: { max: 20, points: 0 },
        volume: { max: 20, points: 0 }
    };

    // 1. Trend Evaluation (30 pts)
    if (latestEma20 && currentPrice > latestEma20) {
        breakdown.trend.points += 10;
        signals.push({ type: 'BULLISH', indicator: 'EMA20', message: 'Price is trading above short-term EMA 20' });
    } else if (latestEma20) {
        signals.push({ type: 'BEARISH', indicator: 'EMA20', message: 'Price is trading below short-term EMA 20' });
    }

    if (latestEma20 && latestEma50 && latestEma20 > latestEma50) {
        breakdown.trend.points += 10;
        signals.push({ type: 'BULLISH', indicator: 'EMA Alignment', message: 'EMA 20 is above EMA 50 (Bullish alignment)' });
    }

    if (latestEma50 && latestEma200 && latestEma50 > latestEma200) {
        breakdown.trend.points += 10;
        signals.push({ type: 'BULLISH', indicator: 'Golden Cross Trend', message: 'EMA 50 is above long-term EMA 200' });
    }

    // 2. Momentum Evaluation (30 pts)
    if (latestRsi !== null) {
        if (latestRsi >= 50 && latestRsi <= 70) {
            breakdown.momentum.points += 15;
            signals.push({ type: 'BULLISH', indicator: 'RSI', message: `RSI is healthy at ${latestRsi} (Bullish momentum zone)` });
        } else if (latestRsi > 70) {
            breakdown.momentum.points += 5;
            signals.push({ type: 'NEUTRAL', indicator: 'RSI', message: `RSI is overbought at ${latestRsi} (Exercise caution)` });
        } else if (latestRsi < 30) {
            signals.push({ type: 'NEUTRAL', indicator: 'RSI', message: `RSI is oversold at ${latestRsi} (Potential rebound zone)` });
        } else {
            breakdown.momentum.points += 5;
            signals.push({ type: 'BEARISH', indicator: 'RSI', message: `RSI is weak at ${latestRsi}` });
        }
    }

    if (latestMacd !== null && latestSignal !== null) {
        if (latestMacd > latestSignal) {
            breakdown.momentum.points += 15;
            signals.push({ type: 'BULLISH', indicator: 'MACD', message: 'MACD line is above Signal line (Bullish momentum)' });
        } else {
            signals.push({ type: 'BEARISH', indicator: 'MACD', message: 'MACD line is below Signal line (Bearish momentum)' });
        }
    }

    // 3. Volatility Evaluation (20 pts)
    if (latestBBMiddle !== null && currentPrice > latestBBMiddle) {
        breakdown.volatility.points += 10;
        signals.push({ type: 'BULLISH', indicator: 'Bollinger Bands', message: 'Price is in the upper half of Bollinger Bands' });
    }

    if (latestBBUpper !== null && latestBBLower !== null) {
        const bandwidth = ((latestBBUpper - latestBBLower) / latestBBMiddle) * 100;
        if (bandwidth < 15) {
            breakdown.volatility.points += 10;
            signals.push({ type: 'NEUTRAL', indicator: 'Bollinger Squeeze', message: `Bandwidth squeeze at ${bandwidth.toFixed(1)}% (Breakout pending)` });
        } else {
            breakdown.volatility.points += 10;
        }
    }

    // 4. Volume Evaluation (20 pts)
    if (relativeVol >= 1.0) {
        breakdown.volume.points += 20;
        signals.push({ type: 'BULLISH', indicator: 'Volume', message: `Volume is ${relativeVol}x of 20-day average` });
    } else {
        breakdown.volume.points += 10;
        signals.push({ type: 'NEUTRAL', indicator: 'Volume', message: `Volume is below 20-day average (${relativeVol}x)` });
    }

    scoreVal = breakdown.trend.points + breakdown.momentum.points + breakdown.volatility.points + breakdown.volume.points;

    let scoreLabel = 'Neutral';
    if (scoreVal >= 75) scoreLabel = 'Strong Bullish';
    else if (scoreVal >= 60) scoreLabel = 'Bullish';
    else if (scoreVal >= 40) scoreLabel = 'Neutral';
    else if (scoreVal >= 25) scoreLabel = 'Bearish';
    else scoreLabel = 'Strong Bearish';

    return {
        timestamp: latestBar.date,
        price: currentPrice,
        trend: {
            ema20: latestEma20,
            ema50: latestEma50,
            ema200: latestEma200,
            priceVsEma20: latestEma20 ? (currentPrice > latestEma20 ? 'ABOVE' : 'BELOW') : null,
            priceVsEma50: latestEma50 ? (currentPrice > latestEma50 ? 'ABOVE' : 'BELOW') : null,
            priceVsEma200: latestEma200 ? (currentPrice > latestEma200 ? 'ABOVE' : 'BELOW') : null
        },
        momentum: {
            rsi: latestRsi,
            macd: latestMacd,
            signal: latestSignal,
            histogram: latestHist
        },
        volatility: {
            atr: latestAtr,
            bollinger: {
                upper: latestBBUpper,
                middle: latestBBMiddle,
                lower: latestBBLower
            }
        },
        volume: {
            current: latestVol,
            average: Math.round(avgVol),
            relative: relativeVol
        },
        vwap: latestVwap,
        score: {
            value: scoreVal,
            label: scoreLabel,
            breakdown
        },
        signals,
        series: {
            ema20,
            ema50,
            ema200,
            rsi: rsiSeries,
            macd: macdData,
            bollinger: bbData
        }
    };
}

module.exports = {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateATR,
    calculateVWAP,
    analyzeStock
};
