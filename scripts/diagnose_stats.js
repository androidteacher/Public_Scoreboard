const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/scoreboard.db');
const db = new sqlite3.Database(dbPath);

const targetUser = "Ahaan Wanvari"; // Or whatever user you want to check

console.log(`Diagnosing stats for user: ${targetUser}`);

db.serialize(() => {
    // 1. Get User ID
    db.get("SELECT id, username FROM users WHERE username = ?", [targetUser], (err, user) => {
        if (err || !user) {
            console.error("User not found", err);
            return;
        }
        console.log(`User ID: ${user.id}`);

        // 2. Dump Raw Submissions
        console.log("\n--- Raw Submissions (Last 5) ---");
        db.all(`
            SELECT s.id, s.flag_id, f.name, s.points_awarded, s.timestamp, s.is_legacy 
            FROM submissions s
            JOIN flags f ON s.flag_id = f.id
            WHERE s.user_id = ?
            ORDER BY s.timestamp DESC
            LIMIT 5
        `, [user.id], (err, subs) => {
            if (err) console.error(err);
            console.table(subs);

            // 3. Run Stats Logic Query
            console.log("\n--- Stats Logic Output ---");
            const eventSql = `
                SELECT u.username, strftime('%Y-%m-%dT%H:%M:%SZ', t.timestamp) as timestamp, t.points, t.reason
                FROM users u
                JOIN (
                    SELECT user_id, timestamp, points_awarded as points, (SELECT name FROM flags WHERE id = submissions.flag_id) as reason FROM submissions WHERE is_legacy = 0 AND timestamp IS NOT NULL
                    UNION ALL
                    SELECT user_id, timestamp, points, reason FROM bonus_points
                ) t ON u.id = t.user_id
                WHERE u.username = ?
                ORDER BY t.timestamp ASC
            `;

            db.all(eventSql, [targetUser], (err, events) => {
                if (err) console.error(err);
                if (events.length === 0) {
                    console.log("No events found in Stats Query!");
                } else {
                    console.log(`Found ${events.length} events in Stats Query.`);
                    // Show last 3 events
                    console.log(events.slice(-3));
                }

                // 4. Check Base Score logic
                const baseScoreSql = `
                    SELECT u.username, COALESCE(SUM(s.points_awarded), 0) as base_score
                    FROM users u
                    LEFT JOIN submissions s ON u.id = s.user_id AND s.is_legacy = 1
                    WHERE u.username = ?
                    GROUP BY u.username
                `;
                db.get(baseScoreSql, [targetUser], (err, row) => {
                    console.log("\n--- Base Score (Legacy) ---");
                    console.log(row);

                    // 5. Check Top 100 Cutoff
                    const globalBaseSql = `
                        SELECT u.username, COALESCE(SUM(s.points_awarded), 0) as score
                        FROM users u
                        LEFT JOIN submissions s ON u.id = s.user_id
                        GROUP BY u.username
                        ORDER BY score DESC
                        LIMIT 1 OFFSET 99
                    `;
                    db.get(globalBaseSql, [], (err, cutoff) => {
                        console.log("\n--- Top 100 Cutoff ---");
                        console.log(cutoff || "Fewer than 100 users");
                    });
                });
            });
        });
    });
});
