require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'audit_system'
        });

        console.log('Checking for specific Log IDs (1012, 1013, 1014, 1015, 1016, 1017, 1022, 1027, 1028, 1030, 1031, 1033)...');
        const [rows] = await connection.query('SELECT Log_ID, Transaction_ID, Action_Type, Timestamp FROM Audit_Log WHERE Log_ID IN (1012, 1013, 1014, 1015, 1016, 1017, 1022, 1027, 1028, 1030, 1031, 1033)');
        
        if (rows.length === 0) {
            console.log('None of those Log IDs found in Audit_Log.');
        } else {
            console.log(`Found ${rows.length} relevant log entries:`);
            for (const r of rows) {
                const [txExists] = await connection.query('SELECT COUNT(*) as count FROM Transactions WHERE Transaction_ID = ?', [r.Transaction_ID]);
                const existsStr = txExists[0].count > 0 ? 'exists' : 'MISSING FROM TRANSACTIONS TABLE';
                console.log(`- Log ${r.Log_ID}: Action ${r.Action_Type}, TXN ${r.Transaction_ID} (${existsStr})`);
            }
        }

        console.log('\nAudit_Log Schema:');
        const [schema] = await connection.query('DESCRIBE Audit_Log');
        schema.forEach(row => console.log(`Field: ${row.Field}, Type: ${row.Type}, Null: ${row.Null}`));

        console.log('\nLast 10 Audit_Log Entries:');
        const [logs] = await connection.query('SELECT Log_ID, Transaction_ID, Action_Type, Record_Hash, Timestamp FROM Audit_Log ORDER BY Log_ID DESC LIMIT 10');
        logs.forEach(l => console.log(`- Log ${l.Log_ID}: TXN ${l.Transaction_ID}, Action ${l.Action_Type}, Hash: ${l.Record_Hash || 'NULL'}`));

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
