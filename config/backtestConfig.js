module.exports = {
    initialCapital: 100000,
    allocationPercent: 1,
    brokerageBps: 10,
    slippageBps: 5,
    minimumBars: 200,
    strategies: {
        TREND_MOMENTUM_BREAKOUT_V1: {
            name: 'Trend + Momentum + Breakout',
            description: 'Buys only when the existing prediction engine has multiple bullish confirmations.'
        },
        MEAN_REVERSION_SUPPORT_V1: {
            name: 'Mean Reversion + Support',
            description: 'Buys an oversold bullish reversal close to a confirmed support zone.'
        }
    }
};
