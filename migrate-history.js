const db = require('./config/db');

async function migrate() {
    try {
        console.log('Creating portfolio_history table...');

        const query = `
            CREATE TABLE IF NOT EXISTS portfolio_history (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              date DATETIME NOT NULL,
              total_invested DECIMAL(15, 2) DEFAULT 0.00,
              current_value DECIMAL(15, 2) DEFAULT 0.00,
              total_pl DECIMAL(15, 2) DEFAULT 0.00,
              day_change DECIMAL(15, 2) DEFAULT 0.00,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              INDEX idx_user_date (user_id, date)
            );
        `;

        await db.execute(query);
        console.log('✅ portfolio_history table created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
