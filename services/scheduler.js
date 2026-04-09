const cron = require('node-cron');
const { syncNSEStocks } = require('./stockMasterService');

/**
 * Initialize background scheduled tasks
 */
function initScheduler() {
    console.log('--- Initializing Scheduler ---');

    /**
     * Sync NSE Stock List
     * Schedule: Every Sunday at 00:00 (Midnight)
     * Expression: '0 0 * * 0'
     */
    cron.schedule('0 0 * * 0', async () => {
        try {
            console.log('Running scheduled NSE Stock Sync...');
            await syncNSEStocks();
        } catch (err) {
            console.error('Scheduled NSE Stock Sync failed:', err.message);
        }
    });

    console.log('✅ NSE Stock Sync scheduled (Every Sunday at midnight)');

    // Optional: Add more jobs here later (e.g., daily wallet summaries, archive history)
}

module.exports = {
    initScheduler
};
