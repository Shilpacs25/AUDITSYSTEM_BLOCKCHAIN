const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db'); // MySQL connection

// ======================
// Login API
// ======================
router.post('/login', async (req, res) => {
    const { role, username, password } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM Users WHERE Role = ? AND Username = ?",
            [role, username]
        );

        if (!rows.length) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.Password);

        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.json({ message: 'Login successful', userId: user.User_ID, role: user.Role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// ======================
// Register API (optional)
// ======================
router.post('/register', async (req, res) => {
    const { role, username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            "INSERT INTO Users (Role, Username, Password) VALUES (?, ?, ?)",
            [role, username, hashedPassword]
        );
        res.json({ message: 'User registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
