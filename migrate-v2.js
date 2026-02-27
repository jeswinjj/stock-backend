const db = require('./config/db');

async function migrate() {
    try {
        console.log('Migrating database schema...');

        const [columns] = await db.execute('SHOW COLUMNS FROM stocks');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('realized_pl')) {
            console.log('Adding realized_pl column...');
            await db.execute('ALTER TABLE stocks ADD COLUMN realized_pl DECIMAL(15, 2) DEFAULT 0.00 AFTER invested_amount');
        }

        if (!columnNames.includes('last_updated_at')) {
            console.log('Adding last_updated_at column...');
            await db.execute('ALTER TABLE stocks ADD COLUMN last_updated_at TIMESTAMP NULL DEFAULT NULL AFTER last_price');
        }

        console.log('✅ Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
