const db = require('./config/db');

async function migrate() {
    try {
        console.log('Migrating users table schema...');

        const [columns] = await db.execute('SHOW COLUMNS FROM users');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('reset_token')) {
            console.log('Adding reset_token column...');
            await db.execute('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) AFTER password');
        }

        if (!columnNames.includes('reset_token_expiry')) {
            console.log('Adding reset_token_expiry column...');
            await db.execute('ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME AFTER reset_token');
        }

        if (!columnNames.includes('hide_balance')) {
            console.log('Adding hide_balance column...');
            await db.execute('ALTER TABLE users ADD COLUMN hide_balance BOOLEAN DEFAULT FALSE AFTER reset_token_expiry');
        }

        console.log('✅ Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
