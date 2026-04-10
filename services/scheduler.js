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

    /**
     * Daily Portfolio Refresh
     * Schedule: Every Weekday at 16:00 (4:00 PM)
     * Expression: '0 16 * * 1-5'
     */
    const User = require('../models/User');
    const { refreshUserPortfolioPrices } = require('./portfolioService');

    cron.schedule('0 16 * * 1-5', async () => {
        try {
            console.log('Running scheduled daily portfolio refresh...');
            const users = await User.find({ autoRefreshEnabled: true });

            console.log(`Found ${users.length} users with auto-refresh enabled.`);

            for (const user of users) {
                try {
                    await refreshUserPortfolioPrices(user._id);
                    console.log(`Successfully refreshed portfolio for user: ${user.email}`);
                } catch (userErr) {
                    console.error(`Failed to refresh portfolio for user: ${user.email}`, userErr.message);
                }
            }
            console.log('Scheduled daily portfolio refresh completed.');
        } catch (err) {
            console.error('Scheduled portfolio refresh failed:', err.message);
        }
    });

    console.log('✅ Daily (4 PM Weekdays) Portfolio Refresh scheduled');
}

module.exports = {
    initScheduler
};
