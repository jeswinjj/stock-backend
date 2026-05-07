require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
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

// Cron Routes (for Vercel)
const { syncNSEStocks } = require('./services/stockMasterService');
const { refreshUserPortfolioPrices } = require('./services/portfolioService');
const User = require('./models/User');
const pLimit = require('p-limit');

// 🔐 CRON AUTH MIDDLEWARE
function verifyCron(req, res, next) {
    const auth = req.headers['authorization'];
    // Vercel Cron sends Bearer token. Check if it matches our secret.
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        console.warn(`[CRON] Unauthorized attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

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

const connectDB = require("./config/db");


// 404
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.url} not found` });
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