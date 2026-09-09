const { generatePrediction, detectSwingLows, clusterSupportLevels } = require('./stockPredictionService');
const { calculateRSI, calculateATR } = require('./technicalAnalysisService');
const defaults = require('../config/backtestConfig');

const money = value => Number((value || 0).toFixed(2));
const percent = (value, base) => base ? Number((value / base * 100).toFixed(2)) : 0;

function meanReversionSignal(bars, index) {
    const visible = bars.slice(0, index + 1), current = visible.at(-1);
    if (visible.length < defaults.minimumBars) return { error: 'INSUFFICIENT_HISTORY' };
    const rsi = calculateRSI(visible, 14).at(-1);
    const atr = calculateATR(visible, 14).at(-1);
    const supports = clusterSupportLevels(detectSwingLows(visible), visible, current.close)
        .filter(level => level.price < current.close).sort((a, b) => b.price - a.price);
    const support = supports[0];
    const nearSupport = support && ((current.close - support.price) / support.price) <= 0.03;
    if (rsi != null && rsi <= 35 && nearSupport && current.close > current.open) {
        return {
            prediction: { recommendation: 'BUY' },
            rationale: { positive: [`RSI is oversold at ${rsi}.`, `Bullish reversal candle is within 3% of support at ${support.price}.`] },
            hypotheticalSetup: { stop: Math.min(support.low, support.price - (atr || 0)), target: current.close + Math.max((current.close - support.price) * 2, atr ? atr * 2 : 0) }
        };
    }
    if (rsi != null && rsi >= 60) return { prediction: { recommendation: 'SELL' }, rationale: { positive: [] } };
    return { prediction: { recommendation: 'HOLD' }, rationale: { positive: [] } };
}

function signalForStrategy(strategyKey, bars, index) {
    return strategyKey === 'MEAN_REVERSION_SUPPORT_V1' ? meanReversionSignal(bars, index) : generatePrediction(bars, index);
}

/** Sequential long-only simulation: signals use close, fills use next opening price. */
function runBacktest(bars, settings = {}) {
    const config = { ...defaults, ...settings };
    const strategyKey = settings.strategyKey || 'TREND_MOMENTUM_BREAKOUT_V1';
    if (!config.strategies[strategyKey]) throw new Error('Unsupported paper-trading strategy');
    if (!Array.isArray(bars) || bars.length < config.minimumBars + 1) throw new Error(`At least ${config.minimumBars + 1} daily candles are required for a backtest`);
    let cash = config.initialCapital, position = null, peakEquity = cash, maxDrawdown = 0;
    const trades = [], equityCurve = [];
    const buy = (bar, signal) => {
        const fillPrice = bar.open * (1 + config.slippageBps / 10000);
        const quantity = Math.floor((cash * config.allocationPercent) / (fillPrice * (1 + config.brokerageBps / 10000)));
        if (quantity < 1) return;
        const entryFees = quantity * fillPrice * config.brokerageBps / 10000;
        cash = money(cash - quantity * fillPrice - entryFees);
        position = { entryDate: bar.date, entryPrice: fillPrice, quantity, entryFees, stop: signal.hypotheticalSetup?.stop || null, target: signal.hypotheticalSetup?.target || null, entryReason: signal.rationale?.positive || [] };
    };
    const sell = (bar, exitReason, rawPrice = bar.open) => {
        const exitPrice = rawPrice * (1 - config.slippageBps / 10000), gross = position.quantity * exitPrice;
        const exitFees = gross * config.brokerageBps / 10000, pnl = gross - exitFees - position.quantity * position.entryPrice - position.entryFees;
        cash = money(cash + gross - exitFees);
        trades.push({ symbol: settings.symbol || null, entryDate: position.entryDate, exitDate: bar.date, entryPrice: money(position.entryPrice), exitPrice: money(exitPrice), quantity: position.quantity, entryFees: money(position.entryFees), exitFees: money(exitFees), pnl: money(pnl), returnPercent: percent(pnl, position.quantity * position.entryPrice + position.entryFees), holdingDays: Math.max(1, Math.round((new Date(bar.date) - new Date(position.entryDate)) / 86400000)), exitReason, entryReason: position.entryReason });
        position = null;
    };
    for (let i = config.minimumBars - 1; i < bars.length - 1; i++) {
        const signal = signalForStrategy(strategyKey, bars, i), next = bars[i + 1];
        if (signal.error) continue;
        if (position) {
            if (position.stop && next.low <= position.stop) sell(next, 'STOP_LOSS', position.stop);
            else if (position.target && next.high >= position.target) sell(next, 'TARGET', position.target);
            else if (signal.prediction.recommendation === 'SELL') sell(next, 'SELL_SIGNAL');
        } else if (signal.prediction.recommendation === 'BUY') buy(next, signal);
        const equity = money(cash + (position ? position.quantity * next.close : 0));
        peakEquity = Math.max(peakEquity, equity); maxDrawdown = Math.min(maxDrawdown, percent(equity - peakEquity, peakEquity));
        equityCurve.push({ date: next.date, equity, cash, positionValue: position ? position.quantity * next.close : 0, drawdownPercent: percent(equity - peakEquity, peakEquity) });
    }
    if (position) sell(bars.at(-1), 'END_OF_TEST', bars.at(-1).close);
    const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0), grossProfit = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    return { strategy: strategyKey, strategyName: config.strategies[strategyKey].name, initialCapital: config.initialCapital, finalEquity: money(cash), cash: money(cash), totalReturn: percent(cash - config.initialCapital, config.initialCapital), totalTrades: trades.length, buySignals: trades.length, sellSignals: trades.filter(t => t.exitReason === 'SELL_SIGNAL').length, winningTrades: wins.length, losingTrades: losses.length, winRate: trades.length ? percent(wins.length, trades.length) : 0, averageReturn: trades.length ? money(trades.reduce((s, t) => s + t.returnPercent, 0) / trades.length) : 0, averageHoldingPeriod: trades.length ? money(trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length) : 0, maxDrawdown: money(maxDrawdown), profitFactor: grossLoss ? money(grossProfit / grossLoss) : grossProfit > 0 ? null : 0, totalFees: money(trades.reduce((s, t) => s + t.entryFees + t.exitFees, 0)), trades, equityCurve };
}
module.exports = { runBacktest, meanReversionSignal, signalForStrategy };
