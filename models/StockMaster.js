const mongoose = require('mongoose');

const StockMasterSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    series: { type: String },
    isin: { type: String },
    lastUpdated: { type: Date, default: Date.now }
});

// Text index for search
StockMasterSchema.index({ symbol: 'text', name: 'text' });

module.exports = mongoose.model('StockMaster', StockMasterSchema);
