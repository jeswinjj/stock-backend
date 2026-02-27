require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Request logging middleware (MOVE TO TOP)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
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
    console.log('[DEBUG] Ping request received');
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);

console.log('Registered Routes:');
console.log('- GET /api/ping');
console.log('- /api/auth');
console.log('- /api/stocks');
console.log('- /api/portfolio');
console.log('- /api/user');
console.log('- /api/wallet');

// Final 404 handler
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    res.status(404).json({ message: `Route ${req.url} not found` });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with MySQL Database`);
});
