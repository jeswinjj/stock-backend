const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Stock = require('../models/Stock');
const Transaction = require('../models/Transaction');
const PortfolioHistory = require('../models/PortfolioHistory');

router.get('/summary', auth, async (req, res) => {
    try {
        const stocks = await Stock.find({ userId: req.user.id });

        let totalInvested = 0;
        let currentValue = 0;
        let totalTodayChange = 0;

        stocks.forEach(stock => {
            const investedAmount = stock.investedAmount || 0;
            const lastPrice = stock.lastPrice || 0;
            const quantity = stock.totalQuantity || 0;
            const dayChange = stock.dayChange || 0;

            totalInvested += investedAmount;
            currentValue += (lastPrice * quantity);
            totalTodayChange += (dayChange * quantity);
        });

        // Calculate total realized PL from transactions
        const transactions = await Transaction.find({
            userId: req.user.id,
            type: 'SELL'
        });

        const totalRealizedPL = transactions.reduce((sum, tx) => sum + (tx.realizedPL || 0), 0);

        const unrealizedPL = currentValue - totalInvested;
        const totalPL = unrealizedPL + totalRealizedPL;

        res.json({
            totalInvested,
            currentValue,
            unrealizedPL,
            todayChange: totalTodayChange,
            todayChangePercentage: (currentValue > 0 && (currentValue - totalTodayChange) !== 0)
                ? (totalTodayChange / (currentValue - totalTodayChange)) * 100
                : 0,
            realizedPL: totalRealizedPL,
            totalPL,
            plPercentage: totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/stock-performance', auth, async (req, res) => {
    try {
        const stocks = await Stock.find({ userId: req.user.id }).sort({ symbol: 1 });

        const performance = stocks.map(stock => {
            const invested = stock.investedAmount || 0;
            const currentPrice = stock.lastPrice || 0;
            const quantity = stock.totalQuantity || 0;
            const currentValue = currentPrice * quantity;
            const pnl = currentValue - invested;

            return {
                symbol: stock.symbol,
                name: stock.name,
                invested: invested,
                currentValue: currentValue,
                profit: pnl > 0 ? pnl : 0,
                loss: pnl < 0 ? Math.abs(pnl) : 0,
                pnlPercentage: invested > 0 ? (pnl / invested) * 100 : 0
            };
        });

        res.json(performance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Portfolio History for Charts
router.get('/history', auth, async (req, res) => {
    try {
        const { range = '1M' } = req.query;
        let limit = 30;

        switch (range) {
            case '1D': limit = 2; break;
            case '1M': limit = 30; break;
            case '3M': limit = 90; break;
            case '1Y': limit = 365; break;
            case 'ALL': limit = 0; break; // 0 means no limit in our find logic
        }

        let query = PortfolioHistory.find({ userId: req.user.id }).sort({ date: -1 });
        if (limit > 0) {
            query = query.limit(limit);
        }

        const history = await query;
        const formattedHistory = history.map(record => ({
            date: record.date,
            totalInvested: record.totalInvested,
            currentValue: record.currentValue,
            totalPL: record.totalPL,
            dayChange: record.dayChange
        })).reverse(); // Sort ASC for chart

        res.json(formattedHistory);
    } catch (err) {
        console.error('Portfolio history error:', err);
        res.status(500).json({ message: 'Unable to fetch portfolio history' });
    }
});

module.exports = router;

module.exports = router;
