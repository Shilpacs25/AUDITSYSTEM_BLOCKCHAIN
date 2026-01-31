const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const Evidence = require('../models/Evidence');
const db = require('../config/db');

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

        // 1️⃣ Generate SHA-256 hash of file
        const buffer = fs.readFileSync(req.file.path);
        const fileHash = crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');

        // 2️⃣ Save evidence in MongoDB
        await Evidence.create({
            transaction_id: transactionId,
            document_type: req.body.document_type || 'Invoice',
            file_name: req.file.filename,
            file_hash: fileHash,
            storage_path: req.file.path,
            uploaded_by: 'Business User'
        });

        // 3️⃣ Create SQL audit log (SYSTEM auditor)
        await db.query(
            `INSERT INTO Audit_Log 
            (Record_Hash, Verification_Status, Action_Type, Timestamp, Transaction_ID, Auditor_ID)
            VALUES (?, ?, ?, NOW(), ?, ?)`,
            [
                fileHash,
                'PENDING',
                'UPDATED',       // Evidence modification
                transactionId,
                999              // ✅ SYSTEM auditor
            ]
        );

        // 4️⃣ Respond to frontend
        // 4️⃣ Notify Admin & Respond
        const io = req.app.get('io');
        if (io) {
            io.emit('admin-refresh', {
                source: 'Evidence_API',
                type: 'UPLOAD',
                timestamp: new Date()
            });
        }

        res.json({
            message: 'Evidence uploaded successfully',
            file_hash: fileHash,
            transactionId
        });

    } catch (err) {
        console.error('Evidence upload failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
