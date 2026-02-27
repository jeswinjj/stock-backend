const db = require('./config/db');

async function migrateWallet() {
    try {
        console.log('Starting Wallet Migration...');

        // 1. Create Wallets Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS wallets (
                user_id INT PRIMARY KEY,
                balance DECIMAL(15, 2) DEFAULT 0.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Verified/Created wallets table.');

        // 2. Create Wallet Transactions Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type ENUM('CREDIT', 'DEBIT', 'BUY', 'SELL_PROFIT', 'SELL_LOSS', 'WITHDRAW') NOT NULL, 
                amount DECIMAL(15, 2) NOT NULL,
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Verified/Created wallet_transactions table.');

        // 3. Initialize Wallets for existing users (if they don't have one)
        const [users] = await db.execute('SELECT id FROM users');
        for (const user of users) {
            // Check if wallet exists
            const [wallet] = await db.execute('SELECT user_id FROM wallets WHERE user_id = ?', [user.id]);
            if (wallet.length === 0) {
                await db.execute('INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)', [user.id]);
                console.log(`Initialized wallet for user ${user.id}`);
            }
        }

        console.log('Wallet Migration Completed Successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

migrateWallet();
