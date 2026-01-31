const express = require('express');
const router = express.Router();

// MOCK AUTH (EXAM SAFE)
router.post('/login', (req, res) => {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    // Mock success
    res.json({
        success: true,
        role,
        username
    });
});

module.exports = router;
