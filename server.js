require('dotenv').config();   // MUST be first

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

require('./config/mongo');    // Mongo
require('./config/db');       // MySQL

const blockchainRoutes = require('./routes/blockchain');
const evidenceRoutes = require('./routes/evidence');
const auditRoutes = require('./routes/audit');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app); // ALL TRAFFIC THROUGH HTTP SERVER
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/blockchain', blockchainRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes); // Alias for direct access/testing

console.log("Admin routes registered");

// Make Socket.IO available to routes
app.set('io', io);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
