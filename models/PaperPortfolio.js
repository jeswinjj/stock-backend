const mongoose = require('mongoose');

const PaperPortfolioSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    strategyKey: { type: String, required: true, default: 'TREND_MOMENTUM_BREAKOUT_V1' },
    name: { type: String, default: 'Paper Trading Lab' },
    initialCapital: { type: Number, default: 100000 },
    cash: { type: Number, default: 100000 },
    finalEquity: { type: Number, default: 100000 },
    latestRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PaperBacktestRun', default: null },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
PaperPortfolioSchema.index({ userId: 1, strategyKey: 1 }, { unique: true });
module.exports = mongoose.model('PaperPortfolio', PaperPortfolioSchema);
