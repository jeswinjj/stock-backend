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

// Test 3: 3-Minute Opening Range Breakout (ORB) Intraday Backtest
// Day 1: BUY Setup (OR High = 1000, OR Low = 980, Break > 1000, Retest low 995 hold close 1005 -> Target 1% hit at 1016)
const d1 = '2026-09-01';
const orbDay1 = [
    { day: d1, bucketIndex: 0, date: new Date('2026-09-01T03:45:00.000Z'), open: 990, high: 1000, low: 980, close: 995, volume: 5000 }, // 9:15-9:18
    { day: d1, bucketIndex: 1, date: new Date('2026-09-01T03:48:00.000Z'), open: 996, high: 1008, low: 994, close: 1004, volume: 6000 }, // Break high
    { day: d1, bucketIndex: 2, date: new Date('2026-09-01T03:51:00.000Z'), open: 1004, high: 1006, low: 998, close: 1002, volume: 4000 }, // Retest & hold -> BUY entry
    { day: d1, bucketIndex: 3, date: new Date('2026-09-01T03:54:00.000Z'), open: 1003, high: 1020, low: 1001, close: 1018, volume: 7000 }, // Target hit (+1%)
    { day: d1, bucketIndex: 120, date: new Date('2026-09-01T09:45:00.000Z'), open: 1018, high: 1019, low: 1015, close: 1016, volume: 3000 } // EOD
];

// Day 2: SELL Setup (OR High = 1020, OR Low = 1000, Break < 1000, Retest high 1002 hold close 996 -> Target -1% hit at 985)
const d2 = '2026-09-02';
const orbDay2 = [
    { day: d2, bucketIndex: 0, date: new Date('2026-09-02T03:45:00.000Z'), open: 1010, high: 1020, low: 1000, close: 1005, volume: 5000 },
    { day: d2, bucketIndex: 1, date: new Date('2026-09-02T03:48:00.000Z'), open: 1004, high: 1005, low: 992, close: 994, volume: 6000 }, // Break low
    { day: d2, bucketIndex: 2, date: new Date('2026-09-02T03:51:00.000Z'), open: 994, high: 1001, low: 993, close: 996, volume: 4000 }, // Retest & reject -> SELL entry
    { day: d2, bucketIndex: 3, date: new Date('2026-09-02T03:54:00.000Z'), open: 995, high: 997, low: 980, close: 982, volume: 7000 }, // Target hit (-1%)
    { day: d2, bucketIndex: 120, date: new Date('2026-09-02T09:45:00.000Z'), open: 982, high: 985, low: 980, close: 983, volume: 3000 } // EOD
];

// Day 3: Conservative Same-Candle Ambiguity (both SL and Target reached in candle 3 -> SL hit first)
const d3 = '2026-09-03';
const orbDay3 = [
    { day: d3, bucketIndex: 0, date: new Date('2026-09-03T03:45:00.000Z'), open: 1000, high: 1010, low: 990, close: 1000, volume: 5000 },
    { day: d3, bucketIndex: 1, date: new Date('2026-09-03T03:48:00.000Z'), open: 1002, high: 1015, low: 1001, close: 1012, volume: 6000 }, // Break high
    { day: d3, bucketIndex: 2, date: new Date('2026-09-03T03:51:00.000Z'), open: 1011, high: 1013, low: 1008, close: 1011, volume: 4000 }, // Retest & hold -> BUY entry
    { day: d3, bucketIndex: 3, date: new Date('2026-09-03T03:54:00.000Z'), open: 1010, high: 1030, low: 985, close: 1025, volume: 8000 }, // Spikes both Target & SL -> SL hit
    { day: d3, bucketIndex: 120, date: new Date('2026-09-03T09:45:00.000Z'), open: 1025, high: 1026, low: 1020, close: 1022, volume: 3000 }
];

const orbBars = [...orbDay1, ...orbDay2, ...orbDay3];
const orbResult = runBacktest(orbBars, { symbol: 'ORB_TEST', strategyKey: 'OPENING_RANGE_BREAKOUT_3M_V1' });

assert(orbResult.strategy === 'OPENING_RANGE_BREAKOUT_3M_V1', 'Must use ORB strategy key');
assert(orbResult.totalTrades === 3, 'Must take exactly 1 trade per day for 3 days');
assert(orbResult.trades[0].side === 'BUY', 'Day 1 trade must be BUY');
assert(orbResult.trades[0].exitReason === 'TARGET', 'Day 1 trade must hit TARGET');
assert(orbResult.trades[1].side === 'SELL', 'Day 2 trade must be SELL (Short)');
assert(orbResult.trades[1].exitReason === 'TARGET', 'Day 2 trade must hit TARGET');
assert(orbResult.trades[2].side === 'BUY', 'Day 3 trade must be BUY');
assert(orbResult.trades[2].exitReason === 'STOP_LOSS', 'Day 3 trade must trigger conservative STOP_LOSS under same-candle ambiguity');
assert(orbResult.winningTrades === 2, 'Must have 2 winning trades');
assert(orbResult.losingTrades === 1, 'Must have 1 losing trade');
assert(orbResult.winRate > 60, 'Win rate must be 66.67%');
assert(orbResult.losingStreak === 1, 'Max losing streak must be 1');
assert(orbResult.equityCurve.length === 3, 'Equity curve must have points for each day session');

console.log('All daily & 3m ORB backtest tests passed successfully');

