const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// Toggle privacy (hide/show balance)
router.post('/toggle-privacy', auth, async (req, res) => {
    try {
        const { hideBalance } = req.body;
        await User.findByIdAndUpdate(req.user.id, { hideBalance });
        res.json({ success: true, hideBalance });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user profile (with privacy setting)
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('name email hideBalance');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            hideBalance: !!user.hideBalance
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
