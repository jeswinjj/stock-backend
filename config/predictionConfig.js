/** Central configuration for the deterministic, backtest-ready prediction engine. */
module.exports = {
    minimumBars: 200,
    emaPeriods: { short: 20, medium: 50, long: 200 },
    rsi: { period: 14, oversold: 30, positive: 50, overbought: 70 },
    macd: { fast: 12, slow: 26, signal: 9 },
    atrPeriod: 14,
    volume: { period: 20, high: 1.5, veryHigh: 2, low: 0.75 },
    swingLookback: 2,
    clusterPercent: 0.01,
    structureLookback: 80,
    breakoutConfirmationVolume: 1.5,
    nearbyLevelPercent: 0.01,
    patternTolerancePercent: 0.02,
    score: { trend: 25, momentum: 20, volume: 10, breakout: 20, structure: 15, pattern: 10 },
    thresholds: { bullish: 60, neutral: 45, bearish: 30 },
    minimumConfirmations: 2,
    minimumRiskReward: 1.2
};
