const express = require('express');
const db = require('../database');
const { isAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(isAdmin); // Protect all routes

router.get('/dashboard', (req, res) => {
    res.render('admin_dashboard');
});

// User Management Routes
router.get('/users', (req, res) => {
    res.render('admin_users');
});

router.get('/users/data', (req, res) => {
    db.all('SELECT id, username, role FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/users/delete', (req, res) => {
    const { userId } = req.body;

    db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.username === 'admin') {
            return res.status(403).json({ error: 'Cannot delete the admin user.' });
        }

        // Transaction-like cleanup (SQLite serializes this anyway)
        db.serialize(() => {
            db.run('DELETE FROM submissions WHERE user_id = ?', [userId]);
            db.run('DELETE FROM bonus_points WHERE user_id = ?', [userId]);
            db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });
});

// Consolidated User Save (Insert or Update)
router.post('/users/save', async (req, res) => {
    const { id, username, password, role } = req.body;
    const bcrypt = require('bcrypt');

    if (id) {
        // Update
        let sql = 'UPDATE users SET username = ?, role = ?';
        let params = [username, role];

        if (password && password.trim() !== '') {
            sql += ', password_hash = ?';
            params.push(await bcrypt.hash(password, 10));
        }
        sql += ' WHERE id = ?';
        params.push(id);

        db.run(sql, params, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        // Insert
        if (!password) return res.status(400).json({ error: 'Password required for new user' });
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [username, hashedPassword, role],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    }
});

router.post('/users/reset-password', async (req, res) => {
    const { userId, newPassword } = req.body;
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Bonus Points Management
router.get('/users/bonuses/:userId', (req, res) => {
    const { userId } = req.params;
    db.all('SELECT * FROM bonus_points WHERE user_id = ? ORDER BY timestamp DESC', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/users/bonuses/add', (req, res) => {
    const { userId, points, reason } = req.body;
    db.run('INSERT INTO bonus_points (user_id, points, reason) VALUES (?, ?, ?)',
        [userId, points, reason || 'Admin Adjustment'],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

router.post('/users/bonuses/delete', (req, res) => {
    const { id } = req.body;
    db.run('DELETE FROM bonus_points WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// User Flag Status Management
router.get('/users/flags/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = `
        SELECT f.id as flag_id, f.name, f.points, f.category, s.id as submission_id, s.timestamp
        FROM flags f
        LEFT JOIN submissions s ON f.id = s.flag_id AND s.user_id = ?
        ORDER BY f.category, f.name
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/submissions/create', (req, res) => {
    const { userId, flagId } = req.body;

    // Get flag points first
    db.get('SELECT points FROM flags WHERE id = ?', [flagId], (err, flag) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!flag) return res.status(404).json({ error: 'Flag not found' });

        db.run('INSERT INTO submissions (user_id, flag_id, points_awarded) VALUES (?, ?, ?)',
            [userId, flagId, flag.points],
            (err) => {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.json({ success: false, message: 'Already solved' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true });
            }
        );
    });
});

router.post('/submissions/delete', (req, res) => {
    const { userId, flagId } = req.body;
    db.run('DELETE FROM submissions WHERE user_id = ? AND flag_id = ?', [userId, flagId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// Flag Management
router.get('/flags', (req, res) => {
    res.render('admin_flags');
});

router.get('/flags/data', (req, res) => {
    db.all('SELECT * FROM flags', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/flags/save', (req, res) => {
    const { id, name, value, points, category, is_first_blood, first_blood_bonus } = req.body;
    const isFirstBlood = is_first_blood ? 1 : 0;
    const bonus = first_blood_bonus ? parseInt(first_blood_bonus) : 0;

    if (id) {
        // Update
        db.run('UPDATE flags SET name = ?, value = ?, points = ?, category = ?, is_first_blood = ?, first_blood_bonus = ? WHERE id = ?',
            [name, value, points, category, isFirstBlood, bonus, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });

                // Retroactive Point Adjustment: Update all previous submissions
                db.run('UPDATE submissions SET points_awarded = ? WHERE flag_id = ?', [points, id], (err) => {
                    if (err) console.error("Failed to cascade points update:", err);
                    res.json({ success: true });
                });
            }
        );
    } else {
        // Insert
        db.run('INSERT INTO flags (name, value, points, category, is_first_blood, first_blood_bonus) VALUES (?, ?, ?, ?, ?, ?)',
            [name, value, points, category, isFirstBlood, bonus],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    }
});

router.post('/flags/delete', (req, res) => {
    const { id } = req.body;
    db.serialize(() => {
        db.run('DELETE FROM submissions WHERE flag_id = ?', [id]);
        db.run('DELETE FROM flags WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');

// Backup Export
router.get('/backup/export', (req, res) => {
    db.serialize(() => {
        const backup = { timestamp: new Date().toISOString() };
        db.all('SELECT * FROM users', [], (err, rows) => {
            if (err) return res.status(500).send(err.message);
            backup.users = rows;
            db.all('SELECT * FROM flags', [], (err, rows) => {
                if (err) return res.status(500).send(err.message);
                backup.flags = rows;
                db.all('SELECT * FROM submissions', [], (err, rows) => {
                    if (err) return res.status(500).send(err.message);
                    backup.submissions = rows;
                    db.all('SELECT * FROM bonus_points', [], (err, rows) => {
                        if (err) return res.status(500).send(err.message);
                        backup.bonus_points = rows;

                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Content-Disposition', `attachment; filename=scoreboard-backup-${new Date().getTime()}.json`);
                        res.json(backup);
                    });
                });
            });
        });
    });
});

// Backup Import UI
router.get('/backup', (req, res) => {
    res.render('admin_backup');
});

// Backup Restore API
router.post('/backup/import', upload.single('backupFile'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    const filePath = req.file.path;
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading file.');

        try {
            const backup = JSON.parse(data);

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Wipe Tables
                db.run('DELETE FROM submissions');
                db.run('DELETE FROM bonus_points');
                db.run('DELETE FROM users');
                db.run('DELETE FROM flags');

                // 2. Restore Users
                // Need to use ID to preserve relationships
                const stmtUser = db.prepare('INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
                backup.users.forEach(u => {
                    // Check if email exists in backup (backward compatibility)
                    const email = u.email || null;
                    stmtUser.run(u.id, u.username, email, u.password_hash, u.role, u.created_at);
                });
                stmtUser.finalize();

                // 3. Restore Flags
                const stmtFlag = db.prepare('INSERT INTO flags (id, name, value, points, category, description) VALUES (?, ?, ?, ?, ?, ?)');
                backup.flags.forEach(f => {
                    stmtFlag.run(f.id, f.name, f.value, f.points, f.category, f.description);
                });
                stmtFlag.finalize();

                // 4. Restore Submissions
                const stmtSub = db.prepare('INSERT INTO submissions (id, user_id, flag_id, points_awarded, timestamp, is_legacy) VALUES (?, ?, ?, ?, ?, ?)');
                backup.submissions.forEach(s => {
                    stmtSub.run(s.id, s.user_id, s.flag_id, s.points_awarded, s.timestamp, s.is_legacy);
                });
                stmtSub.finalize();

                // 5. Restore Bonus Points
                const stmtBonus = db.prepare('INSERT INTO bonus_points (id, user_id, points, reason, timestamp) VALUES (?, ?, ?, ?, ?)');
                if (backup.bonus_points) { // In case old backup without table
                    backup.bonus_points.forEach(b => {
                        stmtBonus.run(b.id, b.user_id, b.points, b.reason, b.timestamp);
                    });
                }
                stmtBonus.finalize();

                db.run('COMMIT', (err) => {
                    fs.unlinkSync(filePath); // Cleanup
                    if (err) return res.status(500).send('Transaction Commit Error: ' + err.message);
                    res.send('<script>alert("Restore Successful!"); window.location.href="/admin/backup";</script>');
                });
            });
        } catch (e) {
            fs.unlinkSync(filePath);
            return res.status(500).send('Invalid JSON Format: ' + e.message);
        }
    });
});

module.exports = router;
