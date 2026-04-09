console.log("SERVER COM SUB_RESERVATION_ID 🚀");

const db = require("./database/db");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const PROPERTY_ID = "vivamar";

// =========================
// Funções auxiliares
// =========================

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCPF(cpf) {
  cpf = onlyDigits(cpf);

  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cpf.charAt(i)) * (10 - i);
  }

  let firstDigit = 11 - (sum % 11);
  if (firstDigit >= 10) firstDigit = 0;
  if (firstDigit !== Number(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cpf.charAt(i)) * (11 - i);
  }

  let secondDigit = 11 - (sum % 11);
  if (secondDigit >= 10) secondDigit = 0;
  if (secondDigit !== Number(cpf.charAt(10))) return false;

  return true;
}

function isValidBirthDate(dateString) {
  if (!dateString) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function buildFNRHPayload(checkin) {
  return {
    hospede: {
      nomeCompleto: checkin.full_name,
      cpf: checkin.cpf,
      dataNascimento: checkin.birth_date,
      telefone: checkin.phone,
      email: checkin.email
    },
    reserva: {
      idReserva: checkin.reservation_id,
      idSubReserva: checkin.sub_reservation_id,
      dataEntrada: null,
      dataSaida: null
    },
    sistema: {
      propertyId: checkin.property_id,
      criadoEm: checkin.created_at
    }
  };
}

// =========================
// Rotas
// =========================

app.get("/", (req, res) => {
  res.send("FNRH Integration API rodando 🚀");
});

app.get("/checkins", (req, res) => {
  db.all(
    "SELECT * FROM checkins WHERE property_id = ? ORDER BY created_at DESC",
    [PROPERTY_ID],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar dados:", err);
        return res.status(500).json({ error: "Erro ao buscar dados" });
      }

      res.json(rows);
    }
  );
});

app.post("/checkin", (req, res) => {
  const {
    reservation_id,
    sub_reservation_id,
    full_name,
    cpf,
    email,
    phone,
    birth_date
  } = req.body;

  if (!reservation_id || !full_name || !cpf) {
    return res.status(400).json({
      error: "ID da reserva, nome completo e CPF são obrigatórios"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();
  const fullName = String(full_name).trim();
  const cpfClean = onlyDigits(cpf);
  const phoneClean = onlyDigits(phone);
  const birthDateClean = String(birth_date || "").trim();
  const emailClean = String(email || "").trim();

  if (!isValidCPF(cpfClean)) {
    return res.status(400).json({
      error: "CPF inválido"
    });
  }

  if (!isValidBirthDate(birthDateClean)) {
    return res.status(400).json({
      error: "Data de nascimento inválida"
    });
  }

  const { firstName, lastName } = splitName(fullName);

  db.get(
    `SELECT * FROM checkins
     WHERE cpf = ? AND sub_reservation_id = ? AND property_id = ?`,
    [cpfClean, subReservationId, PROPERTY_ID],
    (err, row) => {
      if (err) {
        console.error("Erro ao consultar:", err);
        return res.status(500).json({ error: "Erro no banco" });
      }

      if (row) {
        db.run(
          `UPDATE checkins
           SET reservation_id = ?, full_name = ?, first_name = ?, last_name = ?, email = ?, phone = ?, birth_date = ?, status = ?
           WHERE cpf = ? AND sub_reservation_id = ? AND property_id = ?`,
          [
            reservationId,
            fullName,
            firstName,
            lastName,
            emailClean,
            phoneClean,
            birthDateClean,
            "validated",
            cpfClean,
            subReservationId,
            PROPERTY_ID
          ],
          function (err) {
            if (err) {
              console.error("Erro ao atualizar:", err);
              return res.status(500).json({ error: "Erro ao atualizar" });
            }

            return res.json({
              message: "Check-in atualizado",
              id: row.id
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO checkins
           (property_id, reservation_id, sub_reservation_id, full_name, first_name, last_name, cpf, email, phone, birth_date, status, fnrh_status, fnrh_response)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            PROPERTY_ID,
            reservationId,
            subReservationId,
            fullName,
            firstName,
            lastName,
            cpfClean,
            emailClean,
            phoneClean,
            birthDateClean,
            "validated",
            "pending",
            ""
          ],
          function (err) {
            if (err) {
              console.error("Erro ao salvar:", err);
              return res.status(500).json({ error: "Erro ao salvar" });
            }

            return res.json({
              message: "Check-in criado",
              id: this.lastID
            });
          }
        );
      }
    }
  );
});

app.post("/checkins/:id/send-fnrh", (req, res) => {
  const id = req.params.id;

  db.get(
    "SELECT * FROM checkins WHERE id = ? AND property_id = ?",
    [id, PROPERTY_ID],
    (err, row) => {
      if (err) {
        console.error("Erro ao buscar registro:", err);
        return res.status(500).json({ error: "Erro no banco" });
      }

      if (!row) {
        return res.status(404).json({ error: "Registro não encontrado" });
      }

      if (row.status !== "validated") {
        return res.status(400).json({
          error: "Registro ainda não está validado para envio"
        });
      }

      const payload = buildFNRHPayload(row);
      console.log("PAYLOAD FNRH:", payload);

      const fakeResponse = JSON.stringify({
        sent_at: new Date().toISOString(),
        message: "Envio simulado com sucesso para FNRH",
        reservation_id: row.reservation_id,
        sub_reservation_id: row.sub_reservation_id,
        cpf: row.cpf,
        payload
      });

      db.run(
        `UPDATE checkins
         SET fnrh_status = ?, status = ?, fnrh_response = ?
         WHERE id = ?`,
        ["sent", "sent_to_fnrh", fakeResponse, id],
        function (err) {
          if (err) {
            console.error("Erro ao atualizar envio:", err);
            return res.status(500).json({ error: "Erro ao marcar envio" });
          }

          return res.json({
            message: "Envio simulado para FNRH realizado com sucesso",
            id: row.id
          });
        }
      );
    }
  );
});
// =========================
// NOVA ESTRUTURA (stays + guests) - FASE SEGURA
// =========================

// cria ou busca uma suíte (stay)
app.post("/stays", (req, res) => {
  const { reservation_id, sub_reservation_id } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      error: "ID da reserva é obrigatório"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();

  db.get(
    `SELECT * FROM stays
     WHERE property_id = ? AND reservation_id = ? AND sub_reservation_id = ?`,
    [PROPERTY_ID, reservationId, subReservationId],
    (err, row) => {
      if (err) {
        console.error("Erro ao consultar stay:", err);
        return res.status(500).json({ error: "Erro no banco" });
      }

      if (row) {
        return res.json({
          message: "Stay já existe",
          stay: row
        });
      }

      db.run(
        `INSERT INTO stays (property_id, reservation_id, sub_reservation_id)
         VALUES (?, ?, ?)`,
        [PROPERTY_ID, reservationId, subReservationId],
        function (err) {
          if (err) {
            console.error("Erro ao criar stay:", err);
            return res.status(500).json({ error: "Erro ao criar stay" });
          }

          return res.json({
            message: "Stay criado com sucesso",
            stay: {
              id: this.lastID,
              property_id: PROPERTY_ID,
              reservation_id: reservationId,
              sub_reservation_id: subReservationId
            }
          });
        }
      );
    }
  );
});
console.log("ROTAS STAYS/GUESTS CARREGADAS");

// lista stays
app.get("/stays", (req, res) => {
  db.all(
    `SELECT * FROM stays
     WHERE property_id = ?
     ORDER BY created_at DESC`,
    [PROPERTY_ID],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar stays:", err);
        return res.status(500).json({ error: "Erro ao buscar stays" });
      }

      res.json(rows);
    }
  );
});

// cria hóspede vinculado a uma suíte
app.post("/guests", (req, res) => {
  const {
    stay_id,
    full_name,
    cpf,
    email,
    phone,
    birth_date,
    is_adult,
    is_main_guest
  } = req.body;

  if (!stay_id || !full_name) {
    return res.status(400).json({
      error: "stay_id e nome completo são obrigatórios"
    });
  }

  const fullName = String(full_name).trim();
  const cpfClean = cpf ? onlyDigits(cpf) : "";
  const phoneClean = phone ? onlyDigits(phone) : "";
  const emailClean = String(email || "").trim();
  const birthDateClean = String(birth_date || "").trim();

  db.run(
    `INSERT INTO guests
     (stay_id, full_name, cpf, email, phone, birth_date, is_adult, is_main_guest, status, fnrh_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stay_id,
      fullName,
      cpfClean,
      emailClean,
      phoneClean,
      birthDateClean,
      is_adult ? 1 : 0,
      is_main_guest ? 1 : 0,
      "draft",
      "pending"
    ],
    function (err) {
      if (err) {
        console.error("Erro ao criar hóspede:", err);
        return res.status(500).json({ error: "Erro ao criar hóspede" });
      }

      return res.json({
        message: "Hóspede criado com sucesso",
        guest_id: this.lastID
      });
    }
  );
});

// lista hóspedes de uma suíte
app.get("/stays/:id/guests", (req, res) => {
  const stayId = req.params.id;

  db.all(
    `SELECT * FROM guests
     WHERE stay_id = ?
     ORDER BY created_at ASC`,
    [stayId],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar hóspedes:", err);
        return res.status(500).json({ error: "Erro ao buscar hóspedes" });
      }

      res.json(rows);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});