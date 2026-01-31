const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/audit_evidence', {
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false // Disable buffering so it fails fast
})
    .then(() => console.log('MongoDB connection initiated'))
    .catch(err => console.error('MongoDB connection skipped (not running)'));

mongoose.connection.once('open', () => {
    console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});
