const ANALYSIS_CONFIG = require('../config/analysisConfig');

/**
 * Computes Rule-Based Stock Analysis Signals, Scores, and Rationales
 * @param {Object} technicalData Outputs from technicalAnalysisService.analyzeStock()
 * @param {Object} fundamentalData Outputs from fundamentalAnalysisService.getStockFundamentals()
 */
function evaluateStockSignals(technicalData, fundamentalData) {
    const positiveSignals = [];
    const warningSignals = [];

    const breakdown = {
        // Technical Sub-categories (Max: 75 pts raw)
        trend: { points: 0, max: ANALYSIS_CONFIG.weights.technical.trend },
        momentum: { points: 0, max: ANALYSIS_CONFIG.weights.technical.momentum },
        volatility: { points: 0, max: ANALYSIS_CONFIG.weights.technical.volatility },
        volume: { points: 0, max: ANALYSIS_CONFIG.weights.technical.volume },

        // Fundamental Sub-categories (Max: 100 pts raw)
        valuation: { points: 0, max: ANALYSIS_CONFIG.weights.fundamental.valuation },
        growth: { points: 0, max: ANALYSIS_CONFIG.weights.fundamental.growth },
        profitability: { points: 0, max: ANALYSIS_CONFIG.weights.fundamental.profitability },
        financialHealth: { points: 0, max: ANALYSIS_CONFIG.weights.fundamental.financialHealth }
    };

    // ==========================================
    // 1. TECHNICAL SIGNALS & SCORE EVALUATION
    // ==========================================
    if (technicalData) {
        const { trend, momentum, volatility, volume, price } = technicalData;

        // Trend (Max: 30)
        if (trend?.priceVsEma20 === 'ABOVE') {
            breakdown.trend.points += 10;
            positiveSignals.push({ category: 'TREND', indicator: 'EMA20', message: 'Price is trading above short-term EMA 20' });
        } else if (trend?.priceVsEma20 === 'BELOW') {
            warningSignals.push({ category: 'TREND', indicator: 'EMA20', message: 'Price is below short-term EMA 20' });
        }

        if (trend?.ema20 && trend?.ema50 && trend.ema20 > trend.ema50) {
            breakdown.trend.points += 10;
            positiveSignals.push({ category: 'TREND', indicator: 'EMA Alignment', message: 'EMA 20 is above EMA 50 (Bullish moving average alignment)' });
        }

        if (trend?.ema50 && trend?.ema200 && trend.ema50 > trend.ema200) {
            breakdown.trend.points += 10;
            positiveSignals.push({ category: 'TREND', indicator: 'Golden Cross Trend', message: 'EMA 50 is above long-term EMA 200' });
        }

        // Momentum (Max: 25)
        if (momentum?.rsi !== null && momentum?.rsi !== undefined) {
            if (momentum.rsi >= ANALYSIS_CONFIG.rsi.bullishMin && momentum.rsi <= ANALYSIS_CONFIG.rsi.overbought) {
                breakdown.momentum.points += 13;
                positiveSignals.push({ category: 'MOMENTUM', indicator: 'RSI', message: `RSI is in healthy momentum zone (${momentum.rsi})` });
            } else if (momentum.rsi > ANALYSIS_CONFIG.rsi.overbought) {
                breakdown.momentum.points += 5;
                warningSignals.push({ category: 'MOMENTUM', indicator: 'RSI Overbought', message: `RSI is approaching overbought territory (${momentum.rsi})` });
            } else if (momentum.rsi < ANALYSIS_CONFIG.rsi.oversold) {
                warningSignals.push({ category: 'MOMENTUM', indicator: 'RSI Oversold', message: `RSI is in oversold territory (${momentum.rsi})` });
            } else {
                breakdown.momentum.points += 5;
            }
        }

        if (momentum?.macd !== null && momentum?.signal !== null && momentum?.macd > momentum?.signal) {
            breakdown.momentum.points += 12;
            positiveSignals.push({ category: 'MOMENTUM', indicator: 'MACD', message: 'MACD line is above Signal line' });
        } else if (momentum?.macd !== null && momentum?.signal !== null) {
            warningSignals.push({ category: 'MOMENTUM', indicator: 'MACD Bearish', message: 'MACD line is below Signal line' });
        }

        // Volatility (Max: 10)
        if (volatility?.bollinger?.middle && price > volatility.bollinger.middle) {
            breakdown.volatility.points += 5;
            positiveSignals.push({ category: 'VOLATILITY', indicator: 'Bollinger Bands', message: 'Price is trading in the upper half of Bollinger Bands' });
        }
        if (volatility?.atr) {
            breakdown.volatility.points += 5;
        }

        // Volume (Max: 10)
        if (volume?.relative >= ANALYSIS_CONFIG.relativeVolume.aboveAverage) {
            breakdown.volume.points += 10;
            positiveSignals.push({ category: 'VOLUME', indicator: 'Volume Trend', message: `Trading volume is ${volume.relative}x of 20-day average` });
        } else if (volume?.relative < ANALYSIS_CONFIG.relativeVolume.low) {
            warningSignals.push({ category: 'VOLUME', indicator: 'Volume Weakness', message: `Trading volume is below average (${volume.relative}x)` });
        } else {
            breakdown.volume.points += 5;
        }
    }

    // Raw technical total (out of 75) normalized to 100
    const rawTechSum = breakdown.trend.points + breakdown.momentum.points + breakdown.volatility.points + breakdown.volume.points;
    const technicalScore = Math.round((rawTechSum / 75) * 100);

    // ==========================================
    // 2. FUNDAMENTAL SIGNALS & SCORE EVALUATION
    // ==========================================
    if (fundamentalData) {
        const { valuation, growth, profitability, financialHealth, dividend, market } = fundamentalData;

        // Valuation (Max: 30)
        if (valuation?.pe !== null && valuation?.pe > 0) {
            if (valuation.pe <= ANALYSIS_CONFIG.valuation.peLow) {
                breakdown.valuation.points += 15;
                positiveSignals.push({ category: 'VALUATION', indicator: 'Low P/E', message: `Attractive P/E ratio of ${valuation.pe}` });
            } else if (valuation.pe <= ANALYSIS_CONFIG.valuation.peModerate) {
                breakdown.valuation.points += 10;
            } else if (valuation.pe > ANALYSIS_CONFIG.valuation.peHigh) {
                warningSignals.push({ category: 'VALUATION', indicator: 'High P/E', message: `Valuation is elevated with P/E of ${valuation.pe}` });
            } else {
                breakdown.valuation.points += 5;
            }
        } else if (valuation?.pe !== null && valuation?.pe <= 0) {
            warningSignals.push({ category: 'VALUATION', indicator: 'Negative P/E', message: 'Company has negative trailing earnings' });
        }

        if (valuation?.peg !== null && valuation?.peg > 0 && valuation.peg <= ANALYSIS_CONFIG.valuation.pegGood) {
            breakdown.valuation.points += 10;
            positiveSignals.push({ category: 'VALUATION', indicator: 'PEG Ratio', message: `Favorable PEG ratio of ${valuation.peg} (Growth at a reasonable price)` });
        }

        if (valuation?.pb !== null && valuation?.pb <= ANALYSIS_CONFIG.valuation.pbModerate) {
            breakdown.valuation.points += 5;
            positiveSignals.push({ category: 'VALUATION', indicator: 'P/B Ratio', message: `Healthy P/B ratio of ${valuation.pb}` });
        }

        // Growth (Max: 25)
        if (growth?.revenueGrowth !== null) {
            if (growth.revenueGrowth >= ANALYSIS_CONFIG.growth.strong) {
                breakdown.growth.points += 13;
                positiveSignals.push({ category: 'GROWTH', indicator: 'Revenue Growth', message: `Strong YoY revenue growth of +${growth.revenueGrowth}%` });
            } else if (growth.revenueGrowth >= ANALYSIS_CONFIG.growth.positive) {
                breakdown.growth.points += 8;
                positiveSignals.push({ category: 'GROWTH', indicator: 'Revenue Growth', message: `Positive YoY revenue growth of +${growth.revenueGrowth}%` });
            } else {
                warningSignals.push({ category: 'GROWTH', indicator: 'Revenue Decline', message: `YoY revenue declined by ${growth.revenueGrowth}%` });
            }
        }

        if (growth?.earningsGrowth !== null) {
            if (growth.earningsGrowth >= ANALYSIS_CONFIG.growth.strong) {
                breakdown.growth.points += 12;
                positiveSignals.push({ category: 'GROWTH', indicator: 'Earnings Growth', message: `Strong YoY earnings growth of +${growth.earningsGrowth}%` });
            } else if (growth.earningsGrowth >= ANALYSIS_CONFIG.growth.positive) {
                breakdown.growth.points += 6;
            } else {
                warningSignals.push({ category: 'GROWTH', indicator: 'Earnings Decline', message: `YoY earnings contracted by ${growth.earningsGrowth}%` });
            }
        }

        // Profitability (Max: 25)
        if (profitability?.roe !== null) {
            if (profitability.roe >= ANALYSIS_CONFIG.profitability.roeStrong) {
                breakdown.profitability.points += 13;
                positiveSignals.push({ category: 'PROFITABILITY', indicator: 'ROE', message: `Strong Return on Equity (ROE) of ${profitability.roe}%` });
            } else if (profitability.roe >= ANALYSIS_CONFIG.profitability.roeModerate) {
                breakdown.profitability.points += 8;
                positiveSignals.push({ category: 'PROFITABILITY', indicator: 'ROE', message: `Healthy Return on Equity (ROE) of ${profitability.roe}%` });
            } else if (profitability.roe < 0) {
                warningSignals.push({ category: 'PROFITABILITY', indicator: 'Negative ROE', message: `Return on Equity is negative (${profitability.roe}%)` });
            }
        }

        if (profitability?.operatingMargin !== null && profitability?.operatingMargin >= ANALYSIS_CONFIG.profitability.operatingMarginStrong) {
            breakdown.profitability.points += 12;
            positiveSignals.push({ category: 'PROFITABILITY', indicator: 'Operating Margin', message: `Strong operating margin of ${profitability.operatingMargin}%` });
        } else if (profitability?.operatingMargin !== null) {
            breakdown.profitability.points += 6;
        }

        // Financial Health (Max: 20)
        if (financialHealth?.debtToEquity !== null) {
            if (financialHealth.debtToEquity <= ANALYSIS_CONFIG.financialHealth.debtToEquityLow) {
                breakdown.financialHealth.points += 12;
                positiveSignals.push({ category: 'FINANCIAL_HEALTH', indicator: 'Low Leverage', message: `Conservative debt-to-equity ratio of ${financialHealth.debtToEquity}` });
            } else if (financialHealth.debtToEquity <= ANALYSIS_CONFIG.financialHealth.debtToEquityModerate) {
                breakdown.financialHealth.points += 7;
            } else {
                warningSignals.push({ category: 'FINANCIAL_HEALTH', indicator: 'High Leverage', message: `Higher leverage with debt-to-equity ratio of ${financialHealth.debtToEquity}` });
            }
        }

        if (financialHealth?.currentRatio !== null && financialHealth.currentRatio >= ANALYSIS_CONFIG.financialHealth.currentRatioHealthy) {
            breakdown.financialHealth.points += 8;
            positiveSignals.push({ category: 'FINANCIAL_HEALTH', indicator: 'Current Ratio', message: `Healthy liquidity with current ratio of ${financialHealth.currentRatio}` });
        }
    }

    const fundamentalScore = Math.round(
        breakdown.valuation.points + breakdown.growth.points + breakdown.profitability.points + breakdown.financialHealth.points
    );

    // ==========================================
    // 3. OVERALL SCORE (50% Tech, 50% Fund)
    // ==========================================
    const overallScore = Math.round(
        technicalScore * ANALYSIS_CONFIG.weights.overall.technical +
        fundamentalScore * ANALYSIS_CONFIG.weights.overall.fundamental
    );

    let classification = 'Neutral';
    if (overallScore >= ANALYSIS_CONFIG.scoreClassifications.strong.min) classification = 'Strong';
    else if (overallScore >= ANALYSIS_CONFIG.scoreClassifications.positive.min) classification = 'Positive';
    else if (overallScore >= ANALYSIS_CONFIG.scoreClassifications.neutral.min) classification = 'Neutral';
    else if (overallScore >= ANALYSIS_CONFIG.scoreClassifications.weak.min) classification = 'Weak';
    else classification = 'Very Weak';

    // ==========================================
    // 4. RISK SCORE CALCULATION (0-100)
    // ==========================================
    let riskPoints = 0;

    // Debt/Equity risk
    if (fundamentalData?.financialHealth?.debtToEquity !== null) {
        const de = fundamentalData.financialHealth.debtToEquity;
        if (de > 1.5) riskPoints += 30;
        else if (de > 1.0) riskPoints += 20;
        else if (de > 0.5) riskPoints += 10;
    }

    // 52-Week High Drawdown risk
    if (fundamentalData?.market?.distanceFrom52WHigh !== null) {
        const distHigh = Math.abs(fundamentalData.market.distanceFrom52WHigh);
        if (distHigh > 35) riskPoints += 25;
        else if (distHigh > 20) riskPoints += 15;
        else if (distHigh > 10) riskPoints += 5;
    }

    // Negative Earnings risk
    if (fundamentalData?.profitability?.eps !== null && fundamentalData.profitability.eps <= 0) {
        riskPoints += 25;
        warningSignals.push({ category: 'RISK', indicator: 'Earnings Deficit', message: 'Company is reporting un-profitable net income' });
    }

    // ATR Volatility risk
    if (technicalData?.volatility?.atr && technicalData?.price) {
        const atrPct = (technicalData.volatility.atr / technicalData.price) * 100;
        if (atrPct > 3.5) riskPoints += 20;
        else if (atrPct > 2.0) riskPoints += 10;
    }

    const riskScore = Math.min(100, Math.max(0, Math.round(riskPoints)));

    let riskLabel = 'Moderate Risk';
    if (riskScore <= ANALYSIS_CONFIG.riskClassifications.low.max) riskLabel = ANALYSIS_CONFIG.riskClassifications.low.label;
    else if (riskScore <= ANALYSIS_CONFIG.riskClassifications.moderate.max) riskLabel = ANALYSIS_CONFIG.riskClassifications.moderate.label;
    else if (riskScore <= ANALYSIS_CONFIG.riskClassifications.high.max) riskLabel = ANALYSIS_CONFIG.riskClassifications.high.label;
    else riskLabel = ANALYSIS_CONFIG.riskClassifications.veryHigh.label;

    return {
        technicalScore,
        fundamentalScore,
        overallScore,
        riskScore,
        classification,
        riskLabel,
        positiveSignals,
        warningSignals,
        scoreBreakdown: breakdown
    };
}

module.exports = {
    evaluateStockSignals
};
