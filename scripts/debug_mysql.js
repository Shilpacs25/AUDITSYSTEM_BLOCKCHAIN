require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection(password, label) {
    console.log(`Testing connection with ${label}...`);
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: password
        });
        console.log(`SUCCESS: Connected with ${label}!`);
        await connection.end();
        return true;
    } catch (err) {
        console.log(`FAILED with ${label}: ${err.message}`);
        return false;
    }
}

async function run() {
    console.log(`User from env: ${process.env.DB_USER}`);
    console.log(`Host from env: ${process.env.DB_HOST}`);

    // Test 1: Password from .env
    const envPass = process.env.DB_PASSWORD;
    if (await testConnection(envPass, 'password from .env')) return;

    // Test 2: Empty password
    if (await testConnection('', 'EMPTY password')) return;

    // Test 3: 'root' as password
    if (await testConnection('root', 'password "root"')) return;

    // Test 4: 'password' as password
    if (await testConnection('password', 'password "password"')) return;

    console.log('\nAll connection attempts failed. Please verify your MySQL credentials.');
}

run();
