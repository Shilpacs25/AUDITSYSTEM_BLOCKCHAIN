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
    'TAMPERED'
];

// =========================
// Helper: SHA-256
// =========================
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// ======================================================
// 1️⃣ GENERATE BLOCKCHAIN BLOCKS (PER TRANSACTION)
// ======================================================
router.post('/generate-hash/:transactionId', async (req, res) => {
    try {
        const transactionId = req.params.transactionId;

        const [auditLogs] = await db.query(
            `SELECT * FROM Audit_Log
             WHERE Transaction_ID = ?
             ORDER BY Log_ID`,
            [transactionId]
        );

        if (!auditLogs.length) {
            return res.status(404).json({ message: "No audit logs found" });
        }

        // Get previous hash
        const [prev] = await db.query(
            `SELECT Current_Hash FROM Blockchain_Record
             ORDER BY Block_ID DESC LIMIT 1`
        );

        let previousHash = prev.length ? prev[0].Current_Hash : "GENESIS_HASH";
        let blocksCreated = 0;

        for (const log of auditLogs) {

            if (!BLOCKCHAIN_ACTIONS.includes(log.Action_Type)) continue;

            // Prevent duplicate blocks
            const [exists] = await db.query(
                `SELECT Block_ID FROM Blockchain_Record WHERE Log_ID = ?`,
                [log.Log_ID]
            );
            if (exists.length) continue;

            // Fetch evidence hashes for this transaction (Safety check for Mongo)
            let evidenceDocs = [];
            try {
                const mongoose = require('mongoose');
                if (mongoose.connection.readyState === 1) {
                    evidenceDocs = await Evidence.find({
                        transaction_id: log.Transaction_ID
                    }).maxTimeMS(2000);
                }
            } catch (e) {
                console.warn(`Evidence fetch failed for TX ${log.Transaction_ID}:`, e.message);
            }
            const evidenceHashes = evidenceDocs.map(e => e.file_hash);

            // ================= HASHES =================
            const auditHash = sha256(JSON.stringify({
                Log_ID: log.Log_ID,
                Action_Type: log.Action_Type,
                Transaction_ID: log.Transaction_ID,
                Auditor_ID: log.Auditor_ID,
                Record_Hash: log.Record_Hash
            }));

            const evidenceHash = sha256(JSON.stringify(evidenceHashes));

            const combinedHash = sha256(
                previousHash + auditHash + evidenceHash
            );

            // ================= INSERT BLOCK =================
            await db.query(
                `INSERT INTO Blockchain_Record
                (Previous_Hash, Current_Hash, Audit_Hash, Evidence_Hash,
                 Timestamp, Verified_by, Log_ID, Auditor_ID)
                 VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)`,
                [
                    previousHash,
                    combinedHash,
                    auditHash,
                    evidenceHash,
                    'SYSTEM',
                    log.Log_ID,
                    log.Auditor_ID
                ]
            );

            previousHash = combinedHash;
            blocksCreated++;
        }

        // Notify Admin of Ledger Update
        const io = req.app.get('io');
        if (io) {
            io.emit('admin-refresh', {
                source: 'Blockchain_API',
                type: 'ANCHOR',
                blocks: blocksCreated
            });
        }

        res.json({
            message: "Blockchain blocks generated",
            transactionId,
            blocksCreated
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 2️⃣ VERIFY ENTIRE SYSTEM (ACCURATE CLASSIFICATION)
// ======================================================
router.get('/verify-all', async (req, res) => {
    try {
        const [auditLogs] = await db.query(
            `SELECT * FROM Audit_Log ORDER BY Transaction_ID, Log_ID`
        );

        let previousHash = "GENESIS_HASH";
        let invalidLogs = [];

        for (const log of auditLogs) {

            if (!BLOCKCHAIN_ACTIONS.includes(log.Action_Type)) continue;

            const [block] = await db.query(
                `SELECT * FROM Blockchain_Record WHERE Log_ID = ?`,
                [log.Log_ID]
            );

            if (!block.length) {
                invalidLogs.push({
                    Log_ID: log.Log_ID,
                    Transaction_ID: log.Transaction_ID,
                    Action_Type: log.Action_Type,
                    tamperedType: "MISSING_BLOCK"
                });
                continue;
            }

            // Recompute hashes
            const evidenceDocs = await Evidence.find({
                transaction_id: log.Transaction_ID
            });
            const evidenceHashes = evidenceDocs.map(e => e.file_hash);

            const auditHash = sha256(JSON.stringify({
                Log_ID: log.Log_ID,
                Action_Type: log.Action_Type,
                Transaction_ID: log.Transaction_ID,
                Auditor_ID: log.Auditor_ID,
                Record_Hash: log.Record_Hash
            }));

            const evidenceHash = sha256(JSON.stringify(evidenceHashes));

            const expectedCombined = sha256(
                previousHash + auditHash + evidenceHash
            );

            let tamperedType = null;

            if (auditHash !== block[0].Audit_Hash &&
                evidenceHash !== block[0].Evidence_Hash) {
                tamperedType = "BOTH";
            }
            else if (auditHash !== block[0].Audit_Hash) {
                tamperedType = "AUDIT_LOG";
            }
            else if (evidenceHash !== block[0].Evidence_Hash) {
                tamperedType = "EVIDENCE";
            }
            else if (expectedCombined !== block[0].Current_Hash) {
                tamperedType = "CHAIN_BROKEN";
            }

            if (tamperedType) {
                invalidLogs.push({
                    Log_ID: log.Log_ID,
                    Transaction_ID: log.Transaction_ID,
                    Action_Type: log.Action_Type,
                    tamperedType,
                    expectedAuditHash: auditHash,
                    expectedEvidenceHash: evidenceHash,
                    foundAuditHash: block[0].Audit_Hash,
                    foundEvidenceHash: block[0].Evidence_Hash
                });
            }

            previousHash = block[0].Current_Hash;
        }

        res.json({
            blockchainValid: invalidLogs.length === 0,
            invalidLogs
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// ======================================================
// 3️⃣ FETCH ALL AUDIT LOGS (FOR "SHOW ALL")
// ======================================================
router.get('/logs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                Log_ID,
                Action_Type,
                Transaction_ID,
                Auditor_ID,
                Timestamp
            FROM Audit_Log
            ORDER BY Transaction_ID, Log_ID
        `);

        res.json(rows);

    } catch (err) {
        console.error("Fetch logs error:", err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
