const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const Evidence = require('../models/Evidence');

// Test Route
router.get('/test', (req, res) => {
    res.json({ status: "ADMIN ROUTES ACTIVE" });
});

// Reusing specific blockchain logic for integrity checking
//Ideally this should be in a shared service, but putting here to fulfill requirement strictly
const BLOCKCHAIN_ACTIONS = ['CREATED', 'UPDATED', 'APPROVED', 'VERIFIED', 'REJECTED', 'TAMPERED'];

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Helper: Run verification to get stats and tampered logs
async function getVerificationData() {
    // 1. Bulk Fetch all required data
    const [auditLogs] = await db.query(`SELECT * FROM Audit_Log ORDER BY Transaction_ID, Log_ID`);
    const [allBlocks] = await db.query(`SELECT * FROM Blockchain_Record`);

    let allEvidence = [];
    try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            const Evidence = require('../models/Evidence');
            allEvidence = await Evidence.find({}).maxTimeMS(3000);
        }
    } catch (e) {
        console.warn("Evidence bulk fetch failed:", e.message);
    }

    // 2. Map data for fast lookup
    const blockMap = {};
    allBlocks.forEach(b => blockMap[b.Log_ID] = b);

    const evidenceMap = {};
    allEvidence.forEach(e => {
        if (!evidenceMap[e.transaction_id]) evidenceMap[e.transaction_id] = [];
        evidenceMap[e.transaction_id].push(e.file_hash);
    });

    let previousHash = "GENESIS_HASH";
    let invalidLogs = [];
    let verifiedCount = 0;

    // 3. In-memory check
    for (const log of auditLogs) {
        if (!BLOCKCHAIN_ACTIONS.includes(log.Action_Type)) continue;

        const block = blockMap[log.Log_ID];

        if (!block) {
            invalidLogs.push({
                tx_id: log.Transaction_ID,
                violation: "MISSING_BLOCK",
                severity: "HIGH",
                timestamp: log.Timestamp,
                status: "Tampered"
            });
            continue;
        }

        const evidenceHashes = evidenceMap[log.Transaction_ID] || [];

        const auditHash = sha256(JSON.stringify({
            Log_ID: log.Log_ID,
            Action_Type: log.Action_Type,
            Transaction_ID: log.Transaction_ID,
            Auditor_ID: log.Auditor_ID,
            Record_Hash: log.Record_Hash
        }));
        const evidenceHash = sha256(JSON.stringify(evidenceHashes));
        const expectedCombined = sha256(previousHash + auditHash + evidenceHash);

        let violation = null;
        if (auditHash !== block.Audit_Hash && evidenceHash !== block.Evidence_Hash) violation = "DOUBLE_TAMPER";
        else if (auditHash !== block.Audit_Hash) violation = "AUDIT_LOG_TAMPER";
        else if (evidenceHash !== block.Evidence_Hash) violation = "EVIDENCE_TAMPER";
        else if (expectedCombined !== block.Current_Hash) violation = "CHAIN_BROKEN";

        if (violation) {
            invalidLogs.push({
                tx_id: log.Transaction_ID,
                violation: violation,
                severity: "HIGH",
                timestamp: log.Timestamp,
                status: "Tampered"
            });
        } else {
            verifiedCount++;
        }

        previousHash = block.Current_Hash;
    }

    return {
        invalidLogs,
        verifiedCount,
        totalAudits: new Set(auditLogs.map(l => l.Transaction_ID)).size,
        totalEntries: auditLogs.length
    };
}

// 1. Tampered Logs API
router.get('/tampered-logs', async (req, res) => {
    try {
        const data = await getVerificationData();
        res.json(data.invalidLogs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Admin Metrics API
router.get('/metrics', async (req, res) => {
    try {
        const data = await getVerificationData();

        // Try to fetch user count, fallback if table missing (resilience)
        let totalUsers = 0;
        try {
            const [users] = await db.query('SELECT COUNT(*) as count FROM users');
            totalUsers = users[0].count;
        } catch (e) {
            console.warn("User table not found or empty, defaulting to 0");
        }

        res.json({
            totalUsers,
            totalAudits: data.totalEntries, // Fixed: Count total events, not unique TXs
            uniqueTransactions: data.totalAudits,
            verifiedCount: data.verifiedCount,
            tamperedCount: data.invalidLogs.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. User Management API
router.get('/users', async (req, res) => {
    try {
        const [users] = await db.query('SELECT username, role, status, last_login FROM users');
        res.json(users);
    } catch (err) {
        // Fallback for demo if users table missing
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
