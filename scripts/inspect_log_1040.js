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

        console.log('\n--- VERIFYING LOG 1040 ---');
        const [rows] = await connection.query('SELECT * FROM Audit_Log WHERE Log_ID = 1040');
        console.log(JSON.stringify(rows[0], null, 2));

        console.log('\n--- LAST 5 ADMIN_APPROVED LOGS ---');
        const [adminLogs] = await connection.query("SELECT Log_ID, Transaction_ID, Action_Type, Record_Hash FROM Audit_Log WHERE Action_Type = 'ADMIN_APPROVED' ORDER BY Log_ID DESC LIMIT 5");
        console.table(adminLogs);

        console.log('\n--- CHECKING TRANSACTION 12 STATUS ---');
        const [txRow] = await connection.query('SELECT * FROM Transactions WHERE Transaction_ID = 12');
        console.log(JSON.stringify(txRow[0], null, 2));

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
