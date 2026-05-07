const express = require('express');
const router = express.Router();
const CorporateAction = require('../models/CorporateAction');
const corporateActionService = require('../services/corporateActionService');
const Stock = require('../models/Stock');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// POST /api/corporate-actions/create
router.post('/create', auth, adminOnly, async (req, res, next) => {
    try {
        const { actionType, parentSymbol, demergerConfig, bonusConfig, splitConfig } = req.body;

        // Validate here instead of pre-save hook
        if (actionType === 'DEMERGER') {
            if (!demergerConfig?.children || !Array.isArray(demergerConfig.children) || demergerConfig.children.length === 0) {
                return res.status(400).json({ error: 'At least one child entity is required for DEMERGER' });
            }

            const symbols = new Set();
            symbols.add(parentSymbol);
            let totalCostPercent = demergerConfig.parentCostPercent || 0;

            for (const child of demergerConfig.children) {
                if (!child.childSymbol) return res.status(400).json({ error: 'childSymbol is required for each child' });
                if (symbols.has(child.childSymbol)) return res.status(400).json({ error: `Duplicate or parent symbol found: ${child.childSymbol}` });
                symbols.add(child.childSymbol);

                if (child.costPercent <= 0) return res.status(400).json({ error: 'costPercent must be positive' });
                totalCostPercent += child.costPercent;

                const { parentShares, childShares } = child.entitlementRatio || {};
                if (!parentShares || !childShares || parentShares <= 0 || childShares <= 0) {
                    return res.status(400).json({ error: 'entitlementRatio must contain positive integers' });
                }
            }

            if (Math.abs(totalCostPercent - 100) > 0.01) {
                return res.status(400).json({ error: `Total cost allocation must sum to 100% (currently ${totalCostPercent}%)` });
            }
        }

        if (actionType === 'BONUS') {
            if (!bonusConfig?.ratio) return res.status(400).json({ error: 'bonusConfig.ratio is required for BONUS' });
            const { bonusShares, forEveryShares } = bonusConfig.ratio;
            if (!bonusShares || !forEveryShares || bonusShares <= 0 || forEveryShares <= 0) {
                return res.status(400).json({ error: 'Bonus ratio values must be positive integers' });
            }
        }

        if (actionType === 'SPLIT') {
            if (!splitConfig?.ratio) return res.status(400).json({ error: 'splitConfig.ratio is required for SPLIT' });
            const { newShares, forEveryShares } = splitConfig.ratio;
            if (!newShares || !forEveryShares || newShares <= 0 || forEveryShares <= 0) {
                return res.status(400).json({ error: 'Split ratio values must be positive integers' });
            }
            if (Number(newShares) <= Number(forEveryShares)) {
                return res.status(400).json({ error: 'newShares must be greater than forEveryShares (Reverse splits not supported)' });
            }
        }

        const action = new CorporateAction(req.body);
        await action.save();
        res.status(201).json(action);
    } catch (err) {
        next(err);
    }
});

// POST /api/corporate-actions/preview
router.post('/preview', async (req, res, next) => {
    try {
        const { userId, corporateActionId } = req.body;
        const action = await CorporateAction.findById(corporateActionId);
        if (!action) return res.status(404).json({ error: 'Not found' });

        const stock = await Stock.findOne({ userId, symbol: action.parentSymbol });
        if (!stock) return res.status(400).json({ error: 'User does not hold the parent stock' });

        let summary = '';

        if (action.actionType === 'DEMERGER') {
            const { children, parentCostPercent } = action.demergerConfig;
            const originalQty = stock.totalQuantity;
            const originalInvested = stock.investedAmount;

            let totalChildInvested = 0;
            const childrenAfter = children.map(child => {
                const childQty = Math.floor((originalQty / child.entitlementRatio.parentShares) * child.entitlementRatio.childShares);
                const childInvested = Math.round(originalInvested * (child.costPercent / 100) * 100) / 100;
                totalChildInvested += childInvested;
                const childAvgPrice = childQty > 0 ? childInvested / childQty : 0;
                return {
                    symbol: child.childSymbol,
                    quantity: childQty,
                    invested: childInvested,
                    avgPrice: childAvgPrice
                };
            });

            const parentNewInvested = Math.round((originalInvested - totalChildInvested) * 100) / 100;
            const parentNewAvgPrice = originalQty > 0 ? parentNewInvested / originalQty : 0;

            const totalInvestedAfter = parentNewInvested + totalChildInvested;

            summary = `Your ${action.parentSymbol} holding will be split into ${children.length + 1} entities.`;
            
            return res.json({
                summary,
                parentAfter: {
                    symbol: action.parentSymbol,
                    quantity: originalQty,
                    newAvgPrice: parentNewAvgPrice,
                    newInvested: parentNewInvested
                },
                childrenAfter,
                totalInvestedCheck: {
                    before: originalInvested,
                    after: totalInvestedAfter,
                    matches: Math.abs(originalInvested - totalInvestedAfter) < 0.01
                }
            });
        } else if (action.actionType === 'BONUS') {
            const { ratio } = action.bonusConfig;
            const parentQty = stock.totalQuantity;
            const bonusQty = Math.floor((parentQty / ratio.forEveryShares) * ratio.bonusShares);
            const newTotalQty = parentQty + bonusQty;
            const newAvgPrice = stock.investedAmount / newTotalQty;

            summary = `You will receive ${bonusQty} bonus shares of ${action.parentSymbol}. Your avg price will change from ₹${stock.averagePrice.toFixed(2)} to ₹${newAvgPrice.toFixed(2)}. Invested amount stays ₹${stock.investedAmount.toLocaleString()}.`;
        } else if (action.actionType === 'SPLIT') {
            const { ratio } = action.splitConfig;
            const parentQty = stock.totalQuantity;
            const newTotalQty = Math.floor((parentQty / ratio.forEveryShares) * ratio.newShares);
            const newAvgPrice = stock.investedAmount / newTotalQty;

            summary = `Your ${action.parentSymbol} shares will split into ${newTotalQty} shares. Your avg price will change from ₹${stock.averagePrice.toFixed(2)} to ₹${newAvgPrice.toFixed(2)}. Invested amount stays ₹${stock.investedAmount.toLocaleString()}.`;
        }

        res.json({ summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/corporate-actions/apply
router.post('/apply', auth, adminOnly, async (req, res) => {
    try {
        const { userId, corporateActionId } = req.body;
        const updatedStocks = await corporateActionService.applyAction(userId, corporateActionId);
        res.json({ message: 'Corporate Action applied successfully', updatedStocks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/corporate-actions/pending
router.get('/pending', async (req, res) => {
    try {
        const actions = await CorporateAction.find({ status: 'PENDING' }).sort({ recordDate: 1 });
        res.json(actions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/corporate-actions/history/:userId
router.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const stocks = await Stock.find({ userId, 'corporateActionHistory.0': { $exists: true } });

        let history = [];
        stocks.forEach(s => {
            s.corporateActionHistory.forEach(h => {
                history.push({
                    symbol: s.symbol,
                    ...h.toObject()
                });
            });
        });

        history.sort((a, b) => new Date(b.actionDate) - new Date(a.actionDate));
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/corporate-actions/eligible/:corporateActionId
router.get('/eligible/:corporateActionId', async (req, res) => {
    try {
        const action = await CorporateAction.findById(req.params.corporateActionId);
        if (!action) return res.status(404).json({ error: 'Not found' });

        const stocks = await Stock.find({ symbol: action.parentSymbol });
        const userIds = [...new Set(stocks.map(s => s.userId.toString()))];

        res.json({ eligibleUsers: userIds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/corporate-actions/apply-bulk
router.post('/apply-bulk', auth, adminOnly, async (req, res) => {
    try {
        const { corporateActionId } = req.body;
        const action = await CorporateAction.findById(corporateActionId);
        if (!action) return res.status(404).json({ error: 'Not found' });

        const stocks = await Stock.find({ symbol: action.parentSymbol });
        const userIds = [...new Set(stocks.map(s => s.userId.toString()))];

        for (const uid of userIds) {
            try {
                await corporateActionService.applyAction(uid, corporateActionId);
            } catch (e) {
                console.error(`Failed to apply to user ${uid}: ${e.message}`);
            }
        }

        action.status = 'APPLIED';
        action.appliedAt = new Date();
        await action.save();

        res.json({ message: `Applied bulk corporate action to ${userIds.length} users` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/corporate-actions/:id
router.delete('/:id', auth, adminOnly, async (req, res, next) => {
    try {
        const action = await CorporateAction.findById(req.params.id);
        if (!action) {
            return res.status(404).json({ error: 'Corporate action not found' });
        }
        if (action.status === 'APPLIED') {
            return res.status(400).json({ 
                error: 'Cannot delete an already applied corporate action' 
            });
        }
        await CorporateAction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Corporate action deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
