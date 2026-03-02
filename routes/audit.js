// Imports moved to where they are used for clarity and to include Evidence model
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Removed local sha256 helper
// ============================================
// PUBLIC ROUTES
// ============================================

// Fetch all audit logs (Admin Dashboard)
router.get('/logs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                Log_ID, Action_Type, Transaction_ID, Auditor_ID, Timestamp, Verification_Status
            FROM Audit_Log
            ORDER BY Transaction_ID DESC, Log_ID DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// TRANSACTION ROUTES (Business & Auditor)
// ============================================

// 1. Create Transaction (Business)
router.post('/transactions', async (req, res) => {
    console.log("Received POST /transactions payload:", req.body);
    try {
        const { Status, Date, Amount, Category, Description, Business_ID } = req.body;

        const [result] = await db.query(
            `INSERT INTO Transactions (Status, Date, Amount, Category, Description, Business_ID) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [Status || 'Pending', Date, Amount, Category, Description, Business_ID]
        );
        const transactionId = result.insertId;

        // Create Audit Log
        const [logResult] = await db.query(
            `INSERT INTO Audit_Log (Action_Type, Transaction_ID, Auditor_ID) VALUES ('CREATED', ?, 1)`,
            [transactionId]
        );
        const logId = logResult.insertId;

        // Fetch the inserted transaction to ensure we have exactly what DB stored (for hashing)
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        const txn = txRows[0];

        // Blockchain Anchoring
        const recordHash = sha256(getTransactionDataString(txn));
        let txHash = "PENDING_BLOCKCHAIN";

        try {
            const { contract, serverAccount } = await initContract();
            const receipt = await contract.methods.addAuditLog(logId, "CREATED", recordHash, "NO_EVIDENCE")
                .send({ from: serverAccount, gas: 800000 });

            txHash = receipt.transactionHash;
            await db.query(`UPDATE Audit_Log SET Record_Hash = ?, Blockchain_TX = ? WHERE Log_ID = ?`, [recordHash, txHash, logId]);
        } catch (bcError) {
            console.error("Blockchain Error:", bcError.message);
            txHash = "BLOCKCHAIN_FAILED";
        }

        // Notify Admin
        const io = req.app.get('io');
        if (io) io.emit('admin-refresh', { source: 'Audit_API', type: 'NEW_TRANSACTION', id: transactionId });

        res.json({
            message: "Transaction created successfully",
            transactionId: transactionId,
            status: txHash.startsWith('0x') ? "Verified on Blockchain" : "Stored Off-Chain",
            ethTxHash: txHash
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET Transactions with Filtering (Auditor)
router.get('/transactions', async (req, res) => {
    try {
        const { status } = req.query;
        let sql = `SELECT * FROM Transactions`;
        const params = [];

        if (status && status !== 'All' && status !== 'Tampered') {
            if (status === 'Pending') {
                sql += ` WHERE Status IN ('Pending', 'Created')`;
            } else {
                sql += ` WHERE Status = ?`;
                params.push(status);
            }
        }

        sql += ` ORDER BY Date DESC`;

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// AUDITOR ACTIONS
// ============================================

const { initContract, sha256, getTransactionDataString, isTransactionTampered } = require('../utils/blockchainService');
const Evidence = require('../models/Evidence'); // Need MongoDB model

// 3. POST /verify (Approve Transaction)
router.post('/verify', async (req, res) => {
    const { transactionId, auditorId, comments } = req.body;
    try {
        // Block actions on tampered records
        const tampered = await isTransactionTampered(transactionId, db, Evidence);
        if (tampered) {
            return res.status(403).json({ error: "SECURITY_BLOCK: This record has been tampered with. Actions are restricted." });
        }

        // Update Transaction Status
        await db.query(`UPDATE Transactions SET Status = 'Verified' WHERE Transaction_ID = ?`, [transactionId]);

        // Create Verification Log
        const [logRes] = await db.query(
            `INSERT INTO Audit_Log (Transaction_ID, Auditor_ID, Action_Type, Verification_Status) 
             VALUES (?, ?, 'VERIFIED', 'Match')`,
            [transactionId, auditorId]
        );
        const logId = logRes.insertId;

        // Fetch current transaction state for hashing
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        const txn = txRows[0];

        // Blockchain Anchor (Verify Action + Current Data Fingerprint)
        const recordHash = sha256(`${getTransactionDataString(txn)}|VERIFIED`);
        let txHash = "PENDING";

        try {
            const { contract, serverAccount } = await initContract();
            const receipt = await contract.methods.addAuditLog(logId, "VERIFIED", recordHash, "OK")
                .send({ from: serverAccount, gas: 800000 });
            txHash = receipt.transactionHash;
            await db.query(`UPDATE Audit_Log SET Record_Hash = ?, Blockchain_TX = ? WHERE Log_ID = ?`, [recordHash, txHash, logId]);
        } catch (e) {
            console.error("Blockchain Verify Error:", e);
        }

        // Add Review Record (if comments provided)
        if (comments) {
            await db.query(
                `INSERT INTO Reviews (Transaction_ID, Auditor_ID, Comments, Verdict) VALUES (?, ?, ?, 'APPROVED')`,
                [transactionId, auditorId, comments]
            );
        }

        // Notify Admin for Realtime update
        const io = req.app.get('io');
        if (io) io.emit('admin-refresh', { source: 'Audit_API', type: 'VERIFIED', id: transactionId });

        res.json({ success: true, txHash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. POST /reject (Reject Transaction)
router.post('/reject', async (req, res) => {
    const { transactionId, auditorId, comments } = req.body;
    try {
        // Block actions on tampered records
        const tampered = await isTransactionTampered(transactionId, db, Evidence);
        if (tampered) {
            return res.status(403).json({ error: "SECURITY_BLOCK: This record has been tampered with. Actions are restricted." });
        }

        await db.query(`UPDATE Transactions SET Status = 'Rejected' WHERE Transaction_ID = ?`, [transactionId]);

        // Log Rejection
        const [logRes] = await db.query(
            `INSERT INTO Audit_Log (Transaction_ID, Auditor_ID, Action_Type, Verification_Status) 
             VALUES (?, ?, 'REJECTED', 'Failed')`,
            [transactionId, auditorId]
        );
        const logId = logRes.insertId;

        // Fetch current transaction state for hashing
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        const txn = txRows[0];

        // Blockchain Anchor (Reject Action + Current Data Fingerprint)
        const recordHash = sha256(`${getTransactionDataString(txn)}|REJECTED`);

        try {
            const { contract, serverAccount } = await initContract();
            const receipt = await contract.methods.addAuditLog(logId, "REJECTED", recordHash, "OK")
                .send({ from: serverAccount, gas: 800000 });
            
            // Save TX Hash
            await db.query(`UPDATE Audit_Log SET Record_Hash = ?, Blockchain_TX = ? WHERE Log_ID = ?`, [recordHash, receipt.transactionHash, logId]);
        } catch (e) {
            console.error("Blockchain Reject Error:", e);
        }

        // Add Review Comment
        if (comments) {
            await db.query(
                `INSERT INTO Reviews (Transaction_ID, Auditor_ID, Comments, Verdict) VALUES (?, ?, ?, 'REJECTED')`,
                [transactionId, auditorId, comments]
            );
        }

        res.json({ success: true, message: "Transaction Rejected" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. POST /comment (Add standalone comment)
router.post('/comment', async (req, res) => {
    const { transactionId, auditorId, comments } = req.body;
    try {
        await db.query(
            `INSERT INTO Reviews (Transaction_ID, Auditor_ID, Comments, Verdict) VALUES (?, ?, ?, 'COMMENT')`,
            [transactionId, auditorId, comments]
        );

        // Log Comment Action
        const [logRes] = await db.query(
            `INSERT INTO Audit_Log (Transaction_ID, Auditor_ID, Action_Type) VALUES (?, ?, 'COMMENT_ADDED')`,
            [transactionId, auditorId]
        );
        const logId = logRes.insertId;

        // Fetch current transaction state for hashing
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        const txn = txRows[0];

        // Blockchain Anchor (Comment Action + Current Data Fingerprint)
        const recordHash = sha256(`${getTransactionDataString(txn)}|COMMENT_ADDED`);

        try {
            const { contract, serverAccount } = await initContract();
            const receipt = await contract.methods.addAuditLog(logId, "COMMENT_ADDED", recordHash, "OK")
                .send({ from: serverAccount, gas: 800000 });

            // Save TX Hash
            await db.query(`UPDATE Audit_Log SET Record_Hash = ?, Blockchain_TX = ? WHERE Log_ID = ?`, [recordHash, receipt.transactionHash, logId]);
        } catch (e) {
            console.error("Blockchain Comment Error:", e);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. GET /history/:id (Full Audit Trail)
router.get('/history/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [logs] = await db.query(
            `SELECT l.*, a.Name as AuditorName 
             FROM Audit_Log l 
             LEFT JOIN Auditor a ON l.Auditor_ID = a.Auditor_ID
             WHERE l.Transaction_ID = ? 
             ORDER BY l.Timestamp ASC`,
            [id]
        );

        const [reviews] = await db.query(
            `SELECT r.*, a.Name as AuditorName 
             FROM Reviews r
             LEFT JOIN Auditor a ON r.Auditor_ID = a.Auditor_ID
             WHERE r.Transaction_ID = ? 
             ORDER BY r.Review_ID ASC`,
            [id]
        );

        res.json({ logs, reviews });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
