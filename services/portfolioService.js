const Stock = require('../models/Stock');
const Transaction = require('../models/Transaction');
const PortfolioHistory = require('../models/PortfolioHistory');
const { getMultiplePricesSequentially } = require('./nseService');

/**
 * Refreshes current prices for all stocks in a user's portfolio
 * and saves a history snapshot.
 * 
 * @param {string} userId - The ID of the user whose portfolio to refresh
 * @returns {Promise<object>} - Object with success status and updated data
 */
async function refreshUserPortfolioPrices(userId) {
    try {
        const stocks = await Stock.find({ userId });
        const symbols = [...new Set(stocks.map(s => s.symbol.trim().toUpperCase()))];

        if (symbols.length === 0) {
            return { success: true, message: 'No stocks to update', updatedStocks: [] };
        }

        const liveData = await getMultiplePricesSequentially(symbols);

        for (const symbol of symbols) {
            const data = liveData[symbol];
            if (data) {
                await Stock.updateOne(
                    { userId, symbol },
                    {
                        lastPrice: data.price,
                        dayChange: data.change,
                        dayChangePercent: data.changePercent,
                        lastUpdatedAt: data.lastUpdatedAt
                    }
                );
            }
        }

        // --- Calculate Portfolio Snapshot ---
        const updatedStocks = await Stock.find({ userId });

        let totalInvested = 0;
        let currentValue = 0;
        let totalTodayChange = 0;

        updatedStocks.forEach(stock => {
            const investedAmount = stock.investedAmount || 0;
            const lastPrice = stock.lastPrice || 0;
            const quantity = stock.totalQuantity || 0;
            const dayChange = stock.dayChange || 0;

            totalInvested += investedAmount;
            currentValue += (lastPrice * quantity);
            totalTodayChange += (dayChange * quantity);
        });

        // Get realized P&L
        const sellTransactions = await Transaction.find({ userId, type: 'SELL' });
        const totalRealizedPL = sellTransactions.reduce((sum, tx) => sum + (tx.realizedPL || 0), 0);

        const unrealizedPL = currentValue - totalInvested;
        const totalPL = unrealizedPL + totalRealizedPL;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Check if snapshot exists for today
        const existing = await PortfolioHistory.findOne({
            userId,
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        if (existing) {
            existing.totalInvested = totalInvested;
            existing.currentValue = currentValue;
            existing.totalPL = totalPL;
            existing.dayChange = totalTodayChange;
            existing.date = new Date();
            await existing.save();
        } else {
            await PortfolioHistory.create({
                userId,
                date: new Date(),
                totalInvested,
                currentValue,
                totalPL,
                dayChange: totalTodayChange
            });
        }

        return { 
            success: true, 
            message: 'Prices updated and snapshot saved', 
            updatedStocks,
            summary: {
                totalInvested,
                currentValue,
                totalPL,
                dayChange: totalTodayChange
            }
        };
    } catch (err) {
        console.error(`Error refreshing portfolio for user ${userId}:`, err);
        throw err;
    }
}

module.exports = {
    refreshUserPortfolioPrices
};
