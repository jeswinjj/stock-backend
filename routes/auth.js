const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
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
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'User already exists' });

        const user = new User({ name, email, password });
        await user.save();

        // Initialize Wallet for new user
        const wallet = new Wallet({ userId: user._id, balance: 0.00 });
        await wallet.save();

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user._id, name, email, role: user.role } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                hideBalance: !!user.hideBalance
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
        const user = await User.findOne({ email });

        if (!user) {
            return res.json({ message: 'If that email exists in our system, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = await bcrypt.hash(resetToken, 10);
        const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        user.resetToken = tokenHash;
        user.resetTokenExpiry = expiry;
        await user.save();

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

        // Find users with non-null reset tokens and valid expiry
        const users = await User.find({
            resetToken: { $ne: null },
            resetTokenExpiry: { $gt: Date.now() }
        });

        let userToReset = null;
        for (const user of users) {
            const isMatch = await bcrypt.compare(token, user.resetToken);
            if (isMatch) {
                userToReset = user;
                break;
            }
        }

        if (!userToReset) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        userToReset.password = password; // Mongoose middleware will hash this
        userToReset.resetToken = undefined;
        userToReset.resetTokenExpiry = undefined;
        await userToReset.save();

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
