const mongoose = require('mongoose');

const TradeSchema = new mongoose.Schema({
    symbol: String, side: { type: String, default: 'BUY' }, entryDate: Date, exitDate: Date, entryPrice: Number, exitPrice: Number,
    quantity: Number, entryFees: Number, exitFees: Number, pnl: Number, returnPercent: Number,
    holdingDays: Number, holdingMinutes: Number, exitReason: String, entryReason: [String]
}, { _id: false });
const PaperBacktestRunSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaperPortfolio', required: true },
    symbol: { type: String, required: true },
    strategy: { type: String, required: true },
    initialCapital: Number, finalEquity: Number, cash: Number, totalReturn: Number,
    totalTrades: Number, buySignals: Number, sellSignals: Number, winningTrades: Number, losingTrades: Number,
    winRate: Number, averageReturn: Number, averageProfit: Number, averageLoss: Number, riskRewardRatio: Number,
    losingStreak: Number, averageHoldingPeriod: Number, maxDrawdown: Number,
    profitFactor: Number, totalFees: Number, trades: [TradeSchema],
    equityCurve: [{ date: Date, equity: Number, cash: Number, positionValue: Number, drawdownPercent: Number }]
}, { timestamps: true });
PaperBacktestRunSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('PaperBacktestRun', PaperBacktestRunSchema);
