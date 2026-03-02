const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function resetDb() {
    console.log("🔄 Connecting to Database...");
    
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true // Important for running the full script
    });

    console.log("📂 Reading reset.sql...");
    const sqlFile = path.join(__dirname, '../reset.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log("🚀 Executing Schema Reset...");
    try {
        await connection.query(sql);
        console.log("✅ Database Reset Successfully!");
        console.log("   - Tables Dropped & Recreated");
        console.log("   - 'Record_Hash' size increased");
        console.log("   - Seed Data Inserted");
    } catch (err) {
        console.error("❌ Reset Failed:", err.message);
    } finally {
        await connection.end();
        process.exit();
    }
}

resetDb();
