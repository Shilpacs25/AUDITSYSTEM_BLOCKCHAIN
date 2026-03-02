require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('\n--- AUDIT_LOG: ACTION = VERIFIED ---');
        const [verifiedCols] = await connection.query("SELECT * FROM Audit_Log WHERE Action_Type = 'VERIFIED' LIMIT 3");
        console.table(verifiedCols);

        console.log('\n--- AUDIT_LOG: ACTION = ADMIN_APPROVED ---');
        const [approvedCols] = await connection.query("SELECT * FROM Audit_Log WHERE Action_Type = 'ADMIN_APPROVED' LIMIT 3");
        console.table(approvedCols);

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
