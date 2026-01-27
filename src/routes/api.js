const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

// Public Scoreboard Data
router.get('/scoreboard', (req, res) => {
    const sql = `
        SELECT u.id, u.username, COALESCE(SUM(t.points), 0) as score
        FROM users u
        LEFT JOIN (
            SELECT user_id, points_awarded as points FROM submissions
            UNION ALL
            SELECT user_id, points FROM bonus_points
        ) t ON u.id = t.user_id
        GROUP BY u.id
        ORDER BY score DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Flag Submission
router.post('/submit', isAuthenticated, (req, res) => {
    const { flagValue } = req.body;
    const userId = req.session.userId;

    // Find flag by value
    db.get('SELECT * FROM flags WHERE value = ?', [flagValue.trim()], (err, flag) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!flag) return res.json({ success: false, message: 'Invalid Flag' });

        // Check for duplicate submission
        db.get('SELECT * FROM submissions WHERE user_id = ? AND flag_id = ?', [userId, flag.id], (err, sub) => {
            if (sub) return res.json({ success: false, message: 'Already Solved' });

            // Record submission
            db.run('INSERT INTO submissions (user_id, flag_id, points_awarded) VALUES (?, ?, ?)',
                [userId, flag.id, flag.points],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({ success: true, message: `Flag Solved! +${flag.points} points` });
                }
            );
        });
    });
});

// User Dashboard Data (Solved flags)
router.get('/user/solved', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    db.all(`
        SELECT f.name, f.points, s.points_awarded, s.timestamp 
        FROM submissions s 
        JOIN flags f ON s.flag_id = f.id 
        WHERE s.user_id = ?
        ORDER BY s.timestamp DESC
    `, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Cumulative Stats for Graph
router.get('/stats', (req, res) => {
    // 1. Get Base Scores (Legacy)
    const baseScoreSql = `
        SELECT u.username, COALESCE(SUM(s.points_awarded), 0) as base_score
        FROM users u
        LEFT JOIN submissions s ON u.id = s.user_id AND s.is_legacy = 1
        GROUP BY u.username
    `;

    db.all(baseScoreSql, [], (err, baseRows) => {
        if (err) return res.status(500).json({ error: err.message });

        const baseScores = {};
        baseRows.forEach(r => {
            baseScores[r.username] = r.base_score;
        });

        // 2. Fetch all time-series events (New Submissions + Bonus Points)
        const eventSql = `
            SELECT u.username, strftime('%Y-%m-%dT%H:%M:%SZ', t.timestamp) as timestamp, t.points, t.reason, t.timestamp as raw_ts
            FROM users u
            JOIN (
                SELECT user_id, timestamp, points_awarded as points, (SELECT name FROM flags WHERE id = submissions.flag_id) as reason FROM submissions WHERE is_legacy = 0 AND timestamp IS NOT NULL
                UNION ALL
                SELECT user_id, timestamp, points, reason FROM bonus_points
            ) t ON u.id = t.user_id
            ORDER BY t.timestamp ASC
        `;

        db.all(eventSql, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            // Calculate Final Scores for Top 20 logic
            const finalScores = { ...baseScores };
            rows.forEach(r => {
                if (!finalScores[r.username]) finalScores[r.username] = 0;
                finalScores[r.username] += r.points;
            });

            const topUsers = Object.entries(finalScores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(e => e[0]);

            const topUserSet = new Set(topUsers);

            // Build Datasets
            const userSeries = {};
            const currentScores = { ...baseScores };

            rows.forEach(row => {
                if (!topUserSet.has(row.username)) return;

                if (!userSeries[row.username]) {
                    userSeries[row.username] = [];
                    // Add initial base score point if desired? 
                    // No, client wants "Point prior to flag is total score".
                    // If no events, no graph. Correct.
                }

                if (currentScores[row.username] === undefined) currentScores[row.username] = 0;

                const oldScore = currentScores[row.username];
                const newScore = oldScore + row.points;
                currentScores[row.username] = newScore;

                // Create Diagonal Step
                // Point A: 30 seconds before event, at Old Score
                // row.timestamp is ISO string (e.g., 2026-01-27T02:00:00Z)
                const eventTime = new Date(row.timestamp);
                const prevTime = new Date(eventTime.getTime() - 30000); // 30s prior

                userSeries[row.username].push({
                    x: prevTime.toISOString(),
                    y: oldScore,
                    reason: 'Previous Total'
                });

                // Point B: Event time, at New Score
                userSeries[row.username].push({
                    x: row.timestamp,
                    y: newScore,
                    reason: row.reason || 'Adjustment',
                    pointsDelta: row.points
                });
            });

            // Convert to array
            const datasets = [];
            for (const [username, data] of Object.entries(userSeries)) {
                const hash = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const hue = (hash * 137.508) % 360;
                const color = `hsl(${hue}, 70%, 50%)`;

                datasets.push({
                    label: username,
                    data: data,
                    borderColor: color,
                    backgroundColor: color,
                    tension: 0.1,
                    fill: false,
                    borderWidth: 2,
                    pointRadius: 3
                });
            }

            res.json({ datasets });
        });
    });
});

module.exports = router;
