const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['CREDIT', 'WITHDRAW', 'BUY', 'SELL'], required: true },
    amount: { type: Number, required: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);
