const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const csv = require('csv-parse/sync');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../data/scoreboard.db');
const answersPath = path.join(__dirname, '../flag_submit/answers.php');
const csvPath = path.join(__dirname, '../flag_submit/flag_rec.csv');

console.log('Migrating data...');

const db = new sqlite3.Database(dbPath);

// Schema Definition (duplicated from database.js to ensure standalone migration works)
function initSchema() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        points INTEGER NOT NULL,
        category TEXT,
        description TEXT
    )`);

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

    db.run(`CREATE TABLE IF NOT EXISTS bonus_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
}

const adminPass = 'admin';
const adminUser = 'admin';
const adminHash = bcrypt.hashSync(adminPass, 10);

function migrate() {
    db.serialize(() => {
        initSchema();

        // 1. Parse answers.php for Flags
        const answersContent = fs.readFileSync(answersPath, 'utf8');

        // Regex to find the $correct_answers array content
        const flagRegex = /array\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g;

        let match;
        const flags = [];
        while ((match = flagRegex.exec(answersContent)) !== null) {
            flags.push({
                name: match[1],
                value: match[2],
                points: parseInt(match[3])
            });
        }

        console.log(`Found ${flags.length} flags in answers.php.`);

        const stmtFlag = db.prepare("INSERT OR IGNORE INTO flags (name, value, points) VALUES (?, ?, ?)");

        flags.forEach(flag => {
            stmtFlag.run(flag.name, flag.value, flag.points, function (err) {
                if (err) console.error(err);
            });
        });

        stmtFlag.finalize(() => {
            console.log("Flags imported. Skipping user data import for public build.");
            createAdmin();
        });
    });
}

function createAdmin() {
    db.get('SELECT * FROM users WHERE username = ?', [adminUser], (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')", [adminUser, adminHash], (err) => {
                if (err) console.error("Error creating admin:", err);
                else console.log("Admin account 'admin' created.");
                db.close();
            });
        } else {
            console.log("Admin account already exists.");
            // Ensure role is admin
            db.run("UPDATE users SET role = 'admin' WHERE username = ?", [adminUser], () => {
                db.close();
            });
        }
    });
}

migrate();
