const StockMaster = require('../models/StockMaster');
const { getAllNSEStocks } = require('./nseService');

/**
 * Core logic to sync NSE stocks into the local database
 * Fetches from NSE archives and upserts into MongoDB
 */
async function syncNSEStocks() {
    try {
        console.log(`[${new Date().toISOString()}] Starting NSE Stock Sync...`);
        
        const stocks = await getAllNSEStocks();
        console.log(`[${new Date().toISOString()}] Fetched ${stocks.length} stocks from NSE.`);

        if (stocks.length === 0) {
            console.warn(`[${new Date().toISOString()}] No stocks fetched. Skipping update.`);
            return { success: false, message: 'No stocks fetched' };
        }

        const operations = stocks.map(stock => ({
            updateOne: {
                filter: { symbol: stock.symbol },
                update: { 
                    $set: { 
                        name: stock.name,
                        series: stock.series,
                        isin: stock.isin,
                        lastUpdated: new Date()
                    } 
                },
                upsert: true
            }
        }));

        const result = await StockMaster.bulkWrite(operations);
        
        console.log(`[${new Date().toISOString()}] NSE Sync Complete: ${result.upsertedCount} upserted, ${result.modifiedCount} modified.`);
        return { 
            success: true, 
            processed: stocks.length,
            upserted: result.upsertedCount,
            modified: result.modifiedCount
        };
    } catch (err) {
        console.error(`[${new Date().toISOString()}] NSE Stock Sync Failed:`, err);
        throw err;
    }
}

module.exports = {
    syncNSEStocks
};
