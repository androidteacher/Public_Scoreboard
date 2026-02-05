const express = require('express');
const db = require('../database');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', { user: req.session });
});

router.get('/stats', (req, res) => {
    res.render('stats', { user: req.session });
});

router.get('/unsolved', (req, res) => {
    // Select flags that are NOT in the submissions table
    db.all('SELECT * FROM flags WHERE id NOT IN (SELECT flag_id FROM submissions)', [], (err, rows) => {
        if (err) return res.status(500).send('Database error');
        res.render('unsolved', {
            user: req.session,
            flags: rows
        });
    });
});

router.get('/user/:id', (req, res) => {
    const userId = req.params.id;

    // Get User Details
    db.get('SELECT username, id FROM users WHERE id = ?', [userId], (err, profileUser) => {
        if (err || !profileUser) return res.redirect('/');

        // Get All Flags
        db.all('SELECT * FROM flags', [], (err, allFlags) => {
            if (err) return res.status(500).send('Database error');

            // Get User Submissions
            db.all('SELECT flag_id, timestamp FROM submissions WHERE user_id = ?', [userId], (err, subs) => {
                if (err) return res.status(500).send('Database error');

                // Get Bonus Points
                db.all('SELECT points, reason, timestamp FROM bonus_points WHERE user_id = ? ORDER BY timestamp DESC', [userId], (err, bonuses) => {
                    if (err) return res.status(500).send('Database error');

                    const solvedMap = new Map();
                    subs.forEach(s => solvedMap.set(s.flag_id, s.timestamp));

                    const flagsWithStatus = allFlags.map(f => ({
                        ...f,
                        solved: solvedMap.has(f.id),
                        solvedAt: solvedMap.get(f.id)
                    })).sort((a, b) => {
                        // Sort by solved first, then by point value
                        if (a.solved === b.solved) return b.points - a.points;
                        return a.solved ? -1 : 1;
                    });

                    res.render('user_profile', {
                        user: req.session,
                        profileUser,
                        flags: flagsWithStatus,
                        bonuses: bonuses || []
                    });
                });
            });
        });
    });
});

module.exports = router;
