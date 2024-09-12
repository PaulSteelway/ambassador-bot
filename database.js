const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('ambassadors.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_name TEXT UNIQUE NOT NULL,
            nickname TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            executor TEXT NOT NULL
        )
    `);
});

module.exports = db;
