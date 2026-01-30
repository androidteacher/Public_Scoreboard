const db = require('../src/database');

db.serialize(() => {
    // Add is_first_blood column
    db.run("ALTER TABLE flags ADD COLUMN is_first_blood BOOLEAN DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error("Error adding is_first_blood:", err.message);
        } else {
            console.log("Added is_first_blood column.");
        }
    });

    // Add first_blood_bonus column
    db.run("ALTER TABLE flags ADD COLUMN first_blood_bonus INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error("Error adding first_blood_bonus:", err.message);
        } else {
            console.log("Added first_blood_bonus column.");
        }
    });
});
