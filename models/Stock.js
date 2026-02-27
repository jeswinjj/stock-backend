const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    name: { type: String },
    averagePrice: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    investedAmount: { type: Number, default: 0 },
    lastPrice: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
});

StockSchema.index({ userId: 1, symbol: 1 }, { unique: true });

module.exports = mongoose.model('Stock', StockSchema);
