const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'scoreboard.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initSchema();
    }
});

function initSchema() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT, -- Nullable for legacy users who haven't claimed accounts
            role TEXT DEFAULT 'user', -- 'user' or 'admin'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Flags Table
        db.run(`CREATE TABLE IF NOT EXISTS flags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            points INTEGER NOT NULL,
            category TEXT,
            description TEXT,
            is_first_blood BOOLEAN DEFAULT 0,
            first_blood_bonus INTEGER DEFAULT 0
        )`, (err) => {
            if (!err) {
                // Attempt migrations for existing tables (silent failure if col exists)
                db.run("ALTER TABLE flags ADD COLUMN is_first_blood BOOLEAN DEFAULT 0", () => { });
                db.run("ALTER TABLE flags ADD COLUMN first_blood_bonus INTEGER DEFAULT 0", () => { });
            }
        });

        // Submissions Table
        db.run(`CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            flag_id INTEGER NOT NULL,
            points_awarded INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_legacy BOOLEAN DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(flag_id) REFERENCES flags(id),
            UNIQUE(user_id, flag_id)
        )`);

        // Bonus Points Table
        db.run(`CREATE TABLE IF NOT EXISTS bonus_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            reason TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        console.log('Database schema initialized.');
    });
}

module.exports = db;
