console.log("SERVER COM SUB_RESERVATION_ID 🚀");
require("dotenv").config();

const db = require("./database/db");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const PROPERTY_ID = "vivamar";
const EMPTY_STAY_SEED = {
  reservation_id: "TEST-STAY-SEM-HOSPEDES",
  sub_reservation_id: "TEST-STAY-SEM-HOSPEDES-01",
  data_entrada: "2026-04-20",
  data_saida: "2026-04-22"
};

// =========================
// Funções auxiliares
// =========================

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCPF(cpf) {
  return onlyDigits(cpf);
}

function normalizeVehiclePlate(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidCPF(cpf) {
  cpf = normalizeCPF(cpf);

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

const VALID_GENERO_IDS = ["HOMEM", "MULHER", "OUTRO"];
const VALID_RACA_IDS = ["AMARELA", "BRANCA", "INDIGENA", "PARDA", "PRETA", "NAOINFORMAR"];
const VALID_DEFICIENCIA_IDS = ["NAO", "SIM"];

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function maskValue(value, visibleStart = 4, visibleEnd = 2) {
  const stringValue = String(value || "");

  if (!stringValue) return "";
  if (stringValue.length <= visibleStart + visibleEnd) {
    return `${stringValue.slice(0, 1)}***`;
  }

  return `${stringValue.slice(0, visibleStart)}***${stringValue.slice(-visibleEnd)}`;
}

function buildBasicAuthorization(user, apiKey) {
  const credentials = Buffer.from(`${user}:${apiKey}`, "utf8").toString("base64");
  return `Basic ${credentials}`;
}

function buildLegacyCheckinFNRHPayload(checkin) {
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

function buildFNRHPayload(stay, guests) {
  const safeGuests = Array.isArray(guests) ? guests : [];
  const debugInfo = [];
  const validationWarnings = [];

  const payload = {
    reserva: {
      numero_reserva: stay?.reservation_id || "",
      numero_sub_reserva: stay?.sub_reservation_id || "",
      data_entrada: stay?.data_entrada || "",
      data_saida: stay?.data_saida || ""
      // A documentacao e os erros reais da API indicam o uso desses campos na reserva.
    },
    hospedagem: {
      stayIdLocal: stay?.id || null,
      propertyId: stay?.property_id || "",
      criadoEm: stay?.created_at || null
      // O modelo atual nao tem unidade/quarto explicito dentro da stay.
    },
    dados_hospede: safeGuests.map((guest) => {
        const guestDebug = {
          guest_id: guest?.id,
          nome: guest?.full_name,
          campos: {}
        };
        const generoId = guest?.genero_id || "HOMEM";
        const racaId = guest?.raca_id || "NAOINFORMAR";
        const deficienciaId = guest?.deficiencia_id || "NAO";
        const cidadeId = guest?.cidade_id || null;
        const estadoId = guest?.estado_id || null;
        const cpf = guest?.cpf || null;
        const birthDate = guest?.birth_date || null;
        const missingCriticalFields = [];

        guestDebug.campos.genero_id = {
          value: generoId,
          source: guest?.genero_id ? "guest" : generoId ? "fallback" : "missing"
        };
        guestDebug.campos.raca_id = {
          value: racaId,
          source: guest?.raca_id ? "guest" : racaId ? "fallback" : "missing"
        };
        guestDebug.campos.deficiencia_id = {
          value: deficienciaId,
          source: guest?.deficiencia_id ? "guest" : deficienciaId ? "fallback" : "missing"
        };
        guestDebug.campos.cidade_id = {
          value: cidadeId,
          source: guest?.cidade_id ? "guest" : "missing"
        };
        guestDebug.campos.estado_id = {
          value: estadoId,
          source: guest?.estado_id ? "guest" : "missing"
        };
        guestDebug.campos.cpf = {
          value: cpf,
          source: guest?.cpf ? "guest" : "missing"
        };
        guestDebug.campos.birth_date = {
          value: birthDate,
          source: guest?.birth_date ? "guest" : "missing"
        };

        const payloadGuest = {
          is_principal: !!guest?.is_main_guest,
          // Mantido fixo no envio inicial, alinhado ao fluxo atual de registro da hospedagem.
          situacao_hospede: "PRECHECKIN_PENDENTE",
          dados_pessoais: {
            ...(guest?.full_name ? { nome: guest.full_name } : {}),
            // A documentacao de pessoa usa nome_social; vazio e um default seguro aqui.
            nome_social: "",
            ...(birthDate ? { data_nascimento: birthDate } : {}),
            // Fallbacks temporarios para manter compatibilidade com hospedes antigos
            // que ainda nao tenham esses dados preenchidos no sistema.
            genero_id: generoId,
            raca_id: racaId,
            deficiencia_id: deficienciaId,
            tipo_deficiencia_id: "",
            // Assuncao minima explicita para o caso atual de hospede brasileiro.
            PaisNacionalidade_id: "BR",
            ...(cpf
              ? {
                documento_id: {
                  numero_documento: cpf,
                  tipo_documento_id: "CPF"
                }
              }
            : {}),
          contato: {
            ...(guest?.email ? { email: guest.email } : {}),
            ...(guest?.phone ? { telefone: guest.phone } : {}),
            ...(cidadeId ? { cidade_id: cidadeId } : {}),
            ...(estadoId ? { estado_id: estadoId } : {}),
            ...(guest?.cep ? { cep: guest.cep } : {}),
            ...(guest?.logradouro ? { logradouro: guest.logradouro } : {}),
            ...(guest?.numero ? { numero: guest.numero } : {}),
            ...(guest?.complemento ? { complemento: guest.complemento } : {}),
            ...(guest?.bairro ? { bairro: guest.bairro } : {}),
            // Assuncao minima explicita para o caso atual de residencia no Brasil.
            PaisResidencia_id: "BR"
          }
        }
        };

        if (generoId == null || generoId === "") missingCriticalFields.push("genero_id");
        if (racaId == null || racaId === "") missingCriticalFields.push("raca_id");
        if (deficienciaId == null || deficienciaId === "") missingCriticalFields.push("deficiencia_id");
        if (cidadeId == null || cidadeId === "") missingCriticalFields.push("cidade_id");
        if (estadoId == null || estadoId === "") missingCriticalFields.push("estado_id");
        if (cpf == null || cpf === "") missingCriticalFields.push("cpf");
        if (birthDate == null || birthDate === "") missingCriticalFields.push("birth_date");

        if (missingCriticalFields.length > 0) {
          validationWarnings.push({
            guest_id: guest?.id,
            nome: guest?.full_name,
            missing_critical_fields: missingCriticalFields
          });
        }

        debugInfo.push(guestDebug);

        // O modelo atual ainda nao coleta genero_id, endereco completo,
        // documento alternativo nem responsavel_id para cenarios mais completos.
        return payloadGuest;
      })
    };

  console.log("FNRH DEBUG PAYLOAD:", JSON.stringify(debugInfo, null, 2));
  if (validationWarnings.length > 0) {
    console.warn("FNRH VALIDATION WARNINGS:", JSON.stringify(validationWarnings, null, 2));
  } else {
    console.log("FNRH VALIDATION WARNINGS: none");
  }
  console.log("FNRH PAYLOAD PREVIEW:", JSON.stringify(payload, null, 2));

  return payload;
}

function buildFNRHStayPayload(stay, guests) {
  return {
    sistema: {
      propertyId: stay.property_id,
      stayId: stay.id,
      reservationId: stay.reservation_id,
      subReservationId: stay.sub_reservation_id
    },
    reserva: {
      idReserva: stay.reservation_id,
      idSubReserva: stay.sub_reservation_id,
      dataEntrada: null,
      dataSaida: null
    },
    hospedes: guests.map((guest) => ({
      idLocal: guest.id,
      titular: !!guest.is_main_guest,
      nomeCompleto: guest.full_name || "",
      cpf: guest.cpf || "",
      dataNascimento: guest.birth_date || "",
      telefone: guest.phone || "",
      email: guest.email || ""
    }))
  };
}

async function sendToFNRH(payload) {
  const mode = process.env.FNRH_MODE || "mock";
  console.log("[FNRH] mode:", mode);

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        sent_at: new Date().toISOString(),
        message: "Envio simulado com sucesso para FNRH",
        payload,
        payloadPreview: payload
      }
    };
  }

  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const submitPath = String(process.env.FNRH_SUBMIT_PATH || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const finalUrl = `${baseUrl}${submitPath}`;

  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !submitPath && "FNRH_SUBMIT_PATH",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `FNRH_MODE=real, mas faltam as variáveis obrigatórias: ${missingVars.join(", ")}`
    );
    configurationError.fnrhStatus = null;
    configurationError.fnrhBody = { error: configurationError.message };
    throw configurationError;
  }

  const authorization = buildBasicAuthorization(user, apiKey);
  const requestHeaders = {
    "Content-Type": "application/json",
    Authorization: authorization,
    cpf_solicitante: cpfSolicitante
  };

  console.log("[FNRH] request url:", finalUrl);
  console.log("[FNRH] request headers:", {
    "Content-Type": "application/json",
    Authorization: `Basic ${maskValue(Buffer.from(`${user}:${apiKey}`, "utf8").toString("base64"), 8, 4)}`,
    FNRH_USER: maskValue(user, 4, 4),
    FNRH_API_KEY: maskValue(apiKey, 3, 2),
    cpf_solicitante: maskValue(cpfSolicitante, 3, 2)
  });
  console.log("[FNRH] request payload:", JSON.stringify(payload, null, 2));

  let response;

  try {
    response = await fetch(finalUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    console.error("[FNRH] network error:", networkError);
    networkError.fnrhStatus = null;
    networkError.fnrhBody = {
      error: networkError.message || "Erro de rede ao enviar para a FNRH"
    };
    throw networkError;
  }

  let body;
  const text = await response.text();

  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  console.log("[FNRH] response status:", response.status);
  console.log("[FNRH] response body:", JSON.stringify(body, null, 2));

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function updateGuestsFNRHStatus(guestIds, fnrhStatus, statusValue, callback) {
  if (!guestIds.length) return callback();

  const placeholders = guestIds.map(() => "?").join(",");

  db.run(
    `UPDATE guests
     SET fnrh_status = ?, status = ?
     WHERE id IN (${placeholders})`,
    [fnrhStatus, statusValue, ...guestIds],
    function (err) {
      callback(err);
    }
  );
}

function updateStayLastFNRHResult(stayId, status, message, guestCountSent, guestCountConfirmed, callback) {
  db.run(
    `UPDATE stays
     SET fnrh_last_status = ?,
         fnrh_last_message = ?,
         fnrh_last_sent_at = CURRENT_TIMESTAMP,
         fnrh_last_guest_count_sent = ?,
         fnrh_last_guest_count_confirmed = ?
     WHERE id = ? AND property_id = ?`,
    [status, message, guestCountSent, guestCountConfirmed, stayId, PROPERTY_ID],
    (err) => {
      callback(err);
    }
  );
}

function ensureEmptyTestStay() {
  db.get(
    `SELECT id FROM stays
     WHERE property_id = ? AND reservation_id = ? AND sub_reservation_id = ?`,
    [PROPERTY_ID, EMPTY_STAY_SEED.reservation_id, EMPTY_STAY_SEED.sub_reservation_id],
    (err, row) => {
      if (err) {
        console.error("Erro ao verificar stay de teste sem hóspedes:", err);
        return;
      }

      if (row) {
        console.log(`Stay de teste sem hóspedes já existe (#${row.id})`);
        return;
      }

      db.run(
        `INSERT INTO stays (property_id, reservation_id, sub_reservation_id, data_entrada, data_saida)
         VALUES (?, ?, ?, ?, ?)`,
        [
          PROPERTY_ID,
          EMPTY_STAY_SEED.reservation_id,
          EMPTY_STAY_SEED.sub_reservation_id,
          EMPTY_STAY_SEED.data_entrada,
          EMPTY_STAY_SEED.data_saida
        ],
        function (insertErr) {
          if (insertErr) {
            console.error("Erro ao criar stay de teste sem hóspedes:", insertErr);
            return;
          }

          console.log(`Stay de teste sem hóspedes criada (#${this.lastID})`);
        }
      );
    }
  );
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
  const fullName = String(full_name || "").trim();
  const cpfClean = normalizeCPF(cpf);
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

      const payload = buildLegacyCheckinFNRHPayload(row);
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
  const { reservation_id, sub_reservation_id, data_entrada, data_saida } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      error: "ID da reserva é obrigatório"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();
  const dataEntrada = String(data_entrada || "").trim();
  const dataSaida = String(data_saida || "").trim();

  if (dataEntrada && !isValidBirthDate(dataEntrada)) {
    return res.status(400).json({
      error: "Data de entrada inválida"
    });
  }

  if (dataSaida && !isValidBirthDate(dataSaida)) {
    return res.status(400).json({
      error: "Data de saída inválida"
    });
  }

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
        `INSERT INTO stays (property_id, reservation_id, sub_reservation_id, data_entrada, data_saida)
         VALUES (?, ?, ?, ?, ?)`,
        [PROPERTY_ID, reservationId, subReservationId, dataEntrada, dataSaida],
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
                sub_reservation_id: subReservationId,
                data_entrada: dataEntrada,
                data_saida: dataSaida
              }
            });
          }
        );
    }
  );
});
console.log("ROTAS STAYS/GUESTS CARREGADAS");
ensureEmptyTestStay();

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

app.get("/stays/:id", (req, res) => {
  const stayId = req.params.id;

  db.get(
    `SELECT id, property_id, reservation_id, sub_reservation_id, data_entrada, data_saida, fnrh_last_status, fnrh_last_message, fnrh_last_sent_at, fnrh_last_guest_count_sent, fnrh_last_guest_count_confirmed, created_at
     FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID],
    (err, stay) => {
      if (err) {
        console.error("Erro ao buscar stay:", err);
        return res.status(500).json({ error: "Erro ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay não encontrada" });
      }

      return res.json(stay);
    }
  );
});

app.put("/stays/:id", (req, res) => {
  const stayId = req.params.id;
  const { reservation_id, sub_reservation_id, data_entrada, data_saida } = req.body;
  if (!reservation_id) {
    return res.status(400).json({
      error: "ID da reserva e obrigatorio"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();
  const dataEntrada = String(data_entrada || "").trim();
  const dataSaida = String(data_saida || "").trim();
  if (dataEntrada && !isValidBirthDate(dataEntrada)) {
    return res.status(400).json({
      error: "Data de entrada invalida"
    });
  }

  if (dataSaida && !isValidBirthDate(dataSaida)) {
    return res.status(400).json({
      error: "Data de saida invalida"
    });
  }

  db.run(
    `UPDATE stays
     SET reservation_id = ?, sub_reservation_id = ?, data_entrada = ?, data_saida = ?
     WHERE id = ? AND property_id = ?`,
    [reservationId, subReservationId, dataEntrada, dataSaida, stayId, PROPERTY_ID],
    function (err) {
      if (err) {
        console.error("Erro ao atualizar stay:", err);
        return res.status(500).json({ error: "Erro ao atualizar stay" });
      }

      if (!this.changes) {
        return res.status(404).json({ error: "Stay nao encontrada" });
      }

      return res.json({
        message: "Stay atualizada com sucesso",
        stay: {
          id: Number(stayId),
          property_id: PROPERTY_ID,
          reservation_id: reservationId,
          sub_reservation_id: subReservationId,
          data_entrada: dataEntrada,
          data_saida: dataSaida
        }
      });
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
    genero_id,
    raca_id,
    deficiencia_id,
    cidade_id,
    estado_id,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    vehicle_plate,
    is_adult,
    is_main_guest
  } = req.body;

  const stayIdClean = String(stay_id || "").trim();
  const fullName = String(full_name || "").trim();
  const cpfClean = normalizeCPF(cpf);
  const phoneClean = phone ? onlyDigits(phone) : "";
  const emailClean = String(email || "").trim();
  const birthDateClean = String(birth_date || "").trim();
  const generoIdClean = String(genero_id || "").trim();
  const racaIdClean = String(raca_id || "").trim();
  const deficienciaIdClean = String(deficiencia_id || "NAO").trim();
  const cidadeIdClean = String(cidade_id || "").trim();
  const estadoIdClean = String(estado_id || "").trim().toUpperCase();
  const cepClean = onlyDigits(cep);
  const logradouroClean = String(logradouro || "").trim();
  const numeroClean = String(numero || "").trim();
  const complementoClean = String(complemento || "").trim();
  const bairroClean = String(bairro || "").trim();
  const vehiclePlateClean = normalizeVehiclePlate(vehicle_plate);
  const isMainGuestProvided = is_main_guest !== undefined && is_main_guest !== null && String(is_main_guest).trim() !== "";
  const isMainGuestValue = Number(is_main_guest) === 1 ? 1 : 0;
  const isAdultValue = Number(is_adult) === 1 ? 1 : 0;

  if (!stayIdClean) {
    return res.status(400).json({ error: "Stay obrigatoria" });
  }

  if (!fullName) {
    return res.status(400).json({ error: "Nome completo obrigatorio" });
  }

  if (!cpfClean) {
    return res.status(400).json({ error: "CPF obrigatorio" });
  }

  if (!isValidCPF(cpfClean)) {
    return res.status(400).json({ error: "CPF invalido" });
  }

  if (!birthDateClean) {
    return res.status(400).json({ error: "Data de nascimento obrigatoria" });
  }

  if (!isValidBirthDate(birthDateClean)) {
    return res.status(400).json({ error: "Data de nascimento invalida" });
  }

  if (!isMainGuestProvided) {
    return res.status(400).json({ error: "Tipo do hospede obrigatorio" });
  }

  if (!generoIdClean) {
    return res.status(400).json({ error: "Genero nao informado" });
  }

  if (!VALID_GENERO_IDS.includes(generoIdClean)) {
    return res.status(400).json({ error: "Genero invalido" });
  }

  if (!racaIdClean) {
    return res.status(400).json({ error: "Raca/Cor nao informada" });
  }

  if (!VALID_RACA_IDS.includes(racaIdClean)) {
    return res.status(400).json({ error: "Raca/Cor invalida" });
  }

  if (!VALID_DEFICIENCIA_IDS.includes(deficienciaIdClean)) {
    return res.status(400).json({ error: "Informacao de deficiencia invalida" });
  }

  db.get(
    `SELECT id FROM stays WHERE id = ? AND property_id = ?`,
    [stayIdClean, PROPERTY_ID],
    (stayErr, stayRow) => {
      if (stayErr) {
        console.error("Erro ao validar stay do hospede:", stayErr);
        return res.status(500).json({ error: "Erro no banco" });
      }

      if (!stayRow) {
        return res.status(400).json({ error: "Stay nao encontrada" });
      }

      db.get(
        `SELECT * FROM guests WHERE stay_id = ? AND cpf = ?`,
        [stayIdClean, cpfClean],
        (err, existing) => {
          if (err) {
            console.error("Erro ao buscar hospede:", err);
            return res.status(500).json({ error: "Erro no banco" });
          }

          if (existing) {
            return res.status(400).json({
              error: "Ja existe um hospede com este CPF na mesma stay"
            });
          }

          db.run(
            `INSERT INTO guests
             (stay_id, full_name, cpf, email, phone, birth_date, genero_id, raca_id, deficiencia_id, cidade_id, estado_id, cep, logradouro, numero, complemento, bairro, vehicle_plate, is_adult, is_main_guest, status, fnrh_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              stayIdClean,
              fullName,
              cpfClean,
              emailClean,
              phoneClean,
              birthDateClean,
              generoIdClean,
              racaIdClean,
              deficienciaIdClean,
              cidadeIdClean,
              estadoIdClean,
              cepClean,
              logradouroClean,
              numeroClean,
              complementoClean,
              bairroClean,
              vehiclePlateClean,
              isAdultValue,
              isMainGuestValue,
              "draft",
              "pending"
            ],
            function (insertErr) {
              if (insertErr) {
                console.error("Erro ao criar hospede:", insertErr);
                return res.status(500).json({ error: "Erro ao criar hospede" });
              }

              return res.json({
                message: "Hospede criado com sucesso",
                guest_id: this.lastID
              });
            }
          );
        }
      );
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

app.delete("/guests/:id", (req, res) => {
  const guestId = req.params.id;

  db.get(
    `SELECT guests.id, guests.stay_id, guests.is_main_guest
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID],
    (err, guest) => {
      if (err) {
        console.error("Erro ao buscar hóspede para remoção:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hóspede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "Hóspede não encontrado" });
      }

      const deleteGuest = () => {
        db.run(
          "DELETE FROM guests WHERE id = ?",
          [guestId],
          function (deleteErr) {
            if (deleteErr) {
              console.error("Erro ao remover hóspede:", deleteErr);
              return res.status(500).json({ error: "Erro ao remover hóspede" });
            }

            return res.json({
              message: "Hóspede removido com sucesso",
              guest_id: Number(guestId)
            });
          }
        );
      };

      if (!guest.is_main_guest) {
        return deleteGuest();
      }

      db.get(
        `SELECT COUNT(*) AS main_guest_count
         FROM guests
         WHERE stay_id = ? AND is_main_guest = 1`,
        [guest.stay_id],
        (countErr, countRow) => {
          if (countErr) {
            console.error("Erro ao validar titulares antes da remoção:", countErr);
            return res.status(500).json({ error: "Erro no banco ao validar titulares" });
          }

          if (Number(countRow?.main_guest_count || 0) <= 1) {
            return res.status(400).json({
              error: "Não é possível deixar a stay sem hóspede titular."
            });
          }

          return deleteGuest();
        }
      );
    }
  );
});

app.put("/guests/:id", (req, res) => {
  const guestId = req.params.id;
  const {
    full_name,
    cpf,
    email,
    phone,
    birth_date,
    genero_id,
    raca_id,
    deficiencia_id,
    cidade_id,
    estado_id,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    vehicle_plate,
    is_adult,
    is_main_guest
  } = req.body;

  if (!full_name) {
    return res.status(400).json({ error: "Nome completo é obrigatório" });
  }

  const fullName = String(full_name || "").trim();
  const cpfClean = normalizeCPF(cpf);
  const phoneClean = phone ? onlyDigits(phone) : "";
  const emailClean = String(email || "").trim();
  const birthDateClean = String(birth_date || "").trim();
  const generoIdClean = String(genero_id || "").trim();
  const racaIdClean = String(raca_id || "").trim();
  const deficienciaIdClean = String(deficiencia_id || "NAO").trim();
  const cidadeIdClean = String(cidade_id || "").trim();
  const estadoIdClean = String(estado_id || "").trim().toUpperCase();
  const cepClean = onlyDigits(cep);
  const logradouroClean = String(logradouro || "").trim();
  const numeroClean = String(numero || "").trim();
  const complementoClean = String(complemento || "").trim();
  const bairroClean = String(bairro || "").trim();
  const vehiclePlateClean = normalizeVehiclePlate(vehicle_plate);
  const isMainGuestProvided = is_main_guest !== undefined && is_main_guest !== null && String(is_main_guest).trim() !== "";
  const isMainGuestValue = Number(is_main_guest) === 1 ? 1 : 0;
  const isAdultValue = Number(is_adult) === 1 ? 1 : 0;

  if (!cpfClean) {
    return res.status(400).json({ error: "CPF é obrigatório" });
  }

  if (!isValidCPF(cpfClean)) {
    return res.status(400).json({
      error: "CPF inválido"
    });
  }

  if (!birthDateClean) {
    return res.status(400).json({ error: "Data de nascimento é obrigatória" });
  }

  if (!isValidBirthDate(birthDateClean)) {
    return res.status(400).json({ error: "Data de nascimento inválida" });
  }

  if (!isMainGuestProvided) {
    return res.status(400).json({ error: "Tipo do hóspede é obrigatório" });
  }

  if (!generoIdClean) {
    return res.status(400).json({ error: "Gênero não informado" });
  }

  if (!VALID_GENERO_IDS.includes(generoIdClean)) {
    return res.status(400).json({ error: "Gênero inválido" });
  }

  if (!racaIdClean) {
    return res.status(400).json({ error: "Raça/Cor não informada" });
  }

  if (!VALID_RACA_IDS.includes(racaIdClean)) {
    return res.status(400).json({ error: "Raça/Cor inválida" });
  }

  if (!VALID_DEFICIENCIA_IDS.includes(deficienciaIdClean)) {
    return res.status(400).json({ error: "Informação de deficiência inválida" });
  }

  db.get(
    `SELECT guests.*, stays.property_id
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID],
    (err, guest) => {
      if (err) {
        console.error("Erro ao buscar hóspede para edição:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hóspede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "Hóspede não encontrado" });
      }

      db.get(
        `SELECT id FROM guests
         WHERE stay_id = ? AND cpf = ? AND id <> ?`,
        [guest.stay_id, cpfClean, guestId],
        (duplicateErr, duplicateGuest) => {
          if (duplicateErr) {
            console.error("Erro ao validar CPF duplicado:", duplicateErr);
            return res.status(500).json({ error: "Erro no banco ao validar hóspede" });
          }

          if (cpfClean && duplicateGuest) {
            return res.status(400).json({ error: "Já existe um hóspede com este CPF na mesma stay" });
          }

          const executeUpdate = () => {
            db.run(
              `UPDATE guests
               SET full_name = ?, cpf = ?, email = ?, phone = ?, birth_date = ?, genero_id = ?, raca_id = ?, deficiencia_id = ?, cidade_id = ?, estado_id = ?, cep = ?, logradouro = ?, numero = ?, complemento = ?, bairro = ?, vehicle_plate = ?, is_adult = ?, is_main_guest = ?
               WHERE id = ?`,
              [
                fullName,
                cpfClean,
                emailClean,
                phoneClean,
                birthDateClean,
                generoIdClean,
                racaIdClean,
                deficienciaIdClean,
                cidadeIdClean,
                estadoIdClean,
                cepClean,
                logradouroClean,
                numeroClean,
                complementoClean,
                bairroClean,
                vehiclePlateClean,
                isAdultValue,
                isMainGuestValue,
                guestId
              ],
              function (updateErr) {
                if (updateErr) {
                  console.error("Erro ao editar hóspede:", updateErr);
                  return res.status(500).json({ error: "Erro ao editar hóspede" });
                }

                return res.json({
                  message: "Hóspede atualizado com sucesso",
                  guest_id: Number(guestId)
                });
              }
            );
          };

          if (guest.is_main_guest && !isMainGuestValue) {
            db.get(
              `SELECT COUNT(*) AS main_guest_count
               FROM guests
               WHERE stay_id = ? AND is_main_guest = 1`,
              [guest.stay_id],
              (countErr, countRow) => {
                if (countErr) {
                  console.error("Erro ao validar titulares antes da edição:", countErr);
                  return res.status(500).json({ error: "Erro no banco ao validar titulares" });
                }

                if (Number(countRow?.main_guest_count || 0) <= 1) {
                  return res.status(400).json({
                    error: "Não é possível deixar a stay sem hóspede titular."
                  });
                }

                return executeUpdate();
              }
            );

            return;
          }

          return executeUpdate();
        }
      );
    }
  );
});

app.post("/stays/:id/send-fnrh", (req, res) => {
  const stayId = req.params.id;

  db.get(
    `SELECT * FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID],
    async (err, stay) => {
      if (err) {
        console.error("Erro ao buscar stay:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay não encontrada" });
      }

      db.all(
        `SELECT * FROM guests
         WHERE stay_id = ?
         ORDER BY created_at ASC`,
        [stayId],
        async (err, guests) => {
          if (err) {
            console.error("Erro ao buscar hóspedes:", err);
            return res.status(500).json({ error: "Erro no banco ao buscar hóspedes" });
          }

          if (!guests || !guests.length) {
            return res.status(400).json({ error: "Stay sem hóspedes para envio" });
          }

          const missingMainGuest = !guests.some((g) => g.is_main_guest);
          if (missingMainGuest) {
            return res.status(400).json({ error: "Nenhum hóspede titular encontrado na stay" });
          }

          const payload = buildFNRHPayload(stay, guests);
          const guestIds = guests.map((g) => g.id);
          const guestCountSent = Array.isArray(payload?.dados_hospede) ? payload.dados_hospede.length : guests.length;

          try {
            const result = await sendToFNRH(payload);
            const guestCountConfirmed = Array.isArray(result.body?.dados_hospedes) ? result.body.dados_hospedes.length : 0;

            if (result.ok) {
              updateGuestsFNRHStatus(guestIds, "sent", "sent_to_fnrh", (updateErr) => {
                if (updateErr) {
                  console.error("Erro ao atualizar status FNRH dos hóspedes:", updateErr);
                  updateStayLastFNRHResult(
                    stay.id,
                    "error",
                    "Enviado, mas falhou ao atualizar status local",
                    guestCountSent,
                    0,
                    (stayUpdateErr) => {
                      if (stayUpdateErr) {
                        console.error("Erro ao salvar falha local após envio FNRH:", stayUpdateErr);
                      }

                      return res.status(500).json({
                        error: "Enviado, mas falhou ao atualizar status local"
                      });
                    }
                  );
                  return;
                }

                const successMessage = guestCountSent === guestCountConfirmed
                  ? "Envio concluído com todos os hóspedes confirmados"
                  : "Envio concluído com confirmação parcial de hóspedes";

                updateStayLastFNRHResult(
                  stay.id,
                  "success",
                  successMessage,
                  guestCountSent,
                  guestCountConfirmed,
                  (stayUpdateErr) => {
                    if (stayUpdateErr) {
                      console.error("Erro ao salvar último envio FNRH da stay:", stayUpdateErr);
                    }

                    return res.json({
                      message: "Stay enviada para FNRH com sucesso",
                      stay_id: stay.id,
                      fnrh_mode: process.env.FNRH_MODE || "mock",
                      response_status: result.status,
                      response_body: result.body
                    });
                  }
                );
              });
            } else {
              updateGuestsFNRHStatus(guestIds, "error", "validated", (updateErr) => {
                if (updateErr) {
                  console.error("Erro ao marcar falha FNRH:", updateErr);
                }

                const errorMessage = String(
                  result.body?.error ||
                  result.body?.message ||
                  "Falha no envio para FNRH"
                ).trim();

                updateStayLastFNRHResult(stay.id, "error", errorMessage, guestCountSent, 0, (stayUpdateErr) => {
                  if (stayUpdateErr) {
                    console.error("Erro ao salvar falha FNRH da stay:", stayUpdateErr);
                  }

                  return res.status(502).json({
                    error: "Falha no envio para FNRH",
                    stay_id: stay.id,
                    fnrh_mode: process.env.FNRH_MODE || "mock",
                    response_status: result.status,
                    response_body: result.body
                  });
                });
              });
            }
          } catch (sendErr) {
            console.error("Erro ao enviar para FNRH:", sendErr);

            updateGuestsFNRHStatus(guestIds, "error", "validated", (updateErr) => {
              if (updateErr) {
                console.error("Erro ao marcar status de erro FNRH:", updateErr);
              }

              const errorMessage = String(
                sendErr.fnrhBody?.error ||
                sendErr.message ||
                "Erro interno ao enviar para FNRH"
              ).trim();

              updateStayLastFNRHResult(stay.id, "error", errorMessage, guestCountSent, 0, (stayUpdateErr) => {
                if (stayUpdateErr) {
                  console.error("Erro ao salvar erro FNRH da stay:", stayUpdateErr);
                }

                return res.status(500).json({
                  error: sendErr.message || "Erro interno ao enviar para FNRH",
                  stay_id: stay.id,
                  fnrh_mode: process.env.FNRH_MODE || "mock",
                  response_status: sendErr.fnrhStatus ?? null,
                  response_body: sendErr.fnrhBody || null
                });
              });
            });
          }
        }
      );
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

