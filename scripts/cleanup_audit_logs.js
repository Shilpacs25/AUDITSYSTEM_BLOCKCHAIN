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

        console.log('[Cleanup] Checking for malformed logs (missing Transaction_ID)...');
        // We look for rows where Transaction_ID is NULL or 0 according to the dump
        const [toDelete] = await connection.query('SELECT Log_ID, Action_Type FROM Audit_Log WHERE Transaction_ID IS NULL OR Transaction_ID = 0');
        
        if (toDelete.length === 0) {
            console.log('[Cleanup] No malformed logs found.');
        } else {
            console.log(`[Cleanup] Found ${toDelete.length} malformed logs:`, toDelete.map(l => l.Log_ID).join(', '));
            
            const [result] = await connection.query('DELETE FROM Audit_Log WHERE Transaction_ID IS NULL OR Transaction_ID = 0');
            console.log(`[Cleanup] Successfully deleted ${result.affectedRows} records.`);
        }

        await connection.end();
    } catch (err) {
        console.error('[Cleanup] Error:', err.message);
    }
}

run();
