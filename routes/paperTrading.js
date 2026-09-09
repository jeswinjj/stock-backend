const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PaperPortfolio = require('../models/PaperPortfolio');
const PaperBacktestRun = require('../models/PaperBacktestRun');
const { getHistoricalOHLCV } = require('../services/marketDataService');
const { runBacktest } = require('../services/backtestService');
const config = require('../config/backtestConfig');

let indexesReady = false;
let indexesPromise = null;
async function ensureIndexes() {
    if (indexesReady) return;
    if (!indexesPromise) {
        indexesPromise = (async () => {
            // Migrates the original one-portfolio-per-user index without deleting user data.
            await PaperPortfolio.collection.dropIndex('userId_1').catch(err => { if (err.codeName !== 'IndexNotFound' && err.code !== 27) throw err; });
            const indexes = await PaperPortfolio.collection.indexes();
            const strategyIndex = indexes.find(index => index.key.userId === 1 && index.key.strategyKey === 1);
            if (!strategyIndex) {
                await PaperPortfolio.collection.createIndex({ userId: 1, strategyKey: 1 }, { unique: true });
            } else if (!strategyIndex.unique) {
                await PaperPortfolio.collection.dropIndex(strategyIndex.name);
                await PaperPortfolio.collection.createIndex({ userId: 1, strategyKey: 1 }, { unique: true });
            }
            indexesReady = true;
        })().catch(err => {
            indexesPromise = null;
            throw err;
        });
    }
    return indexesPromise;
}
async function getPortfolio(userId, strategyKey) {
    await ensureIndexes();
    return PaperPortfolio.findOneAndUpdate(
        { userId, strategyKey },
        { $setOnInsert: { userId, strategyKey, name: config.strategies[strategyKey].name, initialCapital: config.initialCapital, cash: config.initialCapital, finalEquity: config.initialCapital } },
        { returnDocument: 'after', upsert: true }
    );
}
async function portfolioView(userId, strategyKey) {
    const portfolio = await getPortfolio(userId, strategyKey);
    const latestRun = portfolio.latestRun ? await PaperBacktestRun.findById(portfolio.latestRun).lean() : null;
    return { portfolio, latestRun, strategy: { key: strategyKey, ...config.strategies[strategyKey] } };
}

router.get('/portfolios', auth, async (req, res) => {
    try {
        const portfolios = await Promise.all(Object.keys(config.strategies).map(key => portfolioView(req.user.id, key)));
        res.json({ portfolios });
    } catch (err) { res.status(500).json({ error: 'Unable to load paper portfolios', details: err.message }); }
});
router.get('/portfolio', auth, async (req, res) => {
    try { res.json(await portfolioView(req.user.id, 'TREND_MOMENTUM_BREAKOUT_V1')); }
    catch (err) { res.status(500).json({ error: 'Unable to load paper portfolio', details: err.message }); }
});

router.post('/backtest', auth, async (req, res) => {
    try {
        const symbol = req.body.symbol?.trim().toUpperCase();
        const strategyKey = req.body.strategyKey || 'TREND_MOMENTUM_BREAKOUT_V1';
        if (!symbol) return res.status(400).json({ error: 'A stock symbol is required' });
        if (!config.strategies[strategyKey]) return res.status(400).json({ error: 'Unsupported paper-trading strategy' });
        const portfolio = await getPortfolio(req.user.id, strategyKey);
        const bars = await getHistoricalOHLCV(symbol, '1D', null, null, '5Y');
        const result = runBacktest(bars, { symbol, strategyKey, initialCapital: portfolio.initialCapital });
        const run = await PaperBacktestRun.create({ userId: req.user.id, portfolioId: portfolio._id, symbol, ...result });
        portfolio.cash = result.cash; portfolio.finalEquity = result.finalEquity; portfolio.latestRun = run._id; portfolio.updatedAt = new Date();
        await portfolio.save();
        res.status(201).json({ portfolio, run, strategy: { key: strategyKey, ...config.strategies[strategyKey] } });
    } catch (err) {
        console.error('Paper backtest error:', err.message);
        res.status(422).json({ error: 'Unable to run paper backtest', details: err.message });
    }
});
router.get('/runs', auth, async (req, res) => {
    try { res.json(await PaperBacktestRun.find({ userId: req.user.id }).select('symbol strategy initialCapital finalEquity totalReturn totalTrades winRate maxDrawdown profitFactor createdAt').sort({ createdAt: -1 }).limit(20).lean()); }
    catch (err) { res.status(500).json({ error: 'Unable to load backtest runs', details: err.message }); }
});
router.post('/reset', auth, async (req, res) => {
    try {
        const strategyKey = req.body?.strategyKey;
        const keys = strategyKey ? [strategyKey] : Object.keys(config.strategies);
        if (keys.some(key => !config.strategies[key])) return res.status(400).json({ error: 'Unsupported paper-trading strategy' });
        const portfolios = await Promise.all(keys.map(key => getPortfolio(req.user.id, key)));
        await PaperBacktestRun.deleteMany({ userId: req.user.id, portfolioId: { $in: portfolios.map(p => p._id) } });
        await Promise.all(portfolios.map(portfolio => { portfolio.cash = portfolio.initialCapital; portfolio.finalEquity = portfolio.initialCapital; portfolio.latestRun = null; return portfolio.save(); }));
        res.json({ message: strategyKey ? 'Paper portfolio reset.' : 'Both paper portfolios reset to ₹1,00,000.', portfolios });
    } catch (err) {
        console.error('Paper portfolio reset error:', err);
        res.status(500).json({ error: 'Unable to reset paper portfolio', details: err.message });
    }
});
module.exports = router;
