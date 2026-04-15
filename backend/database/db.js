const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.sqlite");

function ensureColumn(tableName, columnName, definition) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      console.error(`Erro ao inspecionar colunas de ${tableName}:`, err);
      return;
    }

    const hasColumn = columns.some((column) => column.name === columnName);
    if (hasColumn) return;

    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
      if (alterErr) {
        console.error(`Erro ao adicionar coluna ${columnName} em ${tableName}:`, alterErr);
      } else {
        console.log(`✓ Coluna ${columnName} adicionada em ${tableName}`);
      }
    });
  });
}

db.serialize(() => {
  // estrutura atual
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
  `, (err) => {
    if (err) console.error("Erro ao criar tabela checkins:", err);
    else console.log("✓ Tabela checkins pronta");
  });

  // nova estrutura: contexto da suíte
  db.run(`
    CREATE TABLE IF NOT EXISTS stays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      reservation_id TEXT NOT NULL,
      sub_reservation_id TEXT NOT NULL,
      data_entrada TEXT,
      data_saida TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Erro ao criar tabela stays:", err);
    else console.log("✓ Tabela stays pronta");
  });

  ensureColumn("stays", "data_entrada", "TEXT");
  ensureColumn("stays", "data_saida", "TEXT");

  // nova estrutura: hóspedes da suíte
  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stay_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      cpf TEXT,
      email TEXT,
      phone TEXT,
      birth_date TEXT,
      genero_id TEXT,
      raca_id TEXT,
      deficiencia_id TEXT,
      cidade_id TEXT,
      estado_id TEXT,
      cep TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      is_adult INTEGER DEFAULT 1,
      is_main_guest INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      fnrh_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stay_id) REFERENCES stays(id)
    )
  `, (err) => {
    if (err) console.error("Erro ao criar tabela guests:", err);
    else console.log("✓ Tabela guests pronta");
  });

  ensureColumn("guests", "cidade_id", "TEXT");
  ensureColumn("guests", "estado_id", "TEXT");
  ensureColumn("guests", "cep", "TEXT");
  ensureColumn("guests", "logradouro", "TEXT");
  ensureColumn("guests", "numero", "TEXT");
  ensureColumn("guests", "complemento", "TEXT");
  ensureColumn("guests", "bairro", "TEXT");
  ensureColumn("guests", "genero_id", "TEXT");
  ensureColumn("guests", "raca_id", "TEXT");
  ensureColumn("guests", "deficiencia_id", "TEXT");

  // índice para otimizar busca de hóspedes por stay_id e cpf
  db.run(`CREATE INDEX IF NOT EXISTS idx_guests_stay_cpf ON guests (stay_id, cpf)`, (err) => {
    if (err) console.error("Erro ao criar índice idx_guests_stay_cpf:", err);
    else console.log("✓ Índice idx_guests_stay_cpf criado");
  });
});

module.exports = db;
