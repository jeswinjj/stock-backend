const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getHistoricalOHLCV } = require('../services/marketDataService');
const { analyzeStock } = require('../services/technicalAnalysisService');

/**
 * GET /api/market-data/:symbol/history
 * Parameters: resolution (1D, 1W, 1M, 5m, 15m, 60m), from (timestamp), to (timestamp)
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

module.exports = router;
