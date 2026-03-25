const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

// Get Wallet Balance and Transaction History
router.get('/', auth, async (req, res) => {
    try {
        // Get Balance
        const wallet = await Wallet.findOne({ userId: req.user.id });
        const balance = wallet ? wallet.balance : 0.00;

        // Get Transactions
        const transactions = await WalletTransaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 });

        const mappedTransactions = transactions.map(tx => ({
            id: tx._id,
            type: tx.type,
            category: tx.category || 'WALLET',
            amount: Number(tx.amount) || 0,
            symbol: tx.symbol || null,
            quantity: tx.quantity || null,
            buyPrice: tx.buyPrice || null,
            sellPrice: tx.sellPrice || null,
            costPrice: tx.costPrice || null,
            totalPL: tx.totalPL || null,
            balanceAfter: tx.balanceAfter || null,
            description: tx.description || '',
            created_at: tx.createdAt
        }));

        res.json({ balance, transactions: mappedTransactions });
    } catch (err) {
        console.error('Wallet fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add Funds
router.post('/add-funds', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount } = req.body;
        // Strict precision and security limits
        const value = Number(parseFloat(amount).toFixed(2));

        if (isNaN(value) || value <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid amount' });
        }
        if (value > 1000000000) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Amount too large' });
        }

        let wallet = await Wallet.findOne({ userId: req.user.id }).session(session);
        if (!wallet) {
            wallet = new Wallet({ userId: req.user.id, balance: 0 });
        }

        wallet.balance += value;
        await wallet.save({ session });

        const transaction = new WalletTransaction({
            userId: req.user.id,
            type: 'CREDIT',
            category: 'WALLET',
            amount: value,
            balanceAfter: wallet.balance,
            description: 'Added funds to wallet'
        });
        await transaction.save({ session });

        await session.commitTransaction();
        session.endSession();
        res.json({ message: 'Funds added successfully', newBalance: wallet.balance });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Add funds error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Withdraw Funds
router.post('/withdraw', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount } = req.body;
        // Strict precision and security limits
        const value = Number(parseFloat(amount).toFixed(2));

        if (isNaN(value) || value <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const wallet = await Wallet.findOne({ userId: req.user.id }).session(session);

        if (!wallet || wallet.balance < value) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        wallet.balance -= value;
        await wallet.save({ session });

        const transaction = new WalletTransaction({
            userId: req.user.id,
            type: 'WITHDRAW',
            category: 'WALLET',
            amount: value,
            balanceAfter: wallet.balance,
            description: 'Withdrew funds from wallet'
        });
        await transaction.save({ session });

        await session.commitTransaction();
        session.endSession();
        res.json({ 
            message: 'Funds withdrawn successfully', 
            newBalance: wallet.balance 
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Withdraw error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
