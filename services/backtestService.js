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

/**
 * 3-Minute Opening Range Breakout (ORB) Intraday Backtest Engine
 * Rules:
 * 1. 9:15-9:18 candle defines OR High and OR Low.
 * 2. BUY: Break OR High -> Retest OR High -> Hold (close >= OR High) -> BUY. Stop = OR Low, Target = +1%.
 * 3. SELL: Break OR Low -> Retest OR Low -> Hold (close <= OR Low) -> SELL (Short). Stop = OR High, Target = -1%.
 * 4. Max 1 trade per stock per day.
 * 5. Strict Intraday: Exits by EOD if neither stop nor target is hit.
 * 6. Conservative Same-Candle Ambiguity: Stop-loss is considered hit first.
 */
function runOrbBacktest(bars3m, settings = {}) {
    const config = { ...defaults, ...settings };
    const initialCapital = config.initialCapital || 100000;
    const allocationPercent = config.allocationPercent || 1;
    const brokerageBps = config.brokerageBps || 10;
    const slippageBps = config.slippageBps || 5;

    if (!Array.isArray(bars3m) || bars3m.length < 2) {
        throw new Error('At least one full day of 3-minute candles is required for the ORB backtest');
    }

    let cash = initialCapital;
    let peakEquity = cash;
    let maxDrawdown = 0;
    const trades = [];
    const equityCurve = [];

    // Group candles by trading day
    const dayMap = new Map();
    for (const b of bars3m) {
        const d = new Date(b.date);
        const istMs = d.getTime() + 5.5 * 3600 * 1000;
        const dayKey = b.day || new Date(istMs).toISOString().slice(0, 10);
        if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
        dayMap.get(dayKey).push(b);
    }

    for (const [, dayCandles] of dayMap.entries()) {
        if (dayCandles.length < 2) continue;

        // First 3m candle: 9:15 - 9:18 AM
        const orCandle = dayCandles[0];
        const orHigh = orCandle.high;
        const orLow = orCandle.low;

        let brokenHigh = false;
        let brokenLow = false;
        let tradeTakenToday = false;
        let position = null;

        for (let i = 1; i < dayCandles.length; i++) {
            const candle = dayCandles[i];
            const isLastCandleOfDay = (i === dayCandles.length - 1) || (candle.bucketIndex != null && candle.bucketIndex >= 120);

            // 1. Manage open position
            if (position) {
                if (position.side === 'BUY') {
                    const hitStop = candle.low <= position.stopLoss;
                    const hitTarget = candle.high >= position.target;

                    if (hitStop && hitTarget) {
                        // Conservative assumption: Stop-loss is considered hit first
                        exitTrade(candle, position.stopLoss, 'STOP_LOSS');
                    } else if (hitStop) {
                        exitTrade(candle, position.stopLoss, 'STOP_LOSS');
                    } else if (hitTarget) {
                        exitTrade(candle, position.target, 'TARGET');
                    } else if (isLastCandleOfDay) {
                        exitTrade(candle, candle.close, 'INTRADAY_EOD');
                    }
                } else if (position.side === 'SELL') {
                    const hitStop = candle.high >= position.stopLoss;
                    const hitTarget = candle.low <= position.target;

                    if (hitStop && hitTarget) {
                        // Conservative assumption: Stop-loss is considered hit first
                        exitTrade(candle, position.stopLoss, 'STOP_LOSS');
                    } else if (hitStop) {
                        exitTrade(candle, position.stopLoss, 'STOP_LOSS');
                    } else if (hitTarget) {
                        exitTrade(candle, position.target, 'TARGET');
                    } else if (isLastCandleOfDay) {
                        exitTrade(candle, candle.close, 'INTRADAY_EOD');
                    }
                }
            } else if (!tradeTakenToday) {
                // 2. Check for entry setups if no trade taken yet today
                if (candle.high > orHigh) brokenHigh = true;
                if (candle.low < orLow) brokenLow = true;

                if (brokenHigh && !brokenLow) {
                    // BUY: Price pulls back to retest OR High and holds (candle.close >= OR High)
                    if (candle.low <= orHigh && candle.close >= orHigh) {
                        enterTrade(candle, 'BUY', orLow, candle.close * 1.01);
                    }
                } else if (brokenLow && !brokenHigh) {
                    // SELL: Price pulls back to retest OR Low and holds as resistance (candle.close <= OR Low)
                    if (candle.high >= orLow && candle.close <= orLow) {
                        enterTrade(candle, 'SELL', orHigh, candle.close * 0.99);
                    }
                }
            }

            // Calculate current equity
            const unrealizedPnl = position ? (
                position.side === 'BUY'
                    ? position.quantity * (candle.close - position.entryPrice)
                    : position.quantity * (position.entryPrice - candle.close)
            ) : 0;
            const currentEquity = money(cash + (position ? (position.side === 'BUY' ? position.quantity * candle.close : unrealizedPnl) : 0));
            peakEquity = Math.max(peakEquity, currentEquity);
            const drawdownPercent = percent(currentEquity - peakEquity, peakEquity);
            maxDrawdown = Math.min(maxDrawdown, drawdownPercent);

            if (isLastCandleOfDay) {
                equityCurve.push({
                    date: candle.date,
                    equity: currentEquity,
                    cash: money(cash),
                    positionValue: 0,
                    drawdownPercent
                });
            }
        }

        function enterTrade(candle, side, stopLoss, target) {
            const rawPrice = candle.close;
            const fillPrice = side === 'BUY'
                ? rawPrice * (1 + slippageBps / 10000)
                : rawPrice * (1 - slippageBps / 10000);

            const quantity = Math.floor((cash * allocationPercent) / (fillPrice * (1 + brokerageBps / 10000)));
            if (quantity < 1) return;

            const entryFees = quantity * fillPrice * brokerageBps / 10000;
            if (side === 'BUY') {
                cash = money(cash - quantity * fillPrice - entryFees);
            } else {
                cash = money(cash - entryFees);
            }

            position = {
                side,
                entryDate: candle.date,
                entryPrice: fillPrice,
                quantity,
                entryFees,
                stopLoss,
                target,
                orHigh,
                orLow,
                entryReason: [
                    side === 'BUY'
                        ? `Price broke OR High (₹${orHigh.toFixed(2)}), retested & held at ₹${rawPrice.toFixed(2)}`
                        : `Price broke OR Low (₹${orLow.toFixed(2)}), retested & rejected at ₹${rawPrice.toFixed(2)}`
                ]
            };
            tradeTakenToday = true;
        }

        function exitTrade(candle, rawPrice, exitReason) {
            const fillPrice = position.side === 'BUY'
                ? rawPrice * (1 - slippageBps / 10000)
                : rawPrice * (1 + slippageBps / 10000);

            const gross = position.quantity * fillPrice;
            const exitFees = gross * brokerageBps / 10000;

            let pnl = 0;
            if (position.side === 'BUY') {
                pnl = gross - exitFees - (position.quantity * position.entryPrice) - position.entryFees;
                cash = money(cash + gross - exitFees);
            } else {
                const tradeDiff = (position.entryPrice - fillPrice) * position.quantity;
                pnl = tradeDiff - exitFees - position.entryFees;
                cash = money(cash + tradeDiff - exitFees);
            }

            const invested = position.quantity * position.entryPrice + position.entryFees;
            const returnPercent = percent(pnl, invested);
            const holdingMinutes = Math.max(3, Math.round((new Date(candle.date) - new Date(position.entryDate)) / 60000));

            trades.push({
                symbol: settings.symbol || null,
                side: position.side,
                entryDate: position.entryDate,
                exitDate: candle.date,
                entryPrice: money(position.entryPrice),
                exitPrice: money(fillPrice),
                quantity: position.quantity,
                entryFees: money(position.entryFees),
                exitFees: money(exitFees),
                pnl: money(pnl),
                returnPercent,
                holdingDays: 1,
                holdingMinutes,
                exitReason,
                entryReason: position.entryReason
            });

            position = null;
        }
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

    let currentStreak = 0;
    let maxLosingStreak = 0;
    for (const t of trades) {
        if (t.pnl <= 0) {
            currentStreak++;
            maxLosingStreak = Math.max(maxLosingStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    }

    const avgProfit = wins.length ? money(grossProfit / wins.length) : 0;
    const avgLoss = losses.length ? money(grossLoss / losses.length) : 0;
    const riskRewardRatio = avgLoss > 0 ? money(avgProfit / avgLoss) : (avgProfit > 0 ? null : 0);

    return {
        strategy: 'OPENING_RANGE_BREAKOUT_3M_V1',
        strategyName: config.strategies.OPENING_RANGE_BREAKOUT_3M_V1?.name || '3-Minute Opening Range Breakout (ORB)',
        initialCapital,
        finalEquity: money(cash),
        cash: money(cash),
        totalReturn: percent(cash - initialCapital, initialCapital),
        totalTrades: trades.length,
        buySignals: trades.filter(t => t.side === 'BUY').length,
        sellSignals: trades.filter(t => t.side === 'SELL').length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate: trades.length ? percent(wins.length, trades.length) : 0,
        averageReturn: trades.length ? money(trades.reduce((s, t) => s + t.returnPercent, 0) / trades.length) : 0,
        averageProfit: avgProfit,
        averageLoss: avgLoss,
        riskRewardRatio,
        losingStreak: maxLosingStreak,
        averageHoldingPeriod: 1,
        maxDrawdown: money(maxDrawdown),
        profitFactor: grossLoss ? money(grossProfit / grossLoss) : (grossProfit > 0 ? null : 0),
        totalFees: money(trades.reduce((s, t) => s + t.entryFees + t.exitFees, 0)),
        trades,
        equityCurve
    };
}

/** Sequential long-only daily simulation: signals use close, fills use next opening price. */
function runDailyBacktest(bars, settings = {}) {
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
        position = { side: 'BUY', entryDate: bar.date, entryPrice: fillPrice, quantity, entryFees, stop: signal.hypotheticalSetup?.stop || null, target: signal.hypotheticalSetup?.target || null, entryReason: signal.rationale?.positive || [] };
    };
    const sell = (bar, exitReason, rawPrice = bar.open) => {
        const exitPrice = rawPrice * (1 - config.slippageBps / 10000), gross = position.quantity * exitPrice;
        const exitFees = gross * config.brokerageBps / 10000, pnl = gross - exitFees - position.quantity * position.entryPrice - position.entryFees;
        cash = money(cash + gross - exitFees);
        trades.push({ symbol: settings.symbol || null, side: 'BUY', entryDate: position.entryDate, exitDate: bar.date, entryPrice: money(position.entryPrice), exitPrice: money(exitPrice), quantity: position.quantity, entryFees: money(position.entryFees), exitFees: money(exitFees), pnl: money(pnl), returnPercent: percent(pnl, position.quantity * position.entryPrice + position.entryFees), holdingDays: Math.max(1, Math.round((new Date(bar.date) - new Date(position.entryDate)) / 86400000)), exitReason, entryReason: position.entryReason });
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
    const avgProfit = wins.length ? money(grossProfit / wins.length) : 0;
    const avgLoss = losses.length ? money(grossLoss / losses.length) : 0;
    const riskRewardRatio = avgLoss > 0 ? money(avgProfit / avgLoss) : (avgProfit > 0 ? null : 0);

    let currentStreak = 0;
    let maxLosingStreak = 0;
    for (const t of trades) {
        if (t.pnl <= 0) {
            currentStreak++;
            maxLosingStreak = Math.max(maxLosingStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    }

    return { strategy: strategyKey, strategyName: config.strategies[strategyKey].name, initialCapital: config.initialCapital, finalEquity: money(cash), cash: money(cash), totalReturn: percent(cash - config.initialCapital, config.initialCapital), totalTrades: trades.length, buySignals: trades.length, sellSignals: trades.filter(t => t.exitReason === 'SELL_SIGNAL').length, winningTrades: wins.length, losingTrades: losses.length, winRate: trades.length ? percent(wins.length, trades.length) : 0, averageReturn: trades.length ? money(trades.reduce((s, t) => s + t.returnPercent, 0) / trades.length) : 0, averageProfit: avgProfit, averageLoss: avgLoss, riskRewardRatio, losingStreak: maxLosingStreak, averageHoldingPeriod: trades.length ? money(trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length) : 0, maxDrawdown: money(maxDrawdown), profitFactor: grossLoss ? money(grossProfit / grossLoss) : grossProfit > 0 ? null : 0, totalFees: money(trades.reduce((s, t) => s + t.entryFees + t.exitFees, 0)), trades, equityCurve };
}

function runBacktest(bars, settings = {}) {
    const strategyKey = settings.strategyKey || 'TREND_MOMENTUM_BREAKOUT_V1';
    if (strategyKey === 'OPENING_RANGE_BREAKOUT_3M_V1') {
        return runOrbBacktest(bars, settings);
    }
    return runDailyBacktest(bars, settings);
}

module.exports = { runBacktest, runOrbBacktest, runDailyBacktest, meanReversionSignal, signalForStrategy };

