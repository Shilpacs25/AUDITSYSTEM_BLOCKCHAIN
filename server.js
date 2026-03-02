// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Database connections
require('./config/mongo');   // MongoDB connection
require('./config/db');      // MySQL connection

// Routes
const blockchainRoutes = require('./routes/blockchain');
const evidenceRoutes = require('./routes/evidence');
const auditRoutes = require('./routes/audit');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

// Create HTTP server (IMPORTANT for Socket.IO)
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with frontend URL
    methods: ["GET", "POST"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

console.log("Admin routes registered");

// Make socket available inside routes
app.set('io', io);

// Socket.IO connection listener
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Root route (for Render health check)
app.get('/', (req, res) => {
  res.send('Audit System Blockchain Backend Running 🚀');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global Error:", err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error("Unhandled Rejection:", err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// PORT (Render automatically provides process.env.PORT)
const PORT = process.env.PORT || 5001;

// Start server
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
