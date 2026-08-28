const mongoose = require('mongoose');

const fundamentalSnapshotSchema = new mongoose.Schema({
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    source: {
        type: String,
        default: 'yahoo-finance'
    },
    fetchedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // MongoDB TTL index to auto-delete expired documents
    }
}, {
    timestamps: true
});

fundamentalSnapshotSchema.index({ symbol: 1, fetchedAt: -1 });

module.exports = mongoose.model('FundamentalSnapshot', fundamentalSnapshotSchema);
