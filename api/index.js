const app = require("../server");
const connectDB = require("../config/db");
const { syncNSEStocks } = require('../services/stockMasterService');
const { refreshUserPortfolioPrices } = require('../services/portfolioService');
const User = require('../models/User');
const pLimit = require('p-limit');

// 🔐 CRON AUTH MIDDLEWARE
function verifyCron(req, res, next) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ✅ 1. Portfolio Refresh Route
app.get('/api/cron/portfolio-refresh', verifyCron, async (req, res) => {
    try {
        console.log('Running portfolio refresh cron...');
        const users = await User.find({ autoRefreshEnabled: true }).lean();
        console.log(`Users to refresh: ${users.length}`);

        const limit = pLimit(3);
        await Promise.all(
            users.map(user =>
                limit(() => refreshUserPortfolioPrices(user._id))
            )
        );

        res.json({ success: true, message: `Refreshed ${users.length} portfolios` });
    } catch (err) {
        console.error('Portfolio refresh cron failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ 2. NSE Sync Route
app.get('/api/cron/nse-sync', verifyCron, async (req, res) => {
    try {
        console.log('Running NSE sync cron...');
        await syncNSEStocks();
        res.json({ success: true, message: 'NSE stocks synchronized' });
    } catch (err) {
        console.error('NSE sync cron failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = async (req, res) => {
    try {
        await connectDB();
    } catch (err) {
        console.error("Database connection error in serverless function:", err);
    }
    return app(req, res);
};