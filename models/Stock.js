const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    name: { type: String },
    averagePrice: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    investedAmount: { type: Number, default: 0 },
    lastPrice: { type: Number, default: 0 },
    dayChange: { type: Number, default: 0 },
    dayChangePercent: { type: Number, default: 0 },
    realizedPL: { type: Number, default: 0 },
    lastUpdatedAt: { type: Date },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Stock', StockSchema);
