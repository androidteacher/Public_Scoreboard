const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const router = express.Router();

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.render('login', { error: 'Database error' });

        if (!user) return res.render('login', { error: 'Invalid credentials' });

        // Check password (all users should have one now, either from register or migration)
        if (!user.password_hash) {
            // Fallback if somehow a user has no password
            return res.render('login', { error: 'Account has no password. Contact admin.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            return res.redirect('/dashboard');
        } else {
            return res.render('login', { error: 'Invalid credentials' });
        }
    });
});

router.post('/change-password', require('../middleware/auth').isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
        if (err || !user) return res.redirect('/dashboard?error=UserError');

        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return res.redirect('/dashboard?error=IncorrectPassword');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId], (err) => {
            if (err) return res.redirect('/dashboard?error=UpdateFailed');
            res.redirect('/dashboard?success=PasswordChanged');
        });
    });
});

router.get('/change-password', require('../middleware/auth').isAuthenticated, (req, res) => {
    const user = { userId: req.session.userId, username: req.session.username, role: req.session.role };
    res.render('change_password', { error: req.query.error, user });
});

router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user exists
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (user) {
            return res.render('register', { error: 'Username already taken. Please login.' });
        } else {
            // New user
            db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword], function (err) {
                if (err) return res.render('register', { error: 'Error creating account' });
                req.session.userId = this.lastID;
                req.session.username = username;
                req.session.role = 'user';
                return res.redirect('/dashboard');
            });
        }
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;
