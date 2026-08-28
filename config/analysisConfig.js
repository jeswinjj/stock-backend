/**
 * Analysis & Signal Engine Configuration
 * Centralized weights, score thresholds, and indicator parameters.
 */

const ANALYSIS_CONFIG = {
    // Scoring Weights
    weights: {
        overall: {
            technical: 0.50,
            fundamental: 0.50
        },
        technical: {
            trend: 30,
            momentum: 25,
            volatility: 10,
            volume: 10
        },
        fundamental: {
            valuation: 30,
            growth: 25,
            profitability: 25,
            financialHealth: 20
        }
    },

    // Thresholds & Classification Rules
    scoreClassifications: {
        strong: { min: 80, label: 'Strong' },
        positive: { min: 65, label: 'Positive' },
        neutral: { min: 50, label: 'Neutral' },
        weak: { min: 35, label: 'Weak' },
        veryWeak: { min: 0, label: 'Very Weak' }
    },

    riskClassifications: {
        low: { max: 25, label: 'Low Risk' },
        moderate: { max: 50, label: 'Moderate Risk' },
        high: { max: 75, label: 'High Risk' },
        veryHigh: { max: 100, label: 'Very High Risk' }
    },

    // Technical Thresholds
    rsi: {
        oversold: 30,
        bullishMin: 50,
        overbought: 70
    },

    relativeVolume: {
        high: 1.5,
        aboveAverage: 1.0,
        low: 0.75
    },

    // Fundamental Thresholds
    valuation: {
        peLow: 15,
        peModerate: 25,
        peHigh: 40,
        pegGood: 1.0,
        pbModerate: 3.0
    },

    growth: {
        strong: 15,      // >15% YoY
        moderate: 5,     // 5-15% YoY
        positive: 0
    },

    profitability: {
        roeStrong: 15,    // >15%
        roeModerate: 10,  // 10-15%
        operatingMarginStrong: 15,
        profitMarginStrong: 10
    },

    financialHealth: {
        debtToEquityLow: 0.5,
        debtToEquityModerate: 1.0,
        currentRatioHealthy: 1.2
    },

    // Cache TTL in seconds (24 hours = 86400s)
    cacheTTL: 86400
};

module.exports = ANALYSIS_CONFIG;
