const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Fetch all audit logs
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
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
