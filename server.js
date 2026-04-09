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

const connectDB = require("./config/db");
const { initScheduler } = require("./services/scheduler");


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
        initScheduler();
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