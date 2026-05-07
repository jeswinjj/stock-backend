const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['CREDIT', 'WITHDRAW', 'BUY', 'SELL', 'SELL_PROFIT', 'SELL_LOSS', 'DEBIT', 'CORPORATE_ACTION'], required: true },
    amount: { type: Number, required: true }, // The total cash amount affected
    symbol: { type: String }, // e.g., 'AAPL'
    quantity: { type: Number }, // e.g., 10
    buyPrice: { type: Number },
    sellPrice: { type: Number },
    costPrice: { type: Number }, // The average cost price (for SELL transactions)
    totalPL: { type: Number }, // The realized profit/loss (for SELL transactions)
    avgPriceSnapshot: { type: Number },
    category: { type: String, enum: ['WALLET', 'TRADE', 'CORPORATE_ACTION'], default: 'WALLET' },
    balanceAfter: { type: Number }, // Audit trail: balance after transaction
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
});

WalletTransactionSchema.index({ userId: 1, created_at: -1 });
WalletTransactionSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);
