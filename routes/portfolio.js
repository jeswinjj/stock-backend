const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

router.get('/summary', auth, async (req, res) => {
    console.log('GET /api/portfolio/summary hit');
    try {
        const [stocks] = await db.execute('SELECT * FROM stocks WHERE user_id = ?', [req.user.id]);

        let totalInvested = 0;
        let currentValue = 0;
        let totalTodayChange = 0;

        stocks.forEach(stock => {
            const investedAmount = parseFloat(stock.invested_amount) || 0;
            const lastPrice = parseFloat(stock.last_price) || 0;
            const quantity = parseInt(stock.total_quantity) || 0;
            const dayChange = parseFloat(stock.day_change) || 0;

            totalInvested += investedAmount;
            currentValue += (lastPrice * quantity);
            totalTodayChange += (dayChange * quantity);
        });

        const [transactions] = await db.execute(
            'SELECT SUM(realized_pl) as totalRealized FROM transactions WHERE user_id = ? AND type = "SELL"',
            [req.user.id]
        );
        const totalRealizedPL = parseFloat(transactions[0].totalRealized) || 0;

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
    console.log('GET /api/portfolio/stock-performance hit');
    try {
        const [stocks] = await db.execute('SELECT * FROM stocks WHERE user_id = ? ORDER BY LOWER(name) ASC', [req.user.id]);

        const performance = stocks.map(stock => {
            const invested = parseFloat(stock.invested_amount) || 0;
            const currentPrice = parseFloat(stock.last_price) || 0;
            const quantity = parseInt(stock.total_quantity) || 0;
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

        // Simplified range logic for now
        switch (range) {
            case '1D': limit = 2; break; // Need at least 2 points for a line
            case '1M': limit = 30; break;
            case '3M': limit = 90; break;
            case '1Y': limit = 365; break;
            case 'ALL': limit = 10000; break;
        }

        const query = `
            SELECT * FROM (
                SELECT * FROM portfolio_history 
                WHERE user_id = ? 
                ORDER BY date DESC 
                LIMIT ?
            ) AS sub ORDER BY date ASC
        `;

        const [history] = await db.execute(query, [req.user.id, limit]);

        const formattedHistory = history.map(record => ({
            date: record.date,
            totalInvested: parseFloat(record.total_invested),
            currentValue: parseFloat(record.current_value),
            totalPL: parseFloat(record.total_pl),
            dayChange: parseFloat(record.day_change)
        }));

        res.json(formattedHistory);
    } catch (err) {
        console.error('Portfolio history error:', err);
        res.status(500).json({ message: 'Unable to fetch portfolio history' });
    }
});

module.exports = router;
