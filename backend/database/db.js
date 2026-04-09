const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT,
      reservation_id TEXT,
      sub_reservation_id TEXT,
      full_name TEXT,
      first_name TEXT,
      last_name TEXT,
      cpf TEXT,
      email TEXT,
      phone TEXT,
      birth_date TEXT,
      status TEXT,
      fnrh_status TEXT,
      fnrh_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;