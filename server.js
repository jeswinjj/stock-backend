require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');

const app = express();

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Middleware
app.use(express.json());
app.use(cors());

// Connection check middleware
app.use((req, res, next) => {
    if (mongoose.connection.readyState !== 1 && req.url !== '/api/ping') {
        return res.status(503).json({
            message: 'Database connection not ready',
            readyState: mongoose.connection.readyState
        });
    }
    next();
});

// Routes
const authRoutes = require('./routes/auth');
const stockRoutes = require('./routes/stocks');
const portfolioRoutes = require('./routes/portfolio');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');

// Public Debug Route
app.get('/api/ping', (req, res) => {
    res.json({
        message: 'pong',
        dbState: mongoose.connection.readyState === 1 ? 'connected' : 'connecting/disconnected'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);

// Final 404 handler
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    res.status(404).json({ message: `Route ${req.url} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ error: err.message });
});

const startServer = async () => {
    try {
        await connectDB();
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} with MongoDB Database`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
    }
};

startServer();

module.exports = app;
