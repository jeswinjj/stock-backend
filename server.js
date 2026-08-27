require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - URL: ${req.url}`);
    next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const stockRoutes = require("./routes/stocks");
const portfolioRoutes = require("./routes/portfolio");
const userRoutes = require("./routes/user");
const walletRoutes = require("./routes/wallet");
const corporateActionRoutes = require("./routes/corporateActionRoutes");
const adminRoutes = require("./routes/admin");
const marketDataRoutes = require("./routes/marketData");
const auth = require("./middleware/auth");
const adminOnly = require("./middleware/adminOnly");

app.get("/api/ping", (req, res) => {
    res.json({
        message: "pong",
        dbState:
            mongoose.connection.readyState === 1
                ? "connected"
                : "not connected",
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/user", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/corporate-actions", corporateActionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/market-data", marketDataRoutes);


// Cron Routes (for Vercel)
const { syncNSEStocks } = require('./services/stockMasterService');
const { refreshUserPortfolioPrices } = require('./services/portfolioService');
const User = require('./models/User');
const pLimit = require('p-limit');

// 🔐 CRON AUTH MIDDLEWARE
function verifyCron(req, res, next) {
    const auth = req.headers['authorization'];
    const vercelCron = req.headers['x-vercel-cron'];

    // Vercel Cron sends x-vercel-cron: 1 header.
    // Also allow manual trigger via Bearer token for testing.
    if (vercelCron === '1' || auth === `Bearer ${process.env.CRON_SECRET}`) {
        return next();
    }

    console.warn(`[CRON] Unauthorized attempt from ${req.ip}. Headers:`, JSON.stringify(req.headers));
    return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/cron/portfolio-refresh', verifyCron, async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] Starting portfolio refresh cron...`);
        const users = await User.find({ autoRefreshEnabled: true }).lean();
        console.log(`[${new Date().toISOString()}] Users to refresh: ${users.length} (${users.map(u => u.email).join(', ')})`);

        if (users.length === 0) {
            return res.json({ success: true, message: 'No users have auto-refresh enabled.' });
        }

        const limit = pLimit(3);
        const results = await Promise.allSettled(
            users.map(user =>
                limit(async () => {
                    console.log(`[CRON] Refreshing portfolio for: ${user.email}`);
                    return refreshUserPortfolioPrices(user._id);
                })
            )
        );

        const successes = results.filter(r => r.status === 'fulfilled').length;
        const failures = results.filter(r => r.status === 'rejected').length;

        console.log(`[${new Date().toISOString()}] Portfolio refresh cron complete. Success: ${successes}, Failures: ${failures}`);

        res.json({ 
            success: true, 
            message: `Refreshed ${successes} portfolios, ${failures} failed.`,
            details: results.map(r => r.status === 'rejected' ? r.reason : 'Success')
        });
    } catch (err) {
        console.error('Portfolio refresh cron failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cron/nse-sync', verifyCron, async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] Starting NSE sync cron...`);
        const result = await syncNSEStocks();
        console.log(`[${new Date().toISOString()}] NSE sync cron complete:`, JSON.stringify(result));
        res.json({ success: true, message: 'NSE stocks synchronized', data: result });
    } catch (err) {
        console.error('NSE sync cron failed:', err);
        res.status(500).json({ error: err.message });
    }
});

const connectDB = require("./config/db");


// 404
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.originalUrl} not matched. current req.url: ${req.url}`);
    res.status(404).json({ 
        message: `Route ${req.url} not found`,
        originalUrl: req.originalUrl,
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("[SERVER ERROR]", err);
    res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5010;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {

            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
};

if (process.env.NODE_ENV !== "production") {
    startServer();
}

module.exports = app;