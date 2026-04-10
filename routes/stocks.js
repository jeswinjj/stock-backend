const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const Stock = require('../models/Stock');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const PortfolioHistory = require('../models/PortfolioHistory');
const StockMaster = require('../models/StockMaster');
const { getMultiplePricesSequentially } = require('../services/nseService');

// Search Stocks for autocomplete
router.get('/search', auth, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 1) {
            return res.json([]);
        }

        // Search by symbol (starting with) or name (containing)
        const stocks = await StockMaster.find({
            $or: [
                { symbol: { $regex: `^${query}`, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ]
        })
            .limit(10)
            .select('symbol name series isin');

        res.json(stocks);
    } catch (err) {
        console.error('Stock search error:', err);
        res.status(500).json({ message: err.message });
    }
});


// Get all stocks for a user with sorting
router.get('/', auth, async (req, res) => {
    try {
        const { sort = 'name', order = 'asc' } = req.query;

        const stocks = await Stock.find({ userId: req.user.id });

        let enrichedStocks = stocks.map(stock => {
            const currentPrice = stock.lastPrice || 0;
            const totalQuantity = stock.totalQuantity || 0;
            const averagePrice = stock.averagePrice || 0;
            const investedAmount = stock.investedAmount || 0;
            const unrealizedPL = (currentPrice - averagePrice) * totalQuantity;

            return {
                id: stock._id,
                userId: stock.userId,
                symbol: stock.symbol,
                name: stock.name,
                averagePrice,
                totalQuantity,
                investedAmount,
                realizedPL: stock.realizedPL || 0,
                lastPrice: currentPrice,
                currentPrice,
                dayChange: stock.dayChange || 0,
                dayChangePercent: stock.dayChangePercent || 0,
                lastUpdatedAt: stock.lastUpdatedAt || new Date(0),
                unrealizedPL,
                pnlPercentage: investedAmount > 0 ? (unrealizedPL / investedAmount) * 100 : 0,
                currentValue: currentPrice * totalQuantity
            };
        });

        // Sort dynamically in memory to support any derived field
        enrichedStocks.sort((a, b) => {
            let valA = a[sort];
            let valB = b[sort];

            // Mapping legacy aliases from frontend
            if (sort === 'pl') {
                valA = a.pnlPercentage;
                valB = b.pnlPercentage;
            } else if (sort === 'qty') {
                valA = a.totalQuantity;
                valB = b.totalQuantity;
            } else if (sort === 'ltp') {
                valA = a.currentPrice;
                valB = b.currentPrice;
            }

            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                return order === 'desc'
                    ? valB.localeCompare(valA)
                    : valA.localeCompare(valB);
            }

            // Handle date objects
            if (valA instanceof Date && valB instanceof Date) {
                return order === 'desc' ? valB.getTime() - valA.getTime() : valA.getTime() - valB.getTime();
            }

            return order === 'desc' ? Number(valB) - Number(valA) : Number(valA) - Number(valB);
        });

        res.json(enrichedStocks);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const { refreshUserPortfolioPrices } = require('../services/portfolioService');

// Fetch latest prices from NSE and update DB
router.post('/fetch-prices', auth, async (req, res) => {
    try {
        const result = await refreshUserPortfolioPrices(req.user.id);
        res.json(result);
    } catch (err) {
        console.error('Fetch prices error:', err);
        res.status(500).json({ success: false, message: 'Unable to fetch prices' });
    }
});

// Buy Stock
router.post('/buy', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let { symbol, price, quantity, name, date } = req.body;
        symbol = symbol.trim().toUpperCase();
        const buyPrice = parseFloat(price);
        const buyQty = parseInt(quantity);
        const buyDate = date || new Date();
        const totalCost = buyPrice * buyQty;

        // Validation
        if (!symbol || buyQty <= 0 || buyPrice <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid symbol, quantity, or price' });
        }

        // 1. Check Wallet Balance
        const wallet = await Wallet.findOne({ userId: req.user.id }).session(session);
        if (!wallet || wallet.balance < totalCost) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        // 2. Deduct from Wallet
        wallet.balance -= totalCost;
        await wallet.save({ session });

        await WalletTransaction.create([{
            userId: req.user.id,
            type: 'BUY',
            category: 'TRADE',
            amount: totalCost,
            symbol,
            quantity: buyQty,
            buyPrice: buyPrice,
            balanceAfter: wallet.balance,
            description: `Bought ${buyQty} ${symbol} @ ${buyPrice}`
        }], { session });

        // 3. Process Stock Purchase
        let stock = await Stock.findOne({ userId: req.user.id, symbol }).session(session);

        if (!stock) {
            await Stock.create([{
                userId: req.user.id,
                symbol,
                name: name || symbol,
                averagePrice: buyPrice,
                totalQuantity: buyQty,
                investedAmount: totalCost,
                lastPrice: buyPrice,
                lastUpdatedAt: null
            }], { session });
        } else {
            const oldQty = stock.totalQuantity;
            const newQuantity = oldQty + buyQty;
            const newInvestedAmount = stock.investedAmount + totalCost;
            const newAvgPrice = newInvestedAmount / newQuantity;

            stock.averagePrice = newAvgPrice;
            stock.totalQuantity = newQuantity;
            stock.investedAmount = newInvestedAmount;
            stock.lastPrice = buyPrice;
            await stock.save({ session });
        }

        await Transaction.create([{
            userId: req.user.id,
            symbol,
            type: 'BUY',
            price: buyPrice,
            quantity: buyQty,
            date: buyDate
        }], { session });

        await session.commitTransaction();
        session.endSession();
        res.json({ message: 'Stock added successfully' });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("Buy error:", err);
        res.status(500).json({ message: err.message });
    }
});

// Partial Sell
router.post('/sell', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let { symbol, price, quantity, date } = req.body;
        symbol = symbol.trim().toUpperCase();
        const sellPrice = parseFloat(price);
        const sellQty = parseInt(quantity);
        const sellDate = date || new Date();
        const totalSaleAmount = sellPrice * sellQty;

        // Validation
        if (!symbol || sellQty <= 0 || sellPrice <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid symbol, quantity, or price' });
        }

        const stock = await Stock.findOne({ userId: req.user.id, symbol }).session(session);

        if (!stock || stock.totalQuantity < sellQty) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient quantity to sell' });
        }

        const avgPrice = stock.averagePrice;
        // Smoothed realized P/L calculation to prevent floating point issues
        const realizedPL = Number(((sellPrice - avgPrice) * sellQty).toFixed(2));

        const newQuantity = stock.totalQuantity - sellQty;
        const newInvestedAmount = stock.investedAmount - (avgPrice * sellQty);
        const totalRealizedPL = (stock.realizedPL || 0) + realizedPL;

        // 1. Credit Wallet
        let wallet = await Wallet.findOne({ userId: req.user.id }).session(session);
        if (!wallet) {
            wallet = new Wallet({ userId: req.user.id, balance: 0.00 });
        }
        wallet.balance += totalSaleAmount;
        await wallet.save({ session });

        // 2. Add Wallet Transaction
        const walletTxType = realizedPL >= 0 ? 'SELL_PROFIT' : 'SELL_LOSS';
        await WalletTransaction.create([{
            userId: req.user.id,
            type: walletTxType,
            category: 'TRADE',
            amount: totalSaleAmount,
            symbol,
            quantity: sellQty,
            sellPrice: sellPrice,
            costPrice: avgPrice,
            totalPL: realizedPL,
            avgPriceSnapshot: avgPrice,
            balanceAfter: wallet.balance,
            description: `Sold ${sellQty} ${symbol} @ ${sellPrice} (${realizedPL >= 0 ? 'Profit' : 'Loss'}: ${Math.abs(realizedPL).toFixed(2)})`
        }], { session });

        if (newQuantity === 0) {
            await Stock.deleteOne({ _id: stock._id }).session(session);
        } else {
            stock.totalQuantity = newQuantity;
            stock.investedAmount = newInvestedAmount;
            stock.realizedPL = totalRealizedPL;
            stock.updatedAt = new Date();
            await stock.save({ session });
        }

        await Transaction.create([{
            userId: req.user.id,
            symbol,
            type: 'SELL',
            price: sellPrice,
            quantity: sellQty,
            realizedPL: realizedPL,
            date: sellDate
        }], { session });

        await session.commitTransaction();
        session.endSession();
        res.json({ message: 'Stock sold successfully', realizedPL });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("Sell error:", err);
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        await Stock.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ message: 'Stock removed from portfolio' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
