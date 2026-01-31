const db = require('../config/db');

async function setupUsers() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50),
                role VARCHAR(20),
                status VARCHAR(20) DEFAULT 'Active',
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Clear existing just in case
        await db.query('TRUNCATE TABLE users');

        await db.query(`
            INSERT INTO users (username, role, status) VALUES 
            ('admin_main', 'Admin', 'Active'),
            ('auditor_jane', 'Auditor', 'Active'),
            ('business_manager', 'Business', 'Active'),
            ('guest_auditor', 'Auditor', 'Inactive')
        `);

        console.log('Users table created and seeded successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error setting up users:', err.message);
        process.exit(1);
    }
}

setupUsers();
