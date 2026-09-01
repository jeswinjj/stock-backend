const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getHistoricalOHLCV } = require('../services/marketDataService');
const { analyzeStock } = require('../services/technicalAnalysisService');
const { getStockFundamentals } = require('../services/fundamentalAnalysisService');
const { evaluateStockSignals } = require('../services/stockSignalService');
const { generatePrediction } = require('../services/stockPredictionService');

/**
 * GET /api/market-data/:symbol/prediction
 * Deterministic current-market setup. It is deliberately rule-based and is
 * suitable for calling with an earlier index during future backtests.
 */
router.get('/:symbol/prediction', auth, async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

        // A daily year normally contains 200+ trading sessions; request five years
        // as a fallback to give EMA200 and price-structure calculations room.
        const bars = await getHistoricalOHLCV(symbol, '1D', null, null, '5Y');
        const prediction = generatePrediction(bars);
        if (prediction.error) {
            return res.status(422).json({ error: 'Insufficient historical data for prediction', ...prediction });
        }
        res.json({ symbol, timestamp: bars.at(-1)?.date, barsUsed: bars.length, ...prediction });
    } catch (err) {
        console.error(`Prediction error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to calculate rule-based market setup', details: err.message });
    }
});

/**
 * GET /api/market-data/:symbol/history
 * Parameters: resolution (1D, 1W, 1M, 5m, 15m, 60m), from (timestamp), to (timestamp), timeframe (1M, 1Y...)
 */
router.get('/:symbol/history', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        const { resolution = '1D', timeframe = '1Y', from, to } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        const bars = await getHistoricalOHLCV(symbol, resolution, from, to, timeframe);
        res.json({
            symbol: symbol.trim().toUpperCase(),
            resolution,
            timeframe,
            count: bars.length,
            bars
        });
    } catch (err) {
        console.error(`Market data history error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to fetch historical market data', details: err.message });
    }
});

/**
 * GET /api/market-data/:symbol/technical-analysis
 */
router.get('/:symbol/technical-analysis', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        const { resolution = '1D' } = req.query;

        const bars = await getHistoricalOHLCV(symbol, resolution);
        if (!bars || bars.length === 0) {
            return res.status(404).json({ error: 'Insufficient historical data for technical analysis' });
        }

        const analysis = analyzeStock(bars);
        if (!analysis) {
            return res.status(400).json({ error: 'Unable to compute technical analysis' });
        }

        res.json({
            symbol: symbol.trim().toUpperCase(),
            resolution,
            ...analysis
        });
    } catch (err) {
        console.error(`Technical analysis error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to compute technical analysis', details: err.message });
    }
});

/**
 * GET /api/market-data/:symbol/fundamentals
 */
router.get('/:symbol/fundamentals', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        const fundamentals = await getStockFundamentals(symbol);
        res.json(fundamentals);
    } catch (err) {
        console.error(`Fundamental analysis error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to fetch fundamental analysis', details: err.message });
    }
});

/**
 * GET /api/market-data/:symbol/signals
 */
router.get('/:symbol/signals', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        const [bars, fundamentals] = await Promise.all([
            getHistoricalOHLCV(symbol, '1D').catch(() => []),
            getStockFundamentals(symbol).catch(() => null)
        ]);

        const technicals = bars.length > 0 ? analyzeStock(bars) : null;
        const signals = evaluateStockSignals(technicals, fundamentals);

        res.json({
            symbol: symbol.trim().toUpperCase(),
            ...signals
        });
    } catch (err) {
        console.error(`Signal evaluation error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to evaluate stock signals', details: err.message });
    }
});

/**
 * GET /api/market-data/:symbol/analysis
 * Combined Aggregation Endpoint
 */
router.get('/:symbol/analysis', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        const cleanSymbol = symbol.trim().toUpperCase();

        const [bars, fundamentals] = await Promise.all([
            getHistoricalOHLCV(cleanSymbol, '1D').catch(() => []),
            getStockFundamentals(cleanSymbol).catch(() => null)
        ]);

        const technicals = bars.length > 0 ? analyzeStock(bars) : null;
        const signals = evaluateStockSignals(technicals, fundamentals);

        res.json({
            symbol: cleanSymbol,
            timestamp: new Date().toISOString(),
            technicals,
            fundamentals,
            signals
        });
    } catch (err) {
        console.error(`Combined stock analysis error for ${req.params.symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to perform combined stock analysis', details: err.message });
    }
});

module.exports = router;
