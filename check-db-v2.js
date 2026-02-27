const db = require('./config/db');

async function check() {
    try {
        const [columns] = await db.execute('SHOW COLUMNS FROM users');
        console.log('Columns in users table:');
        columns.forEach(c => console.log(`- ${c.Field}`));
        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err.message);
        process.exit(1);
    }
}

check();
