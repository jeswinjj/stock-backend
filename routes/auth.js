const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { sendResetEmail } = require('../services/mailer');
const rateLimit = require('express-rate-limit');

// Rate limiter for forgot password
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per window
    message: { message: 'Too many reset requests. Please try again later.' }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        // Initialize Wallet for new user
        await db.execute('INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)', [result.insertId]);

        const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET);
        res.json({ token, user: { id: result.insertId, name, email } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Login (Enhanced to return privacy setting)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                hideBalance: !!user.hide_balance
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Forgot Password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user) {
            // Security: Don't reveal if user doesn't exist
            return res.json({ message: 'If that email exists in our system, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = await bcrypt.hash(resetToken, 10);
        const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await db.execute(
            'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
            [tokenHash, expiry, user.id]
        );

        await sendResetEmail(email, resetToken);
        res.json({ message: 'If that email exists in our system, a reset link has been sent.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        // Find users with non-null reset tokens
        const [users] = await db.execute(
            'SELECT * FROM users WHERE reset_token IS NOT NULL AND reset_token_expiry > NOW()'
        );

        let userToReset = null;
        for (const user of users) {
            const isMatch = await bcrypt.compare(token, user.reset_token);
            if (isMatch) {
                userToReset = user;
                break;
            }
        }

        if (!userToReset) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [hashedPassword, userToReset.id]
        );

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
