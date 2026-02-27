const mongoose = require('mongoose');

const PortfolioHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
    totalInvested: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    totalPL: { type: Number, default: 0 },
    dayChange: { type: Number, default: 0 },
});

module.exports = mongoose.model('PortfolioHistory', PortfolioHistorySchema);
