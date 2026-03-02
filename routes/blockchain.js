const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const Evidence = require('../models/Evidence');

// Blockchain-protected actions
const BLOCKCHAIN_ACTIONS = [
    'CREATED',
    'UPDATED',
    'APPROVED',
    'VERIFIED',
    'REJECTED',
    'TAMPERED',
    'COMMENT_ADDED'
];

// Helper: SHA-256
const { initContract, sha256, getTransactionDataString, getFullAuditTrail } = require('../utils/blockchainService');

// Removed local sha256 helper
// ======================================================
// 1️⃣ GENERATE BLOCK (Write to Ethereum)
// ======================================================
router.post('/generate-hash/:transactionId', async (req, res) => {
    try {
        const transactionId = req.params.transactionId;

        // 1. Fetch Data from MySQL
        const [auditLogs] = await db.query(
            `SELECT * FROM Audit_Log 
             WHERE Transaction_ID = ?
             ORDER BY Log_ID`, 
            [transactionId]
        );

        if (!auditLogs.length) {
            return res.status(404).json({ message: "No audit logs found for this transaction" });
        }

        // Fetch the transaction data once for hashing
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        if (txRows.length === 0) {
            return res.status(404).json({ message: "Transaction data not found" });
        }
        const txn = txRows[0];
        const txDataString = getTransactionDataString(txn);

        // 2. Initialize Blockchain
        let contract, serverAccount;
        try {
            const result = await initContract();
            contract = result.contract;
            serverAccount = result.serverAccount;
        } catch (e) {
            console.error("Blockchain Init Failed:", e.message);
            return res.status(503).json({ error: "Blockchain Network Unavailable: " + e.message });
        }

        let blocksCreated = 0;
        let errors = [];

        for (const log of auditLogs) {
            if (!BLOCKCHAIN_ACTIONS.includes(log.Action_Type)) continue;

            // 3. Prepare Evidence Hash (Fetch from Mongo)
            let evidenceHash = "NO_EVIDENCE";
            try {
                if (require('mongoose').connection.readyState === 1) {
                    const evidenceDocs = await Evidence.find({ transaction_id: log.Transaction_ID });
                    if (evidenceDocs.length > 0) {
                        const fileHashes = evidenceDocs.map(e => e.file_hash);
                        evidenceHash = sha256(JSON.stringify(fileHashes));
                    }
                }
            } catch (e) {
                console.warn(`Evidence fetch warning:`, e.message);
            }

            // 4. Create Record Hash using Unified Strategy
            let recordHash;
            if (log.Action_Type === 'CREATED') {
                recordHash = sha256(txDataString);
            } else if (log.Action_Type === 'UPDATED') {
                // Evidence upload: Use data string + file hash
                recordHash = sha256(`${txDataString}|${evidenceHash}|UPDATED`);
            } else {
                // Other actions: Use data string + action
                recordHash = sha256(`${txDataString}|${log.Action_Type}`);
            }

            // 5. WRITE TO BLOCKCHAIN
            try {
                const receipt = await contract.methods.addAuditLog(
                    log.Log_ID,
                    log.Action_Type,
                    recordHash,
                    evidenceHash
                ).send({
                    from: serverAccount,
                    gas: 600000 
                });

                console.log(`Block mined for Log ${log.Log_ID}: ${receipt.transactionHash}`);
                await db.query(
                    `UPDATE Audit_Log SET Record_Hash = ? WHERE Log_ID = ?`,
                    [receipt.transactionHash, log.Log_ID]
                );
                blocksCreated++;
            } catch (err) {
                if (err.message.includes("Log ID already exists")) {
                    console.log(`Log ${log.Log_ID} already on-chain.`);
                } else {
                    console.error(`Failed to mine Log ${log.Log_ID}:`, err.message);
                    errors.push(err.message);
                }
            }
        }

        res.json({
            message: "Blockchain Sync Complete",
            transactionId,
            blocksCreated,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 2️⃣ VERIFY SYSTEM (Read from Ethereum)
// ======================================================
router.get('/verify-all', async (req, res) => {
    try {
        console.log("[VerifyAll] Starting full system integrity scan...");
        let onChainRecords;
        try {
            onChainRecords = await getFullAuditTrail();
        } catch (e) {
            console.error("[VerifyAll] Blockchain Fetch Failed:", e.message);
            return res.status(503).json({ error: "Blockchain Unavailable: " + e.message });
        }

        const onChainData = onChainRecords.map(record => ({
            logId: Number(record.logId),
            actionType: record.actionType,
            recordHash: record.recordHash,
            evidenceHash: record.evidenceHash
        }));

        const [dbLogs] = await db.query(`SELECT * FROM Audit_Log ORDER BY Log_ID`);
        let invalidLogs = [];
        const dbLogMap = {};
        dbLogs.forEach(l => dbLogMap[l.Log_ID] = l);

        console.log(`[VerifyAll] Found ${onChainData.length} records on-chain and ${dbLogs.length} logs in DB.`);

        for (const chainRecord of onChainData) {
            const sqlRecord = dbLogMap[chainRecord.logId];

            if (!sqlRecord) {
                console.warn(`[VerifyAll] ORPHAN BLOCK: Log ${chainRecord.logId} on chain but missing from DB.`);
                invalidLogs.push({
                    Log_ID: chainRecord.logId,
                    issue: "ORPHAN_BLOCK",
                    desc: "Block exists on chain but deleted from Validator DB"
                });
                continue;
            }

            // Content Verification
            let currentRecordHash;
            const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [sqlRecord.Transaction_ID]);
            
            if (txRows.length === 0) {
                console.error(`[VerifyAll] DATA MISSING: Transaction ${sqlRecord.Transaction_ID} not found for Log ${sqlRecord.Log_ID}`);
                currentRecordHash = "MISSING_TRANSACTION_DATA";
            } else {
                const txn = txRows[0];
                const txDataString = getTransactionDataString(txn);

                if (sqlRecord.Action_Type === 'CREATED') {
                    currentRecordHash = sha256(txDataString);
                } else if (sqlRecord.Action_Type === 'UPDATED') {
                    currentRecordHash = sha256(`${txDataString}|${chainRecord.evidenceHash}|UPDATED`);
                } else {
                    currentRecordHash = sha256(`${txDataString}|${sqlRecord.Action_Type}`);
                }
            }

            if (currentRecordHash !== chainRecord.recordHash) {
                console.error(`[VerifyAll] TAMPER DETECTED: Log ${sqlRecord.Log_ID} (TXN-${sqlRecord.Transaction_ID}). expected: ${chainRecord.recordHash.substring(0,10)}... found: ${currentRecordHash.substring(0,10)}...`);
                invalidLogs.push({
                    Log_ID: chainRecord.logId,
                    Transaction_ID: sqlRecord.Transaction_ID,
                    issue: "DATA_TAMPERED",
                    tamperedType: "AUDIT_LOG",
                    desc: "On-chain hash does not match current SQL data",
                    expected: chainRecord.recordHash,
                    found: currentRecordHash,
                    action: sqlRecord.Action_Type
                });
            } else {
                console.log(`[VerifyAll] Verified: Log ${sqlRecord.Log_ID} (TXN-${sqlRecord.Transaction_ID})`);
            }
        }

        // Check 2: Unanchored DB logs
        const chainedLogIds = new Set(onChainData.map(c => c.logId));
        for (const sqlRecord of dbLogs) {
            if (BLOCKCHAIN_ACTIONS.includes(sqlRecord.Action_Type) && !chainedLogIds.has(sqlRecord.Log_ID)) {
                console.warn(`[VerifyAll] UNANCHORED LOG: Log ${sqlRecord.Log_ID} (TXN-${sqlRecord.Transaction_ID}) not yet on chain.`);
                invalidLogs.push({
                    Log_ID: sqlRecord.Log_ID,
                    Transaction_ID: sqlRecord.Transaction_ID,
                    issue: "MISSING_BLOCK",
                    desc: "Audit log exists in DB but not anchored to Blockchain",
                    isUnanchored: true
                });
            }
        }

        const actualTampered = invalidLogs.filter(l => !l.isUnanchored);
        res.json({
            status: actualTampered.length === 0 ? "INTEGRITY_VERIFIED" : "TAMPER_DETECTED",
            blockchainHeight: onChainData.length,
            onChainCount: onChainData.length,
            offChainCount: dbLogs.length,
            invalidLogs
        });

    } catch (err) {
        console.error("[VerifyAll] Critical Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 4️⃣ REPAIR SYSTEM (Re-anchor all missing blocks)
router.post('/repair', async (req, res) => {
    try {
        console.log("[Repair] Starting blockchain re-anchoring...");
        const [dbLogs] = await db.query(`SELECT * FROM Audit_Log ORDER BY Log_ID`);
        
        let onChainRecords;
        try {
            onChainRecords = await getFullAuditTrail();
        } catch (e) {
            return res.status(503).json({ error: "Blockchain Unavailable: " + e.message });
        }
        
        const chainedLogIds = new Set(onChainRecords.map(r => Number(r.logId)));
        const toAnchor = dbLogs.filter(log => BLOCKCHAIN_ACTIONS.includes(log.Action_Type) && !chainedLogIds.has(log.Log_ID));
        
        if (toAnchor.length === 0) {
            return res.json({ message: "System is already fully anchored.", anchored: 0 });
        }

        const { contract, serverAccount } = await initContract();
        let repairedCount = 0;

        for (const log of toAnchor) {
            const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [log.Transaction_ID]);
            if (txRows.length === 0) continue;
            
            const txn = txRows[0];
            const txDataString = getTransactionDataString(txn);
            
            let recordHash;
            let evidenceHash = "NO_EVIDENCE";
            
            if (log.Action_Type === 'CREATED') {
                recordHash = sha256(txDataString);
            } else if (log.Action_Type === 'UPDATED') {
                try {
                    const mongoose = require('mongoose');
                    const evidenceDocs = await Evidence.find({ transaction_id: log.Transaction_ID });
                    if (evidenceDocs.length > 0) {
                        const fileHashes = evidenceDocs.map(e => e.file_hash);
                        evidenceHash = sha256(JSON.stringify(fileHashes));
                    }
                } catch (e) {}
                recordHash = sha256(`${txDataString}|${evidenceHash}|UPDATED`);
            } else {
                recordHash = sha256(`${txDataString}|${log.Action_Type}`);
            }

            try {
                const receipt = await contract.methods.addAuditLog(log.Log_ID, log.Action_Type, recordHash, evidenceHash)
                    .send({ from: serverAccount, gas: 600000 });
                
                await db.query(`UPDATE Audit_Log SET Record_Hash = ? WHERE Log_ID = ?`, [receipt.transactionHash, log.Log_ID]);
                repairedCount++;
            } catch (e) {
                console.error(`[Repair] Failed to anchor Log ${log.Log_ID}:`, e.message);
            }
        }

        res.json({ message: "Repair complete", anchored: repairedCount, total: toAnchor.length });
    } catch (err) {
        console.error("[Repair] Critical Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 3️⃣ FETCH AUDIT LOGS (Simple Passthrough)
// ======================================================
router.get('/logs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                Log_ID,
                Action_Type,
                Transaction_ID,
                Auditor_ID,
                Timestamp,
                Record_Hash as Tx_Hash
            FROM Audit_Log
            ORDER BY Transaction_ID, Log_ID
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 5️⃣ AUDIT HISTORY TRAIL (For Transaction Timeline)
// ======================================================
router.get('/history/:transactionId', async (req, res) => {
    try {
        const txId = req.params.transactionId;
        const [logs] = await db.query(`
            SELECT 
                al.Log_ID,
                al.Action_Type,
                al.Timestamp,
                al.Record_Hash,
                al.Blockchain_TX,
                al.Verification_Status,
                al.Auditor_ID,
                CASE 
                    WHEN al.Auditor_ID = 999 THEN 'SYSTEM'
                    WHEN al.Auditor_ID >= 100 THEN 'ADMIN'
                    WHEN al.Auditor_ID > 0 THEN 'AUDITOR'
                    ELSE 'BUSINESS'
                END as Actor
            FROM Audit_Log al
            WHERE al.Transaction_ID = ?
            ORDER BY al.Timestamp ASC
        `, [txId]);
        
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
