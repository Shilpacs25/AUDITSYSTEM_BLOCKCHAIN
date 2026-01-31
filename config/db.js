const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('DB CONFIG USED BY NODE:');
console.log({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ? '***' : 'EMPTY',
    database: process.env.DB_NAME
});

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
    waitForConnections: true,
    connectionLimit: 50,      // Increased limit
    connectTimeout: 10000,
    acquireTimeout: 10000
});

pool.getConnection()
    .then(() => console.log('MySQL connected successfully'))
    .catch(err => console.error('DB connection failed:', err.message));

module.exports = pool;
