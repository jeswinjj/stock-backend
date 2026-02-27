const db = require('./config/db');

async function testConnection() {
    try {
        const [rows] = await db.execute('SELECT 1 + 1 AS solution');
        console.log('Connection successful! Solution:', rows[0].solution);

        // Check if tables exist
        const [tables] = await db.execute('SHOW TABLES');
        console.log('Tables in database:', tables.map(t => Object.values(t)[0]));

        process.exit(0);
    } catch (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
}

testConnection();
