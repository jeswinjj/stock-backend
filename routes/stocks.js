const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { getMultiplePricesSequentially } = require('../services/nseService');

// Get all stocks for a user with sorting
router.get('/', auth, async (req, res) => {
    try {
        const { sort = 'name', order = 'asc' } = req.query;

        let orderBy = 'LOWER(name)';
        if (sort === 'symbol') orderBy = 'LOWER(symbol)';
        if (sort === 'pl') orderBy = '((last_price - average_price) / average_price)';

        const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        const query = `SELECT * FROM stocks WHERE user_id = ? ORDER BY ${orderBy} ${sortOrder}`;
        const [stocks] = await db.execute(query, [req.user.id]);

        const enrichedStocks = stocks.map(stock => {
            const currentPrice = parseFloat(stock.last_price) || 0;
            const totalQuantity = parseInt(stock.total_quantity);
            const averagePrice = parseFloat(stock.average_price) || 0;

            return {
                ...stock,
                userId: stock.user_id,
                averagePrice,
                totalQuantity,
                investedAmount: parseFloat(stock.invested_amount),
                realizedPL: parseFloat(stock.realized_pl) || 0,
                currentPrice,
                dayChange: parseFloat(stock.day_change) || 0,
                dayChangePercent: parseFloat(stock.day_change_percent) || 0,
                lastUpdatedAt: stock.last_updated_at,
                unrealizedPL: (currentPrice - averagePrice) * totalQuantity,
                currentValue: currentPrice * totalQuantity
            };
        });

        res.json(enrichedStocks);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Fetch latest prices from NSE and update DB
router.post('/fetch-prices', auth, async (req, res) => {
    try {
        const [stocks] = await db.execute('SELECT symbol FROM stocks WHERE user_id = ?', [req.user.id]);
        const symbols = [...new Set(stocks.map(s => s.symbol))];

        if (symbols.length === 0) {
            return res.json({ success: true, message: 'No stocks to update', updatedStocks: [] });
        }

        const liveData = await getMultiplePricesSequentially(symbols);

        for (const symbol of symbols) {
            const data = liveData[symbol];
            if (data) {
                await db.execute(
                    'UPDATE stocks SET last_price = ?, day_change = ?, day_change_percent = ?, last_updated_at = ? WHERE user_id = ? AND symbol = ?',
                    [data.price, data.change, data.changePercent, data.lastUpdatedAt, req.user.id, symbol]
                );
            }
        }

        // --- Calculate Portfolio Snapshot ---
        const [updatedStocks] = await db.execute('SELECT * FROM stocks WHERE user_id = ?', [req.user.id]);

        let totalInvested = 0;
        let currentValue = 0;
        let totalTodayChange = 0;

        updatedStocks.forEach(stock => {
            const investedAmount = parseFloat(stock.invested_amount) || 0;
            const lastPrice = parseFloat(stock.last_price) || 0;
            const quantity = parseInt(stock.total_quantity) || 0;
            const dayChange = parseFloat(stock.day_change) || 0;

            totalInvested += investedAmount;
            currentValue += (lastPrice * quantity);
            totalTodayChange += (dayChange * quantity);
        });

        // Get realized P&L
        const [transactions] = await db.execute(
            'SELECT SUM(realized_pl) as totalRealized FROM transactions WHERE user_id = ? AND type = "SELL"',
            [req.user.id]
        );
        const totalRealizedPL = parseFloat(transactions[0].totalRealized) || 0;
        const unrealizedPL = currentValue - totalInvested;
        const totalPL = unrealizedPL + totalRealizedPL;

        // Save Snapshot (Prevent duplicate for same day)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Check if snapshot exists for today
        const [existing] = await db.execute(
            'SELECT id FROM portfolio_history WHERE user_id = ? AND DATE(date) = ?',
            [req.user.id, today]
        );

        if (existing.length > 0) {
            // Update existing snapshot
            await db.execute(
                'UPDATE portfolio_history SET total_invested = ?, current_value = ?, total_pl = ?, day_change = ?, created_at = NOW() WHERE id = ?',
                [totalInvested, currentValue, totalPL, totalTodayChange, existing[0].id]
            );
        } else {
            // Insert new snapshot
            await db.execute(
                'INSERT INTO portfolio_history (user_id, date, total_invested, current_value, total_pl, day_change) VALUES (?, NOW(), ?, ?, ?, ?)',
                [req.user.id, totalInvested, currentValue, totalPL, totalTodayChange]
            );
        }

        res.json({ success: true, message: 'Prices updated and snapshot saved', updatedStocks });
    } catch (err) {
        console.error('Fetch prices error:', err);
        res.status(500).json({ success: false, message: 'Unable to fetch prices' });
    }
});

// Buy Stock (Handles new stock and "Add More")
router.post('/buy', auth, async (req, res) => {
    try {
        const { symbol, price, quantity, name, date } = req.body;
        const buyPrice = parseFloat(price);
        const buyQty = parseInt(quantity);
        const buyDate = date || new Date();
        const totalCost = buyPrice * buyQty;

        // 1. Check Wallet Balance
        const [wallet] = await db.execute('SELECT balance FROM wallets WHERE user_id = ?', [req.user.id]);
        if (wallet.length === 0 || parseFloat(wallet[0].balance) < totalCost) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        // 2. Deduct from Wallet
        await db.execute('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', [totalCost, req.user.id]);

        await db.execute(
            'INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, "BUY", ?, ?)',
            [req.user.id, totalCost, `Bought ${buyQty} ${symbol} @ ${buyPrice}`]
        );

        // 3. Process Stock Purchase (Existing Logic)
        const [existing] = await db.execute(
            'SELECT * FROM stocks WHERE user_id = ? AND symbol = ?',
            [req.user.id, symbol]
        );

        if (existing.length === 0) {
            await db.execute(
                'INSERT INTO stocks (user_id, symbol, name, average_price, total_quantity, invested_amount, last_price, last_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.user.id, symbol, name || symbol, buyPrice, buyQty, buyPrice * buyQty, buyPrice, buyDate]
            );
        } else {
            const stock = existing[0];
            const oldQty = parseInt(stock.total_quantity);
            const oldAvg = parseFloat(stock.average_price);

            const newQuantity = oldQty + buyQty;
            const newInvestedAmount = parseFloat(stock.invested_amount) + (buyPrice * buyQty);
            const newAvgPrice = newInvestedAmount / newQuantity;

            await db.execute(
                'UPDATE stocks SET average_price = ?, total_quantity = ?, invested_amount = ?, last_price = ?, last_updated_at = ? WHERE user_id = ? AND symbol = ?',
                [newAvgPrice, newQuantity, newInvestedAmount, buyPrice, buyDate, req.user.id, symbol]
            );
        }

        await db.execute(
            'INSERT INTO transactions (user_id, symbol, type, price, quantity, date) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, symbol, 'BUY', buyPrice, buyQty, buyDate]
        );

        res.json({ message: 'Stock added successfully' });
    } catch (err) {
        // Rollback wallet deduction if stock purchase fails? (Ideally yes, but simple for now)
        // In a real app, use database transactions (BEGIN/COMMIT/ROLLBACK)
        console.error("Buy error:", err);
        res.status(500).json({ message: err.message });
    }
});

// Partial Sell
router.post('/sell', auth, async (req, res) => {
    try {
        const { symbol, price, quantity, date } = req.body;
        const sellPrice = parseFloat(price);
        const sellQty = parseInt(quantity);
        const sellDate = date || new Date();
        const totalSaleAmount = sellPrice * sellQty;

        const [stocks] = await db.execute(
            'SELECT * FROM stocks WHERE user_id = ? AND symbol = ?',
            [req.user.id, symbol]
        );
        const stock = stocks[0];

        if (!stock || stock.total_quantity < sellQty) {
            return res.status(400).json({ message: 'Insufficient quantity to sell' });
        }

        const avgPrice = parseFloat(stock.average_price);
        const realizedPL = (sellPrice - avgPrice) * sellQty;

        const newQuantity = stock.total_quantity - sellQty;
        const newInvestedAmount = stock.invested_amount - (avgPrice * sellQty);
        const totalRealizedPL = (parseFloat(stock.realized_pl) || 0) + realizedPL;

        // 1. Credit Wallet (Return principal + profit/loss)
        await db.execute('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [totalSaleAmount, req.user.id]);

        // 2. Add Wallet Transaction
        const type = realizedPL >= 0 ? 'SELL_PROFIT' : 'SELL_LOSS';
        await db.execute(
            'INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [req.user.id, type, totalSaleAmount, `Sold ${sellQty} ${symbol} @ ${sellPrice} (P/L: ${realizedPL})`]
        );

        if (newQuantity === 0) {
            await db.execute('DELETE FROM stocks WHERE id = ?', [stock.id]);
        } else {
            await db.execute(
                'UPDATE stocks SET total_quantity = ?, invested_amount = ?, realized_pl = ?, updated_at = NOW() WHERE id = ?',
                [newQuantity, newInvestedAmount, totalRealizedPL, stock.id]
            );
        }

        await db.execute(
            'INSERT INTO transactions (user_id, symbol, type, price, quantity, realized_pl, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, symbol, 'SELL', sellPrice, sellQty, realizedPL, sellDate]
        );

        res.json({ message: 'Stock sold successfully', realizedPL });
    } catch (err) {
        console.error("Sell error:", err);
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        await db.execute('DELETE FROM stocks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Stock removed from portfolio' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
