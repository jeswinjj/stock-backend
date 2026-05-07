const mongoose = require('mongoose');
const CorporateAction = require('../models/CorporateAction');
const Stock = require('../models/Stock');
const PortfolioHistory = require('../models/PortfolioHistory');
const WalletTransaction = require('../models/WalletTransaction');

class CorporateActionService {
    async applyAction(userId, corporateActionId) {
        const action = await CorporateAction.findById(corporateActionId);
        if (!action) throw new Error('Corporate Action not found');
        
        // Duplicate Guard
        if (action.appliedTo && action.appliedTo.includes(userId)) {
            throw new Error('Corporate action already applied to this user');
        }

        if (new Date(action.recordDate) > new Date()) {
            throw new Error('Record date is in the future. Cannot apply yet.');
        }

        switch (action.actionType) {
            case 'DEMERGER':
                await this.applyDemerger(userId, action);
                break;
            case 'BONUS':
                await this.applyBonus(userId, action);
                break;
            case 'SPLIT':
                await this.applySplit(userId, action);
                break;
            default:
                throw new Error('Unknown action type');
        }

        // Add user to appliedTo array
        await CorporateAction.findByIdAndUpdate(corporateActionId, {
            $addToSet: { appliedTo: userId }
        });

        await this.recalculatePortfolioHistory(userId, action.recordDate);
        return await Stock.find({ userId });
    }

    async applyDemerger(userId, action) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const parentStock = await Stock.findOne({ userId, symbol: action.parentSymbol }).session(session);
            if (!parentStock || parentStock.totalQuantity === 0) {
                await session.abortTransaction();
                session.endSession();
                return;
            }

            const { children, parentCostPercent } = action.demergerConfig;
            const originalQty = parentStock.totalQuantity;
            const originalInvested = parentStock.investedAmount;

            let totalChildInvested = 0;
            let childrenDesc = [];

            // 1. Calculate and update children first to get exact sum
            for (const child of children) {
                const childQty = Math.floor((originalQty / child.entitlementRatio.parentShares) * child.entitlementRatio.childShares);
                const childInvested = Math.round(originalInvested * (child.costPercent / 100) * 100) / 100;
                totalChildInvested += childInvested;

                const childAvgPrice = childQty > 0 ? childInvested / childQty : 0;

                let childStock = await Stock.findOne({ userId, symbol: child.childSymbol }).session(session);
                if (childStock) {
                    const prevChildQty = childStock.totalQuantity;
                    const prevChildAvgPrice = childStock.averagePrice;

                    childStock.totalQuantity += childQty;
                    childStock.investedAmount += childInvested;
                    childStock.averagePrice = childStock.investedAmount / childStock.totalQuantity;
                    childStock.isCorporateActionAdjusted = true;
                    childStock.corporateActionHistory.push({
                        actionType: 'DEMERGER',
                        actionDate: action.effectiveDate,
                        description: `Received ${childQty} shares from Demerger of ${action.parentSymbol}.`,
                        previousAveragePrice: prevChildAvgPrice,
                        adjustedAveragePrice: childStock.averagePrice,
                        previousQuantity: prevChildQty,
                        adjustedQuantity: childStock.totalQuantity
                    });
                    await childStock.save({ session });
                } else {
                    childStock = new Stock({
                        userId,
                        symbol: child.childSymbol,
                        name: child.childSymbol,
                        totalQuantity: childQty,
                        investedAmount: childInvested,
                        averagePrice: childAvgPrice,
                        lastPrice: childAvgPrice,
                        isCorporateActionAdjusted: true,
                        corporateActionHistory: [{
                            actionType: 'DEMERGER',
                            actionDate: action.effectiveDate,
                            description: `Received ${childQty} shares from Demerger of ${action.parentSymbol}.`,
                            previousAveragePrice: 0,
                            adjustedAveragePrice: childAvgPrice,
                            previousQuantity: 0,
                            adjustedQuantity: childQty
                        }]
                    });
                    await childStock.save({ session });
                }
                childrenDesc.push(`${childQty} ${child.childSymbol}`);
            }

            // 2. Assign remainder to parent for perfect balance
            const parentNewInvested = Math.round((originalInvested - totalChildInvested) * 100) / 100;
            const prevParentAvgPrice = parentStock.averagePrice;
            const parentNewAvgPrice = originalQty > 0 ? parentNewInvested / originalQty : 0;

            parentStock.investedAmount = parentNewInvested;
            parentStock.averagePrice = parentNewAvgPrice;
            parentStock.isCorporateActionAdjusted = true;
            parentStock.corporateActionHistory.push({
                actionType: 'DEMERGER',
                actionDate: action.effectiveDate,
                description: `Demerger of ${action.parentSymbol}. Received: ${childrenDesc.join(', ')}.`,
                previousAveragePrice: prevParentAvgPrice,
                adjustedAveragePrice: parentNewAvgPrice,
                previousQuantity: originalQty,
                adjustedQuantity: originalQty
            });
            await parentStock.save({ session });

            await WalletTransaction.create([{
                userId,
                type: 'CORPORATE_ACTION',
                category: 'CORPORATE_ACTION',
                amount: 0,
                symbol: action.parentSymbol,
                description: `Demerger: Received ${childrenDesc.join(', ')} from ${action.parentSymbol}`
            }], { session });

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async applyBonus(userId, action) {
        const stock = await Stock.findOne({ userId, symbol: action.parentSymbol });
        if (!stock || stock.totalQuantity === 0) return;

        const { ratio } = action.bonusConfig;
        const parentQty = stock.totalQuantity;
        const bonusQty = Math.floor((parentQty / ratio.forEveryShares) * ratio.bonusShares);
        
        const newTotalQty = parentQty + bonusQty;
        const investedAmount = stock.investedAmount; // Unchanged
        const newAveragePrice = investedAmount / newTotalQty;

        const prevAvgPrice = stock.averagePrice;
        
        stock.totalQuantity = newTotalQty;
        stock.averagePrice = newAveragePrice;
        stock.isCorporateActionAdjusted = true;
        stock.corporateActionHistory.push({
            actionType: 'BONUS',
            actionDate: action.effectiveDate,
            description: `Bonus Issue ${ratio.bonusShares}:${ratio.forEveryShares}. Received ${bonusQty} free shares.`,
            previousAveragePrice: prevAvgPrice,
            adjustedAveragePrice: newAveragePrice,
            previousQuantity: parentQty,
            adjustedQuantity: newTotalQty
        });

        await stock.save();

        await WalletTransaction.create({
            userId,
            type: 'CORPORATE_ACTION',
            category: 'CORPORATE_ACTION',
            amount: 0,
            symbol: action.parentSymbol,
            quantity: bonusQty,
            description: `Bonus Issue: ${bonusQty} shares added to ${action.parentSymbol}`
        });
    }

    async applySplit(userId, action) {
        const stock = await Stock.findOne({ userId, symbol: action.parentSymbol });
        if (!stock || stock.totalQuantity === 0) return;

        const { ratio } = action.splitConfig;
        const parentQty = stock.totalQuantity;
        const newTotalQty = Math.floor((parentQty / ratio.forEveryShares) * ratio.newShares);
        
        const investedAmount = stock.investedAmount; // Unchanged
        const newAveragePrice = investedAmount / newTotalQty;

        const prevAvgPrice = stock.averagePrice;
        
        stock.totalQuantity = newTotalQty;
        stock.averagePrice = newAveragePrice;
        stock.isCorporateActionAdjusted = true;
        stock.corporateActionHistory.push({
            actionType: 'SPLIT',
            actionDate: action.effectiveDate,
            description: `Stock Split ${ratio.newShares}:${ratio.forEveryShares}. Quantity adjusted from ${parentQty} to ${newTotalQty}.`,
            previousAveragePrice: prevAvgPrice,
            adjustedAveragePrice: newAveragePrice,
            previousQuantity: parentQty,
            adjustedQuantity: newTotalQty
        });

        await stock.save();

        await WalletTransaction.create({
            userId,
            type: 'CORPORATE_ACTION',
            category: 'CORPORATE_ACTION',
            amount: 0,
            symbol: action.parentSymbol,
            description: `Stock Split: ${action.parentSymbol} split ${ratio.newShares}:${ratio.forEveryShares}`
        });
    }

    async recalculatePortfolioHistory(userId, recordDate) {
        const stocks = await Stock.find({ userId });
        const totalInvested = stocks.reduce((sum, s) => sum + (s.investedAmount || 0), 0);
        
        const dateStr = new Date(recordDate).toISOString().split('T')[0];
        const recordDateStart = new Date(dateStr);
        const recordDateEnd = new Date(dateStr);
        recordDateEnd.setDate(recordDateEnd.getDate() + 1);

        let history = await PortfolioHistory.findOne({
            userId,
            date: { $gte: recordDateStart, $lt: recordDateEnd }
        });

        if (history) {
            history.totalInvested = totalInvested;
            await history.save();
        } else {
            // Upsert fallback
            await PortfolioHistory.updateOne(
                { userId, date: recordDateStart },
                { $set: { totalInvested } },
                { upsert: true }
            );
        }
    }
}

module.exports = new CorporateActionService();
