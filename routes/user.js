const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

// Toggle privacy (hide/show balance)
router.post('/toggle-privacy', auth, async (req, res) => {
    try {
        const { hideBalance } = req.body;
        await db.execute(
            'UPDATE users SET hide_balance = ? WHERE id = ?',
            [hideBalance ? 1 : 0, req.user.id]
        );
        res.json({ success: true, hideBalance });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user profile (with privacy setting)
router.get('/profile', auth, async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, name, email, hide_balance FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            hideBalance: !!user.hide_balance
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
