const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

// Get Wallet Balance and Transaction History
router.get('/', auth, async (req, res) => {
    try {
        // Get Balance
        const [wallet] = await db.execute('SELECT balance FROM wallets WHERE user_id = ?', [req.user.id]);
        const balance = wallet.length > 0 ? parseFloat(wallet[0].balance) : 0.00;

        // Get Transactions
        const [transactions] = await db.execute(
            'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );

        res.json({ balance, transactions });
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
        await db.execute('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [value, req.user.id]);

        await db.execute(
            'INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, "CREDIT", ?, "Added funds to wallet")',
            [req.user.id, value]
        );

        res.json({ message: 'Funds added successfully', newBalance: value });
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
        const [wallet] = await db.execute('SELECT balance FROM wallets WHERE user_id = ?', [req.user.id]);
        const currentBalance = parseFloat(wallet[0].balance);

        if (currentBalance < value) {
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        await db.execute('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', [value, req.user.id]);

        await db.execute(
            'INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, "WITHDRAW", ?, "Withdrew funds from wallet")',
            [req.user.id, value]
        );

        res.json({ message: 'Funds withdrawn successfully' });
    } catch (err) {
        console.error('Withdraw error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
