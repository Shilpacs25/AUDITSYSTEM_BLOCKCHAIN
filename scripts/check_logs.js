const db = require('../config/db');
const { getFullAuditTrail } = require('../utils/blockchainService');
async function main() {
    const [rows] = await db.query('SELECT * FROM Audit_Log WHERE Transaction_ID = 1005');
    console.log('DB Logs:', JSON.stringify(rows, null, 2));
    const chainLogs = await getFullAuditTrail();
    const relevantChain = chainLogs.filter(l => rows.some(r => Number(r.Log_ID) === Number(l.logId)));
    console.log('Chain Logs:', JSON.stringify(relevantChain, null, 2));
    process.exit();
}
main();
