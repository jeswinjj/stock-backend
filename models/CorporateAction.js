const mongoose = require('mongoose');

const CorporateActionSchema = new mongoose.Schema({
    actionType: { type: String, enum: ['DEMERGER', 'BONUS', 'SPLIT'], required: true },
    parentSymbol: { type: String, required: true },
    recordDate: { type: Date, required: true },
    effectiveDate: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'APPLIED', 'SKIPPED'], default: 'PENDING' },
    appliedAt: { type: Date },
    appliedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // New field for duplicate guard

    demergerConfig: {
        parentCostPercent: Number,
        children: [
            {
                childSymbol: String,
                entitlementRatio: {
                    parentShares: Number,
                    childShares: Number
                },
                costPercent: Number
            }
        ]
    },

    bonusConfig: {
        ratio: { bonusShares: Number, forEveryShares: Number }
    },

    splitConfig: {
        ratio: { newShares: Number, forEveryShares: Number }
    },

    createdAt: { type: Date, default: Date.now },
    notes: { type: String }
});

module.exports = mongoose.model('CorporateAction', CorporateActionSchema);