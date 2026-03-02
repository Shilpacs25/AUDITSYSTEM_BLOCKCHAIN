const db = require('../config/db');
const { getTransactionDataString, sha256 } = require('../utils/blockchainService');

async function main() {
    const [auditLogs] = await db.query('SELECT * FROM Audit_Log WHERE Transaction_ID = 1005');
    const [txRows] = await db.query('SELECT * FROM Transactions WHERE Transaction_ID = 1005');
    const txn = txRows[0];
    const txDataString = getTransactionDataString(txn);

    console.log('TXN 1005 Data String:', txDataString);

    for (const log of auditLogs) {
        let currentHash;
        if (log.Action_Type === 'CREATED') {
            currentHash = sha256(txDataString);
        } else {
            currentHash = sha256(`${txDataString}|${log.Action_Type}`);
        }
        console.log(`Log ${log.Log_ID} (${log.Action_Type}) Calculated Hash:`, currentHash);
    }
    process.exit();
}
main();
