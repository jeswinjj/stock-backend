const express = require('express');
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
            amount: tx.amount,
            description: tx.description,
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
    const { amount } = req.body;
    const value = parseFloat(amount);

    if (isNaN(value) || value <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        let wallet = await Wallet.findOne({ userId: req.user.id });
        if (!wallet) {
            wallet = new Wallet({ userId: req.user.id, balance: 0 });
        }

        wallet.balance += value;
        await wallet.save();

        const transaction = new WalletTransaction({
            userId: req.user.id,
            type: 'CREDIT',
            amount: value,
            description: 'Added funds to wallet'
        });
        await transaction.save();

        res.json({ message: 'Funds added successfully', newBalance: wallet.balance });
    } catch (err) {
        console.error('Add funds error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Withdraw Funds
router.post('/withdraw', auth, async (req, res) => {
    const { amount } = req.body;
    const value = parseFloat(amount);

    if (isNaN(value) || value <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        const wallet = await Wallet.findOne({ userId: req.user.id });

        if (!wallet || wallet.balance < value) {
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        wallet.balance -= value;
        await wallet.save();

        const transaction = new WalletTransaction({
            userId: req.user.id,
            type: 'WITHDRAW',
            amount: value,
            description: 'Withdrew funds from wallet'
        });
        await transaction.save();

        res.json({ message: 'Funds withdrawn successfully' });
    } catch (err) {
        console.error('Withdraw error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
