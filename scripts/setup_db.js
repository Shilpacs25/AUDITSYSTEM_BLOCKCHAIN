require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    console.log('Setting up database...');
    
    // Connect without database selected to create it
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        const sqlPath = path.join(__dirname, '../reset.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // Split only by semicolon to get statements
        // We need to filter out the tamper commands at the end
        // The valid script ends around line 96 with the Insert into Transactions
        
        const statements = sqlContent.split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            // Stop if we reach the ad-hoc queries
            if (statement.toLowerCase().startsWith('select * from transactions')) {
                console.log('Reached end of setup script (ignoring ad-hoc queries).');
                break;
            }
            if (statement.toLowerCase().startsWith('-- tamper')) {
                 console.log('Reached tamper section (ignoring).');
                 break;
            }

            // Skip comments that might have been interpreted as statements if not handled cleanly
            // But usually split(';') is fine for this simple file
            
            try {
                await connection.query(statement);
                console.log(`Executed: ${statement.substring(0, 50)}...`);
            } catch (err) {
                // If it's just "database exists" or similar harmless error
                if (err.code === 'HY000' && statement.includes('DROP TABLE')) {
                     // ignore drop table errors if table doesn't exist (though usually IF EXISTS handles it)
                     console.log(`Note: ${err.message}`);
                } else {
                     console.error(`Error executing: ${statement.substring(0, 50)}...`);
                     console.error(err.message);
                }
            }
        }

        console.log('Database setup complete.');

    } catch (error) {
        console.error('Setup failed:', error);
    } finally {
        await connection.end();
    }
}

setupDatabase();
