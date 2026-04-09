require('dotenv').config();
const connectDB = require('../config/db');
const { syncNSEStocks } = require('../services/stockMasterService');

async function runManualSync() {
    try {
        console.log('--- Manual NSE Stock Sync Starting ---');
        await connectDB();
        
        const result = await syncNSEStocks();
        
        if (result.success) {
            console.log('--- Manual Sync Finished Successfully ---');
        } else {
            console.warn('--- Manual Sync Finished with Warnings ---');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('--- Manual Sync Failed ---');
        console.error(err);
        process.exit(1);
    }
}

runManualSync();
