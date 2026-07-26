const crypto = require("crypto");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "..", "database.sqlite");
console.log("[DB] SQLite em uso:", path.resolve(dbPath));
const db = new sqlite3.Database(dbPath);

function ensureColumn(tableName, columnName, definition, callback = () => {}) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      console.error(`Erro ao inspecionar colunas de ${tableName}:`, err);
      callback(err);
      return;
    }

    const hasColumn = columns.some((column) => column.name === columnName);
    if (hasColumn) {
      callback(null);
      return;
    }

    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
      if (alterErr) {
        console.error(`Erro ao adicionar coluna ${columnName} em ${tableName}:`, alterErr);
      } else {
        console.log(`✓ Coluna ${columnName} adicionada em ${tableName}`);
      }
      callback(alterErr || null);
    });
  });
}

function ensureGuestOfficialSituationColumns(callback = () => {}) {
  ensureColumn("guests", "fnrh_situacao_hospede_id", "TEXT", (situationErr) => {
    if (situationErr) {
      callback(situationErr);
      return;
    }

    ensureColumn("guests", "fnrh_situacao_synced_at", "TEXT", callback);
  });
}

function stopInitializationWithoutFnrhHospedeIdProtection(message) {
  console.error(message);
  setImmediate(() => {
    throw new Error("Inicializacao interrompida sem protecao unica de fnrh_hospede_id.");
  });
}

function ensureFnrhHospedeIdUniqueIndex() {
  ensureColumn("guests", "fnrh_hospede_id", "TEXT", (columnErr) => {
    if (columnErr) {
      stopInitializationWithoutFnrhHospedeIdProtection(
        "[DB] Nao foi possivel garantir guests.fnrh_hospede_id; indice unico nao criado."
      );
      return;
    }

    db.get(
      `SELECT COUNT(*) AS duplicate_count
       FROM (
         SELECT LOWER(TRIM(fnrh_hospede_id)) AS normalized_id
         FROM guests
         WHERE fnrh_hospede_id IS NOT NULL
           AND TRIM(fnrh_hospede_id) <> ''
         GROUP BY LOWER(TRIM(fnrh_hospede_id))
         HAVING COUNT(*) > 1
       )`,
      (auditErr, auditRow) => {
        if (auditErr) {
          stopInitializationWithoutFnrhHospedeIdProtection(
            "[DB] Falha ao auditar duplicidade de fnrh_hospede_id; indice unico nao criado."
          );
          return;
        }

        const duplicateCount = Number(auditRow?.duplicate_count || 0);
        if (duplicateCount > 0) {
          stopInitializationWithoutFnrhHospedeIdProtection(
            `[DB] Protecao de fnrh_hospede_id nao aplicada: ${duplicateCount} valor(es) duplicado(s) encontrado(s).`
          );
          return;
        }

        db.run(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_fnrh_hospede_id_unique
           ON guests (LOWER(TRIM(fnrh_hospede_id)))
           WHERE fnrh_hospede_id IS NOT NULL
             AND TRIM(fnrh_hospede_id) <> ''`,
          (indexErr) => {
            if (indexErr) {
              stopInitializationWithoutFnrhHospedeIdProtection(
                "[DB] Erro ao criar indice unico de fnrh_hospede_id."
              );
              return;
            }

            console.log("Indice unico de fnrh_hospede_id pronto");
          }
        );
      }
    );
  });
}

function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

function assignMissingStayPublicTokens() {
  db.all(`PRAGMA table_info(stays)`, (columnErr, columns) => {
    if (columnErr) {
      console.error("Erro ao inspecionar public_token em stays:", columnErr);
      return;
    }

    const hasPublicTokenColumn = columns.some((column) => column.name === "public_token");
    if (!hasPublicTokenColumn) {
      setTimeout(assignMissingStayPublicTokens, 100);
      return;
    }

    db.all(
      `SELECT id
       FROM stays
       WHERE public_token IS NULL OR TRIM(public_token) = ""`,
      (err, rows) => {
        if (err) {
          console.error("Erro ao buscar stays sem public_token:", err);
          return;
        }

        if (!rows.length) {
          return;
        }

        rows.forEach((row) => {
          const token = generatePublicToken();

          db.run(
            `UPDATE stays
             SET public_token = ?
             WHERE id = ? AND (public_token IS NULL OR TRIM(public_token) = "")`,
            [token, row.id],
            (updateErr) => {
              if (updateErr) {
                console.error(`Erro ao preencher public_token da stay #${row.id}:`, updateErr);
                return;
              }

              console.log(`✓ public_token gerado para stay #${row.id}`);
            }
          );
        });
      }
    );
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
      quantidade_hospede_adulto INTEGER DEFAULT 1,
      quantidade_hospede_menor INTEGER DEFAULT 0,
      fnrh_reserva_id TEXT,
      fnrh_link_precheckin_oficial TEXT,
      fnrh_last_status TEXT,
      fnrh_last_message TEXT,
      fnrh_last_sent_at TEXT,
      fnrh_last_guest_count_sent INTEGER,
      fnrh_last_guest_count_confirmed INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Erro ao criar tabela stays:", err);
    else console.log("✓ Tabela stays pronta");
  });

  ensureColumn("stays", "data_entrada", "TEXT");
  ensureColumn("stays", "data_saida", "TEXT");
  ensureColumn("stays", "quantidade_hospede_adulto", "INTEGER DEFAULT 1");
  ensureColumn("stays", "quantidade_hospede_menor", "INTEGER DEFAULT 0");
  ensureColumn("stays", "fnrh_last_status", "TEXT");
  ensureColumn("stays", "fnrh_last_message", "TEXT");
  ensureColumn("stays", "fnrh_last_sent_at", "TEXT");
  ensureColumn("stays", "fnrh_last_guest_count_sent", "INTEGER");
  ensureColumn("stays", "fnrh_last_guest_count_confirmed", "INTEGER");
  ensureColumn("stays", "fnrh_reserva_id", "TEXT");
  ensureColumn("stays", "fnrh_link_precheckin_oficial", "TEXT");
  ensureColumn("stays", "public_token", "TEXT");

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stays_public_token ON stays (public_token)`, (err) => {
    if (err) console.error("Erro ao criar índice idx_stays_public_token:", err);
    else console.log("✓ Índice idx_stays_public_token criado");
  });

  assignMissingStayPublicTokens();

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
      fnrh_hospede_id TEXT,
      fnrh_pessoa_id TEXT,
      fnrh_checkin_at TEXT,
      fnrh_checkout_at TEXT,
      fnrh_situacao_hospede_id TEXT,
      fnrh_situacao_synced_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stay_id) REFERENCES stays(id)
    )
  `, (err) => {
    if (err) console.error("Erro ao criar tabela guests:", err);
    else {
      console.log("✓ Tabela guests pronta");
      ensureGuestOfficialSituationColumns((situationColumnsErr) => {
        if (situationColumnsErr) {
          console.error("[DB] Nao foi possivel garantir as colunas de situacao oficial dos hospedes.");
          return;
        }
        ensureFnrhHospedeIdUniqueIndex();
      });
    }
  });

  ensureColumn("guests", "cidade_id", "TEXT");
  ensureColumn("guests", "estado_id", "TEXT");
  ensureColumn("guests", "cep", "TEXT");
  ensureColumn("guests", "logradouro", "TEXT");
  ensureColumn("guests", "numero", "TEXT");
  ensureColumn("guests", "complemento", "TEXT");
  ensureColumn("guests", "bairro", "TEXT");
  ensureColumn("guests", "vehicle_plate", "TEXT");
  ensureColumn("guests", "genero_id", "TEXT");
  ensureColumn("guests", "raca_id", "TEXT");
  ensureColumn("guests", "deficiencia_id", "TEXT");
  ensureColumn("guests", "fnrh_pessoa_id", "TEXT");
  ensureColumn("guests", "fnrh_checkin_at", "TEXT");
  ensureColumn("guests", "fnrh_checkout_at", "TEXT");

  // índice para otimizar busca de hóspedes por stay_id e cpf
  db.run(`CREATE INDEX IF NOT EXISTS idx_guests_stay_cpf ON guests (stay_id, cpf)`, (err) => {
    if (err) console.error("Erro ao criar índice idx_guests_stay_cpf:", err);
    else console.log("✓ Índice idx_guests_stay_cpf criado");
  });
});

module.exports = db;
