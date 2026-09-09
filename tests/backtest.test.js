const { runBacktest } = require('../services/backtestService');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const bars = Array.from({ length: 270 }, (_, index) => {
    const close = 100 + index * .6 + Math.sin(index / 5) * 2;
    return { date: new Date(2024, 0, index + 1), open: close - .2, high: close + 1.5, low: close - 1.5, close, volume: 100000 + (index % 7) * 3000 };
});
const result = runBacktest(bars, { symbol: 'TEST' });
assert(result.initialCapital === 100000, 'Default virtual capital must be ₹1,00,000');
assert(Number.isFinite(result.finalEquity), 'Final equity must be finite');
assert(result.maxDrawdown <= 0, 'Drawdown must not be positive');
assert(result.totalTrades === result.trades.length, 'Trade count must match audit log');
assert(result.equityCurve.length > 0, 'Backtest must create a sequential equity curve');
const meanReversion = runBacktest(bars, { symbol: 'TEST', strategyKey: 'MEAN_REVERSION_SUPPORT_V1' });
assert(meanReversion.strategy === 'MEAN_REVERSION_SUPPORT_V1', 'Second portfolio must use the mean-reversion strategy');
assert(Number.isFinite(meanReversion.finalEquity), 'Second strategy must produce a finite portfolio value');
result.trades.forEach(trade => assert(new Date(trade.exitDate) > new Date(trade.entryDate), 'Trades must execute after the signal/entry day'));
let rejected = false;
try { runBacktest(bars.slice(0, 200)); } catch { rejected = true; }
assert(rejected, 'Insufficient history must be rejected');
console.log('Backtest tests passed');
