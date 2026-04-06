console.log("SERVER NOVO COM RESERVATION_ID");
console.log("ARQUIVO CERTO CARREGADO 🚀");

const db = require("./database/db");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("FNRH Integration API rodando 🚀");
});

app.get("/checkins", (req, res) => {
  console.log("Rota /checkins acessada");

  db.all("SELECT * FROM checkins ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar dados:", err);
      return res.status(500).json({
        error: "Erro ao buscar dados"
      });
    }

    res.json(rows);
  });
});

app.post("/checkin", (req, res) => {
  console.log("Rota /checkin acessada");

  const { reservation_id, full_name, cpf, email } = req.body;

  if (!reservation_id || !full_name || !cpf) {
    return res.status(400).json({
      error: "ID da reserva, nome completo e CPF são obrigatórios"
    });
  }

  const reservationId = String(reservation_id).trim();
  const cpfClean = String(cpf).trim();

  const parts = full_name.trim().split(" ");
  const firstName = parts.shift();
  const lastName = parts.join(" ");

  db.get(
    "SELECT * FROM checkins WHERE cpf = ? AND reservation_id = ?",
    [cpfClean, reservationId],
    (err, row) => {
      if (err) {
        console.error("Erro ao consultar:", err);
        return res.status(500).json({
          error: "Erro no banco"
        });
      }

      if (row) {
        db.run(
          `UPDATE checkins
           SET full_name = ?, first_name = ?, last_name = ?, email = ?
           WHERE cpf = ? AND reservation_id = ?`,
          [full_name, firstName, lastName, email, cpfClean, reservationId],
          function (err) {
            if (err) {
              console.error("Erro ao atualizar:", err);
              return res.status(500).json({
                error: "Erro ao atualizar"
              });
            }

            return res.json({
              message: "Check-in atualizado com sucesso",
              id: row.id
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO checkins
           (reservation_id, full_name, first_name, last_name, cpf, email, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [reservationId, full_name, firstName, lastName, cpfClean, email, "draft"],
          function (err) {
            if (err) {
              console.error("Erro ao salvar:", err);
              return res.status(500).json({
                error: "Erro ao salvar no banco"
              });
            }

            return res.json({
              message: "Check-in criado com sucesso",
              id: this.lastID
            });
          }
        );
      }
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});