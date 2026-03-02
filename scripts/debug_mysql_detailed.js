require('dotenv').config();
const mysql = require('mysql2/promise');

async function check(config) {
    console.log(`Trying connect to ${config.user}@${config.host}:${config.port} with password ending in ...${config.password.slice(-3)}`);
    try {
        const conn = await mysql.createConnection(config);
        console.log('SUCCESS! connected.');
        await conn.end();
        return true;
    } catch (err) {
        console.log(`FAILED: [${err.code}] ${err.message}`);
        return false;
    }
}

async function run() {
    const pass = process.env.DB_PASSWORD || '';

    // Try standard
    await check({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: pass,
        port: 3306
    });

    // Try port 3307 just in case
    await check({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: pass,
        port: 3307
    });

    // Try no password
    if (pass) {
        await check({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: '',
            port: 3306
        });
    }
}

run();
