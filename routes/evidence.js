const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const db = require('../config/db');
const EvidenceModel = require('../models/Evidence'); // Unified Name
const { initContract, sha256, getTransactionDataString } = require('../utils/blockchainService');

// ================= Multer Setup =================
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// ================= Upload Evidence =================
router.post('/upload/:transactionId', upload.single('file'), async (req, res) => {
    try {
        const transactionId = req.params.transactionId;
        console.log(`[EvidenceAPI] Uploading for TXN: ${transactionId}`);

        // 1️⃣ Generate SHA-256 hash of file
        const buffer = fs.readFileSync(req.file.path);
        const fileHash = sha256(buffer);

        // 2️⃣ Save evidence in MongoDB
        await EvidenceModel.create({
            transaction_id: Number(transactionId),
            document_type: req.body.document_type || 'Invoice',
            file_name: req.file.filename,
            file_hash: fileHash,
            storage_path: req.file.path,
            file_data: buffer,
            uploaded_by: 'Business User'
        });

        // 3️⃣ Fetch transaction for unified hashing
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        const txn = txRows[0];

        const bulkEvidenceHash = sha256(JSON.stringify([fileHash]));
        const recordHash = sha256(`${getTransactionDataString(txn)}|${bulkEvidenceHash}|UPDATED`);

        // 4️⃣ Create SQL audit log
        const [logResult] = await db.query(
            `INSERT INTO Audit_Log 
            (Verification_Status, Action_Type, Transaction_ID, Auditor_ID)
            VALUES (?, ?, ?, ?)`,
            ['Match', 'UPDATED', transactionId, 999]
        );
        const logId = logResult.insertId;

        // 5️⃣ Anchor to Blockchain
        let bcTxHash = "PENDING_ANCHOR";
        try {
            const { contract, serverAccount } = await initContract();
            const receipt = await contract.methods.addAuditLog(logId, "UPDATED", recordHash, bulkEvidenceHash)
                .send({ from: serverAccount, gas: 800000 });

            bcTxHash = receipt.transactionHash;
            await db.query(`UPDATE Audit_Log SET Record_Hash = ? WHERE Log_ID = ?`, [bcTxHash, logId]);
        } catch (bcErr) {
            console.error("[EvidenceAPI] Blockchain Anchor Failed:", bcErr.message);
        }

        // 6️⃣ Sync Invoice table
        const [invResult] = await db.query(
            `INSERT INTO Invoice (Transaction_ID, File_Hash, Storage_Path) VALUES (?, ?, ?)`,
            [transactionId, fileHash, req.file.path]
        );
        const invoiceId = invResult.insertId;

        res.json({
            message: 'Evidence uploaded successfully',
            file_name: req.file.filename,
            file_hash: fileHash,
            invoice_id: invoiceId,
            ref_id: transactionId,
            transactionId,
            eth_tx_hash: bcTxHash
        });

    } catch (err) {
        console.error('[EvidenceAPI] Upload failed:', err);
        res.status(500).json({ error: err.message });
    }
});


// ================= Retrieve Evidence (For Preview) =================
router.get('/:transactionId', async (req, res) => {
    try {
        const rawId = req.params.transactionId;
        const cleanId = rawId.toString().replace('TXN-', '');
        const txIdNum = Number(cleanId);

        console.log(`[EvidenceAPI] PREVIEW: TXN ${rawId} -> Number: ${txIdNum}`);

        if (isNaN(txIdNum)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        // Final safety: local require inside the route
        const LocalEvidence = require('../models/Evidence');
        const doc = await LocalEvidence.findOne({ transaction_id: txIdNum });

        if (!doc) {
            console.warn(`[EvidenceAPI] Not Found in Mongo: ${txIdNum}`);
            return res.status(404).json({ error: "Evidence not found" });
        }

        let contentType = 'application/octet-stream';
        const docFileName = doc.file_name || 'document.pdf';
        if (docFileName.toLowerCase().endsWith('.pdf')) contentType = 'application/pdf';
        else if (docFileName.match(/\.(jpg|jpeg|png)$/i)) contentType = 'image/jpeg';

        let buffer;
        if (doc.file_data && doc.file_data.length > 0) {
            // Case 1: Serving from MongoDB
            console.log(`[EvidenceAPI v3.0] Serving from DB: ${docFileName} (${doc.file_data.length} bytes)`);
            buffer = Buffer.isBuffer(doc.file_data) ? doc.file_data : Buffer.from(doc.file_data);
        } else if (doc.storage_path && fs.existsSync(doc.storage_path)) {
            // Case 2: Fallback to Disk
            console.log(`[EvidenceAPI v3.0] Fallback to Disk: ${doc.storage_path}`);
            buffer = fs.readFileSync(doc.storage_path);
        } else {
            console.error(`[EvidenceAPI v3.0] CRITICAL: File missing for TXN ${txIdNum}`);
            console.error(`- DB has no binary data`);
            console.error(`- Path not found on disk: "${doc.storage_path}"`);
            return res.status(404).json({ 
                error: "File content not found on server",
                path: doc.storage_path,
                txn: txIdNum
            });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${docFileName}"`);
        res.send(buffer);

    } catch (err) {
        console.error("[EvidenceAPI v3.0] PREVIEW ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
