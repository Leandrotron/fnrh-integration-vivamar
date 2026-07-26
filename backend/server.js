console.log("SERVER COM SUB_RESERVATION_ID ðŸš€");
require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const db = require("./database/db");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

app.use(cors({
  origin: "*"
}));
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "reservas.html"));
});

app.get("/reservas.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "reservas.html"));
});

const PROPERTY_ID = "vivamar";
const EMPTY_STAY_SEED = {
  reservation_id: "TEST-STAY-SEM-HOSPEDES",
  sub_reservation_id: "TEST-STAY-SEM-HOSPEDES-01",
  data_entrada: "2026-04-20",
  data_saida: "2026-04-22"
};

// =========================
// FunÃ§Ãµes auxiliares
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

function parsePositiveInteger(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeFnrhUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function isFnrhHospedeIdUniqueConstraintError(error) {
  const message = String(error?.message || "");
  return error?.code === "SQLITE_CONSTRAINT" &&
    message.includes("idx_guests_fnrh_hospede_id_unique");
}

function createFnrhHospedeIdConflictError() {
  const error = new Error("Conflito local de identificador FNRH de hospede");
  error.code = "FNRH_HOSPEDE_ID_CONFLICT";
  return error;
}

function createInvalidFnrhHospedeIdError() {
  const error = new Error("Identificador FNRH de hospede ausente ou invalido no retorno oficial");
  error.code = "FNRH_INVALID_HOSPEDE_ID";
  return error;
}

const VALID_GENERO_IDS = ["HOMEM", "MULHER", "OUTRO"];
const VALID_RACA_IDS = ["AMARELA", "BRANCA", "INDIGENA", "PARDA", "PRETA", "NAOINFORMAR"];
const VALID_DEFICIENCIA_IDS = ["NAO", "SIM"];
const useMinimalPayload = false;

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

function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

function ensureStayHasPublicToken(stay, callback) {
  if (!stay?.id) {
    callback(null, stay);
    return;
  }

  const currentToken = String(stay.public_token || "").trim();
  if (currentToken) {
    callback(null, {
      ...stay,
      public_token: currentToken
    });
    return;
  }

  const nextToken = generatePublicToken();

  db.run(
    `UPDATE stays
     SET public_token = ?
     WHERE id = ? AND (public_token IS NULL OR TRIM(public_token) = "")`,
    [nextToken, stay.id],
    (err) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, {
        ...stay,
        public_token: nextToken
      });
    }
  );
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
  const computedAdultCount = safeGuests.filter((guest) => Number(guest?.is_adult) === 1).length;
  const computedMinorCount = safeGuests.filter((guest) => Number(guest?.is_adult) === 0).length;
  const quantidadeHospedeAdulto = Math.max(1, Number(stay?.quantidade_hospede_adulto) || computedAdultCount || 1);
  const quantidadeHospedeMenor = Math.max(0, Number(stay?.quantidade_hospede_menor) || computedMinorCount || 0);

  console.log("[FNRH] quantidade adultos:", quantidadeHospedeAdulto);
  console.log("[FNRH] quantidade menores:", quantidadeHospedeMenor);

  const payload = {
    reserva: {
      numero_reserva: stay?.reservation_id || "",
      data_entrada: stay?.data_entrada || "",
      data_saida: stay?.data_saida || "",
      origem_reserva_id: "MEIOHOSPEDAGEM",
      quantidade_hospede_adulto: quantidadeHospedeAdulto,
      quantidade_hospede_menor: quantidadeHospedeMenor
      // A documentacao e os erros reais da API indicam o uso desses campos na reserva.
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
  console.log("FNRH PAYLOAD PREVIEW (FULL):", JSON.stringify(payload, null, 2));

  return payload;
}

function buildFNRHPayloadMinimal(stay, guests) {
  const safeGuests = Array.isArray(guests) ? guests : [];

  const payload = {
    reserva: {
      numero_reserva: stay?.reservation_id || "",
      data_entrada: stay?.data_entrada || "",
      data_saida: stay?.data_saida || "",
      origem_reserva_id: "MEIOHOSPEDAGEM"
    },
    dados_hospede: safeGuests.map((guest) => {
      const cpf = guest?.cpf || null;
      const birthDate = guest?.birth_date || null;
      const cidadeId = guest?.cidade_id || null;
      const estadoId = guest?.estado_id || null;

      return {
        is_principal: !!guest?.is_main_guest,
        dados_pessoais: {
          ...(guest?.full_name ? { nome: guest.full_name } : {}),
          ...(birthDate ? { data_nascimento: birthDate } : {}),
          ...(cpf
            ? {
              documento_id: {
                numero_documento: cpf,
                tipo_documento_id: "CPF"
              }
            }
            : {}),
          contato: {
            ...(cidadeId ? { cidade_id: cidadeId } : {}),
            ...(estadoId ? { estado_id: estadoId } : {}),
            PaisResidencia_id: "BR"
          }
        }
      };
    })
  };

  console.log("FNRH PAYLOAD PREVIEW (MINIMAL):", JSON.stringify(payload, null, 2));

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
      `FNRH_MODE=real, mas faltam as variÃ¡veis obrigatÃ³rias: ${missingVars.join(", ")}`
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

async function fetchFnrhPreCheckins(dataInicio, dataFim, exibirVinculado) {
  const mode = process.env.FNRH_MODE || "mock";

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        fetched_at: new Date().toISOString(),
        dados: []
      }
    };
  }

  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const query = new URLSearchParams({
    data_inicio: dataInicio,
    data_fim: dataFim
  });

  if (exibirVinculado !== undefined) {
    query.set("exibir_vinculado", exibirVinculado);
  }

  const finalUrl = `${baseUrl}/hospedes/pre-checkins?${query.toString()}`;

  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `FNRH_MODE=real, mas faltam as variÃ¡veis obrigatÃ³rias: ${missingVars.join(", ")}`
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

  let response;

  try {
    response = await fetch(finalUrl, {
      method: "GET",
      headers: requestHeaders
    });
  } catch (networkError) {
    console.error("[FNRH] pre-checkins network error:", {
      type: networkError?.name || "Error",
      message: networkError?.message || "network_error"
    });
    networkError.fnrhStatus = null;
    networkError.fnrhBody = {
      error: networkError.message || "Erro de rede ao consultar prÃ©-check-ins da FNRH"
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

  console.log("[FNRH] pre-checkins response:", {
    status: response.status,
    result_count: Array.isArray(body?.dados) ? body.dados.length : null
  });

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

async function fetchFnrhReservationGuests(fnrhReservaId) {
  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const finalUrl = `${baseUrl}/reservas/${encodeURIComponent(fnrhReservaId)}/hospedes`;

  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `Diagnostico FNRH indisponivel. Faltam as variaveis obrigatorias: ${missingVars.join(", ")}`
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
  const startedAt = Date.now();

  console.log("[FNRH][debug] reservation guests request:", {
    stage: "reservation_guests"
  });

  let response;

  try {
    response = await fetch(finalUrl, {
      method: "GET",
      headers: requestHeaders
    });
  } catch (networkError) {
    const durationMs = Date.now() - startedAt;
    console.error("[FNRH][debug] reservation guests network error:", {
      type: networkError?.name || "Error",
      duration_ms: durationMs
    });
    networkError.fnrhStatus = null;
    networkError.fnrhBody = {
      error: networkError.message || "Erro de rede ao consultar hospedes da reserva na FNRH"
    };
    throw networkError;
  }

  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  console.log("[FNRH][debug] reservation guests response:", {
    status: response.status,
    duration_ms: durationMs
  });

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

async function linkFnrhPreCheckin(fnrhReservaId, fnrhHospedeId) {
  const mode = process.env.FNRH_MODE || "mock";

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: { mode: "mock" }
    };
  }

  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const finalUrl = `${baseUrl}/reservas/${encodeURIComponent(fnrhReservaId)}/vincular-hospede/${encodeURIComponent(fnrhHospedeId)}`;
  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `FNRH_MODE=real, mas faltam as variáveis obrigatórias: ${missingVars.join(", ")}`
    );
    configurationError.fnrhStatus = null;
    configurationError.fnrhBody = { error: "Configuração da FNRH incompleta" };
    throw configurationError;
  }

  const startedAt = Date.now();
  let response;

  try {
    response = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Authorization: buildBasicAuthorization(user, apiKey),
        cpf_solicitante: cpfSolicitante
      }
    });
  } catch (networkError) {
    console.error("[FNRH] pre-checkin link network failure:", {
      type: networkError?.name || "Error",
      duration_ms: Date.now() - startedAt
    });
    networkError.fnrhStatus = null;
    networkError.fnrhBody = { error: "Erro de rede ao vincular pré-check-in na FNRH" };
    throw networkError;
  }

  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  console.log("[FNRH] pre-checkin link response:", {
    status: response.status,
    duration_ms: Date.now() - startedAt
  });

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function sanitizeFnrhLinkResponseBody(body, depth = 0) {
  if (depth > 5) return "[conteúdo omitido]";
  if (Array.isArray(body)) {
    return body.slice(0, 50).map((item) => sanitizeFnrhLinkResponseBody(item, depth + 1));
  }
  if (!body || typeof body !== "object") {
    return body;
  }

  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (/authorization|credential|password|token|cpf|documento|nome|email|telefone|phone|raw/i.test(key)) {
        return [key, "[conteúdo omitido]"];
      }
      return [key, sanitizeFnrhLinkResponseBody(value, depth + 1)];
    })
  );
}

function normalizeOptionalFnrhDate(value) {
  const normalized = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function getFnrhPeriodLength(dataInicio, dataFim) {
  const start = normalizeOptionalFnrhDate(dataInicio);
  const end = normalizeOptionalFnrhDate(dataFim);
  if (!start || !end) return null;
  return Math.floor(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
  ) + 1;
}

function normalizeFnrhOfficialCandidate(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const pessoa = item.pessoa && typeof item.pessoa === "object" ? item.pessoa : item;
  const hospede = item.hospede && typeof item.hospede === "object" ? item.hospede : item;
  const hospedeId = normalizeFnrhUuid(hospede.hospede_id || item.hospede_id);
  const documentType = String(
    pessoa.tipo_documento_id ||
    pessoa.tipo_documento ||
    item.tipo_documento_id ||
    item.tipo_documento ||
    ""
  ).trim().toUpperCase();
  const documentValue = String(
    pessoa.numero_documento ||
    pessoa.numero ||
    item.numero_documento ||
    item.numero ||
    ""
  ).trim();

  return {
    hospedeId,
    pessoaId: String(pessoa.pessoa_id || hospede.pessoa_id || item.pessoa_id || "").trim() || null,
    fullName: String(pessoa.nome || item.nome || "").trim(),
    birthDate: normalizeOptionalFnrhDate(pessoa.data_nascimento || item.data_nascimento),
    documentType,
    documentValue,
    situation: String(hospede.situacao_hospede_id || item.situacao_hospede_id || "").trim(),
    situationLabel: String(hospede.situacao_hospede || item.situacao_hospede || "").trim() || null,
    situationColor: String(hospede.situacao_cor || item.situacao_cor || "").trim() || null
  };
}

function getFnrhOfficialCandidateItems(body) {
  return Array.isArray(body?.dados)
    ? body.dados
    : Array.isArray(body?.dados?.dados_hospedes)
      ? body.dados.dados_hospedes
      : null;
}

function getFnrhOfficialCandidateList(body) {
  const items = getFnrhOfficialCandidateItems(body) || [];
  return items.map(normalizeFnrhOfficialCandidate).filter(Boolean);
}

function findUniqueFnrhOfficialCandidate(body, fnrhHospedeId) {
  const matches = getFnrhOfficialCandidateList(body).filter((candidate) => {
    return candidate.hospedeId === fnrhHospedeId;
  });
  return {
    candidate: matches.length === 1 ? matches[0] : null,
    matchCount: matches.length
  };
}

function getFnrhCandidateCpf(candidate) {
  if (String(candidate?.documentType || "").trim().toUpperCase() !== "CPF") return null;
  const cpf = normalizeCPF(candidate.documentValue);
  return isValidCPF(cpf) ? cpf : null;
}

function isFnrhCandidateOfficialDataValid(candidate) {
  if (!candidate || !isValidUuid(candidate.hospedeId) || !candidate.fullName) return false;
  if (candidate.documentType === "CPF" && !getFnrhCandidateCpf(candidate)) return false;
  return true;
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(Array.isArray(rows) ? rows : []);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function findLocalGuestByFnrhHospedeId(fnrhHospedeId) {
  return dbGetAsync(
    `SELECT guests.id, guests.stay_id, guests.full_name, guests.cpf, guests.birth_date,
            guests.is_main_guest, guests.fnrh_hospede_id, guests.fnrh_pessoa_id,
            guests.fnrh_checkin_at, guests.fnrh_checkout_at
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE LOWER(TRIM(guests.fnrh_hospede_id)) = ?
       AND stays.property_id = ?
     LIMIT 1`,
    [fnrhHospedeId, PROPERTY_ID]
  );
}

async function loadPropertyGuestById(guestId) {
  return dbGetAsync(
    `SELECT guests.id, guests.stay_id, guests.full_name, guests.cpf, guests.birth_date,
            guests.is_main_guest, guests.fnrh_hospede_id, guests.fnrh_pessoa_id,
            guests.fnrh_checkin_at, guests.fnrh_checkout_at
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID]
  );
}

async function fetchConfirmedFnrhReservationCandidate(fnrhReservaId, fnrhHospedeId) {
  const result = await fetchFnrhReservationGuests(fnrhReservaId);
  if (!result.ok) {
    const error = new Error("Falha ao confirmar hóspede na reserva oficial");
    error.code = "FNRH_RESERVATION_GUESTS_FAILED";
    error.fnrhStatus = result.status;
    throw error;
  }
  const match = findUniqueFnrhOfficialCandidate(result.body, fnrhHospedeId);
  if (match.matchCount > 1) {
    const error = new Error("Identificador duplicado na resposta oficial da reserva");
    error.code = "FNRH_AMBIGUOUS_OFFICIAL_GUEST";
    throw error;
  }
  return match.candidate;
}

async function sendFnrhGuestCheckin(fnrhHospedeId, checkinAtIso) {
  const mode = process.env.FNRH_MODE || "mock";
  console.log("[FNRH] guest check-in mode:", mode);

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        hospede_id: fnrhHospedeId,
        situacao_id: "CHECKIN_REALIZADO",
        data_hora: checkinAtIso
      }
    };
  }

  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const finalUrl = `${baseUrl}/hospedes/${encodeURIComponent(fnrhHospedeId)}/checkin`;

  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `FNRH_MODE=real, mas faltam as variÃ¡veis obrigatÃ³rias: ${missingVars.join(", ")}`
    );
    configurationError.fnrhStatus = null;
    configurationError.fnrhBody = { error: configurationError.message };
    throw configurationError;
  }

  const authorization = buildBasicAuthorization(user, apiKey);
  const requestHeaders = {
    "Content-Type": "text/plain",
    Authorization: authorization,
    cpf_solicitante: cpfSolicitante
  };

  console.log("[FNRH] guest check-in request url:", finalUrl);
  console.log("[FNRH] guest check-in request headers:", {
    "Content-Type": "text/plain",
    Authorization: `Basic ${maskValue(Buffer.from(`${user}:${apiKey}`, "utf8").toString("base64"), 8, 4)}`,
    FNRH_USER: maskValue(user, 4, 4),
    FNRH_API_KEY: maskValue(apiKey, 3, 2),
    cpf_solicitante: maskValue(cpfSolicitante, 3, 2)
  });
  console.log("[FNRH] guest check-in request body:", checkinAtIso);

  let response;

  try {
    response = await fetch(finalUrl, {
      method: "PATCH",
      headers: requestHeaders,
      body: checkinAtIso
    });
  } catch (networkError) {
    console.error("[FNRH] guest check-in network error:", networkError);
    networkError.fnrhStatus = null;
    networkError.fnrhBody = {
      error: networkError.message || "Erro de rede ao realizar check-in na FNRH"
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

  console.log("[FNRH] guest check-in response status:", response.status);
  console.log("[FNRH] guest check-in response body:", JSON.stringify(body, null, 2));

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

async function sendFnrhGuestCheckout(fnrhHospedeId, checkoutAtIso) {
  const mode = process.env.FNRH_MODE || "mock";
  console.log("[FNRH] guest check-out mode:", mode);

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        hospede_id: fnrhHospedeId,
        situacao_id: "CHECKOUT_REALIZADO",
        data_hora: checkoutAtIso
      }
    };
  }

  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();
  const finalUrl = `${baseUrl}/hospedes/${encodeURIComponent(fnrhHospedeId)}/checkout`;

  const missingVars = [
    !baseUrl && "FNRH_BASE_URL",
    !user && "FNRH_USER",
    !apiKey && "FNRH_API_KEY",
    !cpfSolicitante && "FNRH_CPF_SOLICITANTE"
  ].filter(Boolean);

  if (missingVars.length) {
    const configurationError = new Error(
      `FNRH_MODE=real, mas faltam as variÃƒÂ¡veis obrigatÃƒÂ³rias: ${missingVars.join(", ")}`
    );
    configurationError.fnrhStatus = null;
    configurationError.fnrhBody = { error: configurationError.message };
    throw configurationError;
  }

  const authorization = buildBasicAuthorization(user, apiKey);
  const requestHeaders = {
    "Content-Type": "text/plain",
    Authorization: authorization,
    cpf_solicitante: cpfSolicitante
  };

  console.log("[FNRH] guest check-out request url:", finalUrl);
  console.log("[FNRH] guest check-out request headers:", {
    "Content-Type": "text/plain",
    Authorization: `Basic ${maskValue(Buffer.from(`${user}:${apiKey}`, "utf8").toString("base64"), 8, 4)}`,
    FNRH_USER: maskValue(user, 4, 4),
    FNRH_API_KEY: maskValue(apiKey, 3, 2),
    cpf_solicitante: maskValue(cpfSolicitante, 3, 2)
  });
  console.log("[FNRH] guest check-out request body:", checkoutAtIso);

  let response;

  try {
    response = await fetch(finalUrl, {
      method: "PATCH",
      headers: requestHeaders,
      body: checkoutAtIso
    });
  } catch (networkError) {
    console.error("[FNRH] guest check-out network error:", networkError);
    networkError.fnrhStatus = null;
    networkError.fnrhBody = {
      error: networkError.message || "Erro de rede ao realizar check-out na FNRH"
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

  console.log("[FNRH] guest check-out response status:", response.status);
  console.log("[FNRH] guest check-out response body:", JSON.stringify(body, null, 2));

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

function persistFNRHReturnData(stayId, guests, resultBody, callback) {
  const reserva = resultBody?.dados?.reserva || {};
  const reservaId = String(reserva.reserva_id || "").trim();
  const officialPrecheckinLink = String(reserva.link_precheckin || "").trim();
  const returnedGuests = Array.isArray(resultBody?.dados?.dados_hospedes)
    ? resultBody.dados.dados_hospedes
    : [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION", (beginErr) => {
      if (beginErr) {
        callback(beginErr);
        return;
      }

      db.run(
        `UPDATE stays
         SET fnrh_reserva_id = ?,
             fnrh_link_precheckin_oficial = ?
         WHERE id = ? AND property_id = ?`,
        [reservaId, officialPrecheckinLink, stayId, PROPERTY_ID],
        (stayErr) => {
          if (stayErr) {
            db.run("ROLLBACK", () => callback(stayErr));
            return;
          }

          if (!returnedGuests.length) {
            db.run("COMMIT", (commitErr) => callback(commitErr));
            return;
          }

          let pendingUpdates = returnedGuests.length;
          let finished = false;

          returnedGuests.forEach((returnedGuest, index) => {
            const localGuest = guests[index];
            if (!localGuest) {
              pendingUpdates -= 1;

              if (!pendingUpdates && !finished) {
                finished = true;
                db.run("COMMIT", (commitErr) => callback(commitErr));
              }

              return;
            }

            const fnrhHospedeId = normalizeFnrhUuid(returnedGuest?.hospede_id);
            const fnrhPessoaId = String(returnedGuest?.hospede?.pessoa_id || "").trim();

            if (!fnrhHospedeId || !isValidUuid(fnrhHospedeId)) {
              finished = true;
              db.run("ROLLBACK", () => callback(createInvalidFnrhHospedeIdError()));
              return;
            }

            // O payload e o retorno da FNRH seguem a ordem do array local de hÃ³spedes neste fluxo atual.
            db.run(
              `UPDATE guests
               SET fnrh_hospede_id = ?,
                   fnrh_pessoa_id = ?
               WHERE id = ? AND stay_id = ?`,
              [fnrhHospedeId, fnrhPessoaId, localGuest.id, stayId],
              (guestErr) => {
                if (finished) return;

                if (guestErr) {
                  finished = true;
                  const controlledError = isFnrhHospedeIdUniqueConstraintError(guestErr)
                    ? createFnrhHospedeIdConflictError()
                    : guestErr;
                  if (isFnrhHospedeIdUniqueConstraintError(guestErr)) {
                    console.error("[FNRH] Conflito local de fnrh_hospede_id ao persistir retorno oficial.");
                  }
                  db.run("ROLLBACK", () => callback(controlledError));
                  return;
                }

                pendingUpdates -= 1;

                if (!pendingUpdates) {
                  finished = true;
                  db.run("COMMIT", (commitErr) => callback(commitErr));
                }
              }
            );
          });
        }
      );
    });
  });
}

function ensureEmptyTestStay() {
  db.get(
    `SELECT id, public_token FROM stays
     WHERE property_id = ? AND reservation_id = ? AND sub_reservation_id = ?`,
    [PROPERTY_ID, EMPTY_STAY_SEED.reservation_id, EMPTY_STAY_SEED.sub_reservation_id],
    (err, row) => {
      if (err) {
        console.error("Erro ao verificar stay de teste sem hÃ³spedes:", err);
        return;
      }

      if (row) {
        ensureStayHasPublicToken(row, (tokenErr, stayWithToken) => {
          if (tokenErr) {
            console.error("Erro ao garantir public_token da stay de teste:", tokenErr);
            return;
          }

          console.log(`Stay de teste sem hÃ³spedes jÃ¡ existe (#${stayWithToken.id})`);
        });
        return;
      }

      const publicToken = generatePublicToken();

      db.run(
        `INSERT INTO stays (property_id, reservation_id, sub_reservation_id, data_entrada, data_saida, public_token)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          PROPERTY_ID,
          EMPTY_STAY_SEED.reservation_id,
          EMPTY_STAY_SEED.sub_reservation_id,
          EMPTY_STAY_SEED.data_entrada,
          EMPTY_STAY_SEED.data_saida,
          publicToken
        ],
        function (insertErr) {
          if (insertErr) {
            console.error("Erro ao criar stay de teste sem hÃ³spedes:", insertErr);
            return;
          }

          console.log(`Stay de teste sem hÃ³spedes criada (#${this.lastID})`);
        }
      );
    }
  );
}

// =========================
// Rotas
// =========================

app.get("/", (req, res) => {
  res.send("FNRH Integration API rodando ðŸš€");
});

app.get("/fnrh/precheckins", async (req, res) => {
  const dataInicio = String(req.query.data_inicio || "").trim();
  const dataFim = String(req.query.data_fim || "").trim();
  const hasExibirVinculado = Object.prototype.hasOwnProperty.call(req.query, "exibir_vinculado");
  const exibirVinculado = hasExibirVinculado
    ? String(req.query.exibir_vinculado)
    : undefined;

  if (!dataInicio || !dataFim) {
    return res.status(400).json({
      error: "data_inicio e data_fim sÃ£o obrigatÃ³rios"
    });
  }

  if (hasExibirVinculado && exibirVinculado !== "true" && exibirVinculado !== "false") {
    return res.status(400).json({
      error: 'exibir_vinculado deve ser "true" ou "false"'
    });
  }

  try {
    const result = await fetchFnrhPreCheckins(dataInicio, dataFim, exibirVinculado);

    if (!result.ok) {
      const errorMessage = String(
        result.body?.error ||
        result.body?.message ||
        "Falha ao consultar prÃ©-check-ins da FNRH"
      ).trim();

      return res.status(502).json({
        error: errorMessage,
        fnrh_mode: process.env.FNRH_MODE || "mock",
        response_status: result.status,
        response_body: result.body
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Erro ao consultar prÃ©-check-ins da FNRH:", error);

    return res.status(500).json({
      error: error.message || "Erro interno ao consultar prÃ©-check-ins da FNRH",
      fnrh_mode: process.env.FNRH_MODE || "mock",
      response_status: error.fnrhStatus ?? null,
      response_body: error.fnrhBody || null
    });
  }
});

app.get("/api/fnrh/debug/reserva/:id/hospedes", (req, res) => {
  const stayId = req.params.id;

  db.get(
    `SELECT id, property_id, reservation_id, fnrh_reserva_id, fnrh_link_precheckin_oficial
     FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID],
    async (err, stay) => {
      if (err) {
        console.error("[FNRH][debug] erro ao buscar stay:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay nao encontrada" });
      }

      const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
      if (!fnrhReservaId) {
        return res.status(400).json({
          error: "Stay sem fnrh_reserva_id para consulta de hospedes na FNRH",
          stay_id: stay.id
        });
      }

      try {
        const result = await fetchFnrhReservationGuests(fnrhReservaId);
        return res.status(result.status).json(result.body);
      } catch (debugErr) {
        console.error("[FNRH][debug] erro ao consultar hospedes da reserva:", debugErr);

        return res.status(500).json({
          error: debugErr.message || "Erro interno ao consultar hospedes da reserva na FNRH",
          stay_id: stay.id,
          fnrh_reserva_id: fnrhReservaId,
          response_status: debugErr.fnrhStatus ?? null,
          response_body: debugErr.fnrhBody || null
        });
      }
    }
  );
});

function normalizeFnrhComparisonText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function normalizeFnrhDocumentForComparison(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

function maskFnrhOfficialDocument(candidate) {
  const documentType = String(candidate?.documentType || "").trim().toUpperCase();
  const documentValue = String(candidate?.documentValue || "").trim();
  if (!documentValue) return null;

  if (documentType === "CPF") {
    const cpf = getFnrhCandidateCpf(candidate);
    return cpf ? `***.***.***-${cpf.slice(-2)}` : null;
  }

  const normalized = normalizeFnrhDocumentForComparison(documentValue);
  if (normalized.length <= 2) return null;
  const visibleLength = normalized.length >= 8 ? 4 : 2;
  return `***${normalized.slice(-visibleLength)}`;
}

function getFnrhOfficialCandidateConflictKey(candidate) {
  return JSON.stringify([
    normalizeFnrhComparisonText(candidate?.fullName),
    String(candidate?.documentType || "").trim().toUpperCase(),
    normalizeFnrhDocumentForComparison(candidate?.documentValue),
    String(candidate?.situation || "").trim().toUpperCase()
  ]);
}

function normalizeUniqueFnrhOfficialCandidates(items) {
  const candidatesById = new Map();
  let invalidIdCount = 0;

  for (const item of items) {
    const candidate = normalizeFnrhOfficialCandidate(item);
    if (!candidate || !isValidUuid(candidate.hospedeId)) {
      invalidIdCount += 1;
      continue;
    }

    const existing = candidatesById.get(candidate.hospedeId);
    if (!existing) {
      candidatesById.set(candidate.hospedeId, candidate);
      continue;
    }

    if (
      getFnrhOfficialCandidateConflictKey(existing) !==
      getFnrhOfficialCandidateConflictKey(candidate)
    ) {
      return {
        candidates: [],
        invalidIdCount,
        hasConflict: true
      };
    }
  }

  return {
    candidates: Array.from(candidatesById.values()),
    invalidIdCount,
    hasConflict: false
  };
}

app.get("/stays/:stayId/fnrh/hospedes-oficiais", async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  const operationalErrorMessage = "Não foi possível consultar os hóspedes oficiais da reserva.";

  if (!stayId) {
    return res.status(400).json({ error: "stayId deve ser um inteiro positivo" });
  }

  try {
    const stay = await dbGetAsync(
      `SELECT id, fnrh_reserva_id
       FROM stays
       WHERE id = ? AND property_id = ?`,
      [stayId, PROPERTY_ID]
    );
    if (!stay) {
      return res.status(404).json({ error: "Stay não encontrada" });
    }

    const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
    if (!fnrhReservaId) {
      return res.status(409).json({
        error: "Registre a reserva na FNRH antes de consultar os hóspedes oficiais."
      });
    }

    const localGuests = await dbAllAsync(
      `SELECT id, fnrh_hospede_id, is_main_guest, fnrh_checkin_at, fnrh_checkout_at
       FROM guests
       WHERE stay_id = ?`,
      [stayId]
    );
    const validLocalGuests = localGuests.filter((guest) => {
      return isValidUuid(normalizeFnrhUuid(guest.fnrh_hospede_id));
    });
    const localGuestsByFnrhId = new Map(
      validLocalGuests.map((guest) => [normalizeFnrhUuid(guest.fnrh_hospede_id), guest])
    );

    let officialResult;
    try {
      officialResult = await fetchFnrhReservationGuests(fnrhReservaId);
    } catch (error) {
      console.error("[FNRH] operational reservation guests error:", {
        stay_id: stayId,
        etapa: "consulta_oficial",
        status: error?.fnrhStatus ?? null,
        code: "FNRH_RESERVATION_GUESTS_REQUEST_FAILED"
      });
      return res.status(502).json({ error: operationalErrorMessage });
    }

    if (!officialResult.ok) {
      console.error("[FNRH] operational reservation guests error:", {
        stay_id: stayId,
        etapa: "resposta_oficial",
        status: officialResult.status,
        code: "FNRH_RESERVATION_GUESTS_HTTP_ERROR"
      });
      return res.status(502).json({ error: operationalErrorMessage });
    }

    const officialItems = getFnrhOfficialCandidateItems(officialResult.body);
    if (!officialItems) {
      console.error("[FNRH] operational reservation guests error:", {
        stay_id: stayId,
        etapa: "formato_resposta",
        status: officialResult.status,
        code: "FNRH_RESERVATION_GUESTS_INVALID_FORMAT"
      });
      return res.status(502).json({ error: operationalErrorMessage });
    }

    const normalized = normalizeUniqueFnrhOfficialCandidates(officialItems);
    if (normalized.hasConflict) {
      console.error("[FNRH] operational reservation guests error:", {
        stay_id: stayId,
        etapa: "deduplicacao",
        status: officialResult.status,
        code: "FNRH_RESERVATION_GUESTS_CONFLICT"
      });
      return res.status(502).json({ error: operationalErrorMessage });
    }

    const officialIds = new Set(normalized.candidates.map((candidate) => candidate.hospedeId));
    const guests = normalized.candidates.map((candidate) => {
      const localGuest = localGuestsByFnrhId.get(candidate.hospedeId) || null;
      return {
        fnrh_hospede_id: candidate.hospedeId,
        full_name: candidate.fullName || null,
        document_type: candidate.documentType || null,
        document_masked: maskFnrhOfficialDocument(candidate),
        situacao_hospede_id: candidate.situation || null,
        situacao_hospede: candidate.situationLabel,
        situacao_cor: candidate.situationColor,
        is_local: !!localGuest,
        local_guest_id: localGuest?.id ?? null,
        local_is_main_guest: localGuest ? Number(localGuest.is_main_guest) === 1 : null,
        local_checkin_at: String(localGuest?.fnrh_checkin_at || "").trim() || null,
        local_checkout_at: String(localGuest?.fnrh_checkout_at || "").trim() || null
      };
    }).sort((left, right) => {
      if (left.is_local !== right.is_local) return left.is_local ? 1 : -1;
      return String(left.full_name || "").localeCompare(
        String(right.full_name || ""),
        "pt-BR",
        { sensitivity: "base" }
      );
    });

    const matchedTotal = guests.filter((guest) => guest.is_local).length;
    const localOnlyTotal = Array.from(localGuestsByFnrhId.keys()).filter((id) => {
      return !officialIds.has(id);
    }).length;
    const summary = {
      official_total: guests.length,
      local_total: validLocalGuests.length,
      matched_total: matchedTotal,
      missing_local_total: guests.length - matchedTotal,
      local_only_total: localOnlyTotal
    };

    console.log("[FNRH] operational reservation guests response:", {
      stay_id: stayId,
      etapa: "concluido",
      status: officialResult.status,
      official_total: summary.official_total,
      local_total: summary.local_total,
      matched_total: summary.matched_total,
      missing_local_total: summary.missing_local_total,
      local_only_total: summary.local_only_total,
      ignored_invalid_official_ids: normalized.invalidIdCount
    });

    return res.json({
      success: true,
      stay_id: stayId,
      summary,
      guests
    });
  } catch (error) {
    console.error("[FNRH] operational reservation guests error:", {
      stay_id: stayId,
      etapa: "processamento_local",
      status: null,
      code: String(error?.code || "FNRH_RESERVATION_GUESTS_INTERNAL_ERROR")
    });
    return res.status(500).json({
      error: "Erro interno ao consultar os hóspedes oficiais."
    });
  }
});

app.post("/stays/:stayId/fnrh/importar-hospede-vinculado", async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  const requestBody = req.body;
  const allowedBodyFields = ["fnrh_hospede_id", "is_main_guest"];

  if (!stayId) {
    return res.status(400).json({ error: "stayId deve ser um inteiro positivo" });
  }
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return res.status(400).json({ error: "Corpo da requisição inválido" });
  }
  if (
    Object.keys(requestBody).length !== allowedBodyFields.length ||
    Object.keys(requestBody).some((field) => !allowedBodyFields.includes(field))
  ) {
    return res.status(400).json({
      error: "O corpo aceita somente fnrh_hospede_id e is_main_guest"
    });
  }

  const fnrhHospedeId = normalizeFnrhUuid(requestBody.fnrh_hospede_id);
  const isMainGuest = requestBody.is_main_guest;
  if (!isValidUuid(fnrhHospedeId)) {
    return res.status(400).json({ error: "fnrh_hospede_id deve ser um UUID válido" });
  }
  if (typeof isMainGuest !== "boolean") {
    return res.status(400).json({ error: "is_main_guest deve ser boolean" });
  }

  const sendAlreadyImported = (guest) => {
    return res.status(200).json({
      success: true,
      already_imported: true,
      official_status: null,
      guest
    });
  };
  const sendExistingFnrhConflict = (guest) => {
    if (String(guest.stay_id) === String(stayId)) {
      return sendAlreadyImported(guest);
    }
    return res.status(409).json({
      error: "Este registro FNRH já está associado a outra hospedagem local."
    });
  };
  const synchronizationMessage =
    "A situação oficial deste hóspede precisa ser sincronizada antes da importação.";
  const externalErrorMessage = "Não foi possível confirmar o hóspede na reserva oficial.";

  try {
    const stay = await dbGetAsync(
      `SELECT id, fnrh_reserva_id
       FROM stays
       WHERE id = ? AND property_id = ?`,
      [stayId, PROPERTY_ID]
    );
    if (!stay) {
      return res.status(404).json({ error: "Stay não encontrada" });
    }

    const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
    if (!fnrhReservaId) {
      return res.status(409).json({
        error: "Registre a reserva na FNRH antes de importar hóspedes oficiais."
      });
    }

    const existingByFnrhId = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
    if (existingByFnrhId) {
      return sendExistingFnrhConflict(existingByFnrhId);
    }

    let officialResult;
    try {
      officialResult = await fetchFnrhReservationGuests(fnrhReservaId);
    } catch (error) {
      console.error("[FNRH] linked guest import error:", {
        stay_id: stayId,
        etapa: "consulta_oficial",
        status: error?.fnrhStatus ?? null,
        code: "FNRH_LINKED_GUEST_REQUEST_FAILED"
      });
      return res.status(502).json({ error: externalErrorMessage });
    }

    if (!officialResult.ok) {
      console.error("[FNRH] linked guest import error:", {
        stay_id: stayId,
        etapa: "resposta_oficial",
        status: officialResult.status,
        code: "FNRH_LINKED_GUEST_HTTP_ERROR"
      });
      return res.status(502).json({ error: externalErrorMessage });
    }

    const officialItems = getFnrhOfficialCandidateItems(officialResult.body);
    if (!officialItems) {
      console.error("[FNRH] linked guest import error:", {
        stay_id: stayId,
        etapa: "formato_resposta",
        status: officialResult.status,
        code: "FNRH_LINKED_GUEST_INVALID_FORMAT"
      });
      return res.status(502).json({ error: externalErrorMessage });
    }

    const officialMatches = officialItems
      .map(normalizeFnrhOfficialCandidate)
      .filter((candidate) => candidate?.hospedeId === fnrhHospedeId);
    if (!officialMatches.length) {
      return res.status(404).json({
        error: "O hóspede não foi encontrado entre os hóspedes oficiais desta reserva."
      });
    }
    if (officialMatches.length !== 1) {
      console.error("[FNRH] linked guest import error:", {
        stay_id: stayId,
        etapa: "correspondencia_oficial",
        status: officialResult.status,
        code: "FNRH_LINKED_GUEST_AMBIGUOUS"
      });
      return res.status(502).json({ error: externalErrorMessage });
    }

    const confirmedCandidate = officialMatches[0];
    if (
      String(confirmedCandidate.situation || "").trim().toUpperCase() !==
      "PRECHECKIN_REALIZADO"
    ) {
      return res.status(409).json({ error: synchronizationMessage });
    }
    if (!isFnrhCandidateOfficialDataValid(confirmedCandidate)) {
      return res.status(422).json({
        error: "Os dados oficiais do hóspede são insuficientes para criar o registro local."
      });
    }

    const cpf = getFnrhCandidateCpf(confirmedCandidate);
    const birthDate = normalizeOptionalFnrhDate(confirmedCandidate.birthDate);
    const pessoaId = String(confirmedCandidate.pessoaId || "").trim() || null;

    const currentByFnrhId = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
    if (currentByFnrhId) {
      return sendExistingFnrhConflict(currentByFnrhId);
    }

    if (isMainGuest) {
      const existingMainGuest = await dbGetAsync(
        `SELECT id FROM guests WHERE stay_id = ? AND is_main_guest = 1 LIMIT 1`,
        [stayId]
      );
      if (existingMainGuest) {
        const concurrentGuest = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
        if (concurrentGuest) {
          return sendExistingFnrhConflict(concurrentGuest);
        }
        return res.status(409).json({
          error: "Esta hospedagem já possui um hóspede principal."
        });
      }
    }

    if (cpf) {
      const existingCpfGuest = await dbGetAsync(
        `SELECT id
         FROM guests
         WHERE stay_id = ? AND cpf = ?
         LIMIT 1`,
        [stayId, cpf]
      );
      if (existingCpfGuest) {
        const concurrentGuest = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
        if (concurrentGuest) {
          return sendExistingFnrhConflict(concurrentGuest);
        }
        return res.status(409).json({
          error: "Já existe um hóspede local com este CPF. Verifique o hóspede existente antes de importar."
        });
      }
    }

    let insertResult;
    try {
      insertResult = await dbRunAsync(
        `INSERT INTO guests
         (stay_id, full_name, cpf, birth_date, is_main_guest, fnrh_hospede_id,
          fnrh_pessoa_id, fnrh_checkin_at, fnrh_checkout_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL, NULL
         WHERE (
           ? = 0 OR NOT EXISTS (
             SELECT 1 FROM guests WHERE stay_id = ? AND is_main_guest = 1
           )
         )
         AND (
           ? IS NULL OR NOT EXISTS (
             SELECT 1 FROM guests WHERE stay_id = ? AND cpf = ?
           )
         )`,
        [
          stayId,
          confirmedCandidate.fullName,
          cpf,
          birthDate,
          isMainGuest ? 1 : 0,
          fnrhHospedeId,
          pessoaId,
          isMainGuest ? 1 : 0,
          stayId,
          cpf,
          stayId,
          cpf
        ]
      );
    } catch (insertError) {
      if (isFnrhHospedeIdUniqueConstraintError(insertError)) {
        const concurrentGuest = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
        if (concurrentGuest) {
          return sendExistingFnrhConflict(concurrentGuest);
        }
      }
      throw insertError;
    }

    if (insertResult.changes !== 1) {
      const concurrentGuest = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
      if (concurrentGuest) {
        return sendExistingFnrhConflict(concurrentGuest);
      }
      if (isMainGuest) {
        const concurrentMainGuest = await dbGetAsync(
          `SELECT id FROM guests WHERE stay_id = ? AND is_main_guest = 1 LIMIT 1`,
          [stayId]
        );
        if (concurrentMainGuest) {
          return res.status(409).json({
            error: "Esta hospedagem já possui um hóspede principal."
          });
        }
      }
      if (cpf) {
        const concurrentCpfGuest = await dbGetAsync(
          `SELECT id FROM guests WHERE stay_id = ? AND cpf = ? LIMIT 1`,
          [stayId, cpf]
        );
        if (concurrentCpfGuest) {
          return res.status(409).json({
            error: "Já existe um hóspede local com este CPF. Verifique o hóspede existente antes de importar."
          });
        }
      }
      return res.status(409).json({
        error: "Os dados locais mudaram antes da importação. Atualize e tente novamente."
      });
    }

    const importedGuest = await loadPropertyGuestById(insertResult.lastID);
    if (!importedGuest) {
      return res.status(500).json({
        error: "Hóspede criado, mas não foi possível recarregar o registro local."
      });
    }

    console.log("[FNRH] linked guest import response:", {
      stay_id: stayId,
      etapa: "concluido",
      status: 201,
      resultado: "created"
    });
    return res.status(201).json({
      success: true,
      already_imported: false,
      official_status: confirmedCandidate.situation,
      guest: importedGuest
    });
  } catch (error) {
    console.error("[FNRH] linked guest import error:", {
      stay_id: stayId,
      etapa: "processamento_local",
      status: null,
      code: String(error?.code || "FNRH_LINKED_GUEST_INTERNAL_ERROR")
    });
    return res.status(500).json({
      error: "Erro interno ao importar o hóspede oficial."
    });
  }
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
      error: "ID da reserva, nome completo e CPF sÃ£o obrigatÃ³rios"
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
      error: "CPF invÃ¡lido"
    });
  }

  if (!isValidBirthDate(birthDateClean)) {
    return res.status(400).json({
      error: "Data de nascimento invÃ¡lida"
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
        return res.status(404).json({ error: "Registro nÃ£o encontrado" });
      }

      if (row.status !== "validated") {
        return res.status(400).json({
          error: "Registro ainda nÃ£o estÃ¡ validado para envio"
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

          db.run(
            `UPDATE stays
             SET quantidade_hospede_adulto = ?, quantidade_hospede_menor = ?
             WHERE id = ? AND property_id = ?`,
            [quantidadeHospedeAdulto, quantidadeHospedeMenor, stayWithToken.id, PROPERTY_ID],
            (updateErr) => {
              if (updateErr) {
                console.error("Erro ao atualizar quantidades da stay existente:", updateErr);
              }
            }
          );

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

// cria ou busca uma suÃ­te (stay)
app.post("/stays", (req, res) => {
  const { reservation_id, sub_reservation_id, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      error: "ID da reserva obrigatorio"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();
  const dataEntrada = String(data_entrada || "").trim();
  const dataSaida = String(data_saida || "").trim();
  const quantidadeHospedeAdulto = Math.max(1, Number(quantidade_hospede_adulto) || 1);
  const quantidadeHospedeMenor = Math.max(0, Number(quantidade_hospede_menor) || 0);

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
        return ensureStayHasPublicToken(row, (tokenErr, stayWithToken) => {
          if (tokenErr) {
            console.error("Erro ao garantir public_token da stay existente:", tokenErr);
            return res.status(500).json({ error: "Erro ao preparar link publico da stay" });
          }

          return db.run(
            `UPDATE stays
             SET quantidade_hospede_adulto = ?, quantidade_hospede_menor = ?
             WHERE id = ? AND property_id = ?`,
            [quantidadeHospedeAdulto, quantidadeHospedeMenor, stayWithToken.id, PROPERTY_ID],
            (updateErr) => {
              if (updateErr) {
                console.error("Erro ao atualizar quantidades da stay existente:", updateErr);
                return res.status(500).json({ error: "Erro ao atualizar quantidades da stay" });
              }

              return res.json({
                message: "Stay ja existe",
                stay: {
                  ...stayWithToken,
                  quantidade_hospede_adulto: quantidadeHospedeAdulto,
                  quantidade_hospede_menor: quantidadeHospedeMenor
                }
              });
            }
          );
        });
      }

      const publicToken = generatePublicToken();

      db.run(
        `INSERT INTO stays (
           property_id,
           reservation_id,
           sub_reservation_id,
           data_entrada,
           data_saida,
           public_token,
           quantidade_hospede_adulto,
           quantidade_hospede_menor
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [PROPERTY_ID, reservationId, subReservationId, dataEntrada, dataSaida, publicToken, quantidadeHospedeAdulto, quantidadeHospedeMenor],
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
              data_saida: dataSaida,
              public_token: publicToken,
              quantidade_hospede_adulto: quantidadeHospedeAdulto,
              quantidade_hospede_menor: quantidadeHospedeMenor
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
    `SELECT id, property_id, reservation_id, sub_reservation_id, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor, public_token, fnrh_reserva_id, fnrh_link_precheckin_oficial, fnrh_last_status, fnrh_last_message, fnrh_last_sent_at, fnrh_last_guest_count_sent, fnrh_last_guest_count_confirmed, created_at
     FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID],
    (err, stay) => {
      if (err) {
        console.error("Erro ao buscar stay:", err);
        return res.status(500).json({ error: "Erro ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay nÃ£o encontrada" });
      }

      return res.json(stay);
    }
  );
});

app.get("/stays/public/:token", (req, res) => {
  const publicToken = String(req.params.token || "").trim();

  if (!publicToken) {
    return res.status(400).json({ error: "Token pÃºblico nÃ£o informado" });
  }

  db.get(
    `SELECT id, property_id, reservation_id, sub_reservation_id, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor, public_token, fnrh_last_status, fnrh_last_message, fnrh_last_sent_at, fnrh_last_guest_count_sent, fnrh_last_guest_count_confirmed, created_at
     FROM stays
     WHERE public_token = ? AND property_id = ?`,
    [publicToken, PROPERTY_ID],
    (err, stay) => {
      if (err) {
        console.error("Erro ao buscar stay pÃºblica por token:", err);
        return res.status(500).json({ error: "Erro ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay nÃ£o encontrada" });
      }

      return res.json(stay);
    }
  );
});

app.put("/stays/:id", (req, res) => {
  const stayId = req.params.id;
  const { reservation_id, sub_reservation_id, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor } = req.body;
  if (!reservation_id) {
    return res.status(400).json({
      error: "ID da reserva e obrigatorio"
    });
  }

  const reservationId = String(reservation_id).trim();
  const subReservationId = String(sub_reservation_id || reservation_id).trim();
  const dataEntrada = String(data_entrada || "").trim();
  const dataSaida = String(data_saida || "").trim();
  const quantidadeHospedeAdulto = Math.max(1, Number(quantidade_hospede_adulto) || 1);
  const quantidadeHospedeMenor = Math.max(0, Number(quantidade_hospede_menor) || 0);
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
     SET reservation_id = ?, sub_reservation_id = ?, data_entrada = ?, data_saida = ?, quantidade_hospede_adulto = ?, quantidade_hospede_menor = ?
     WHERE id = ? AND property_id = ?`,
    [reservationId, subReservationId, dataEntrada, dataSaida, quantidadeHospedeAdulto, quantidadeHospedeMenor, stayId, PROPERTY_ID],
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
          data_saida: dataSaida,
          quantidade_hospede_adulto: quantidadeHospedeAdulto,
          quantidade_hospede_menor: quantidadeHospedeMenor
        }
      });
    }
  );
});

// cria hÃ³spede vinculado a uma suÃ­te
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
  const deficienciaIdClean = String(deficiencia_id || "").trim();
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

  if (birthDateClean && !isValidBirthDate(birthDateClean)) {
    return res.status(400).json({ error: "Data de nascimento invalida" });
  }

  if (!isMainGuestProvided) {
    return res.status(400).json({ error: "Tipo do hospede obrigatorio" });
  }

  if (!cidadeIdClean) {
    return res.status(400).json({ error: "cidade_id obrigatorio" });
  }

  if (!estadoIdClean) {
    return res.status(400).json({ error: "estado_id obrigatorio" });
  }

  if (generoIdClean && !VALID_GENERO_IDS.includes(generoIdClean)) {
    return res.status(400).json({ error: "Genero invalido" });
  }

  if (racaIdClean && !VALID_RACA_IDS.includes(racaIdClean)) {
    return res.status(400).json({ error: "Raca/Cor invalida" });
  }

  if (deficienciaIdClean && !VALID_DEFICIENCIA_IDS.includes(deficienciaIdClean)) {
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
// lista hÃ³spedes de uma suÃ­te
app.get("/stays/:id/guests", (req, res) => {
  const stayId = req.params.id;

  db.all(
    `SELECT * FROM guests
     WHERE stay_id = ?
     ORDER BY created_at ASC`,
    [stayId],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar hÃ³spedes:", err);
        return res.status(500).json({ error: "Erro ao buscar hÃ³spedes" });
      }

      res.json(rows);
    }
  );
});

app.post("/stays/:stayId/fnrh/vincular-precheckin", (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  const requestBody = req.body;
  const allowedBodyFields = ["guest_id", "fnrh_hospede_id"];

  if (!stayId) {
    return res.status(400).json({ error: "stayId deve ser um inteiro positivo" });
  }

  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return res.status(400).json({ error: "Corpo da requisição inválido" });
  }

  const unexpectedFields = Object.keys(requestBody).filter((field) => !allowedBodyFields.includes(field));
  if (unexpectedFields.length) {
    return res.status(400).json({
      error: "O corpo aceita somente guest_id e fnrh_hospede_id"
    });
  }

  const guestId = parsePositiveInteger(requestBody.guest_id);
  const fnrhHospedeId = normalizeFnrhUuid(requestBody.fnrh_hospede_id);

  if (!guestId) {
    return res.status(400).json({ error: "guest_id deve ser um inteiro positivo" });
  }

  if (!fnrhHospedeId) {
    return res.status(400).json({ error: "fnrh_hospede_id é obrigatório" });
  }

  if (!isValidUuid(fnrhHospedeId)) {
    return res.status(400).json({ error: "fnrh_hospede_id deve ser um UUID válido" });
  }

  db.get(
    `SELECT id, fnrh_reserva_id
     FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID],
    (stayErr, stay) => {
      if (stayErr) {
        console.error("[FNRH] erro ao buscar stay para vínculo:", { stay_id: stayId });
        return res.status(500).json({ error: "Erro no banco ao buscar stay" });
      }

      if (!stay) {
        return res.status(404).json({ error: "Stay não encontrada" });
      }

      const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
      if (!fnrhReservaId) {
        return res.status(409).json({
          error: "Stay sem fnrh_reserva_id para vincular pré-check-in",
          stay_id: stayId
        });
      }

      db.get(
        `SELECT guests.id, guests.stay_id, guests.fnrh_hospede_id
         FROM guests
         INNER JOIN stays ON stays.id = guests.stay_id
         WHERE guests.id = ? AND guests.stay_id = ? AND stays.property_id = ?`,
        [guestId, stayId, PROPERTY_ID],
        (guestErr, guest) => {
          if (guestErr) {
            console.error("[FNRH] erro ao buscar hóspede para vínculo:", {
              stay_id: stayId,
              guest_id: guestId
            });
            return res.status(500).json({ error: "Erro no banco ao buscar hóspede" });
          }

          if (!guest) {
            return res.status(404).json({
              error: "Hóspede não encontrado para a stay informada"
            });
          }

          const currentFnrhHospedeId = String(guest.fnrh_hospede_id || "").trim();
          if (currentFnrhHospedeId === fnrhHospedeId) {
            return res.status(409).json({
              error: "Hóspede já identificado com este registro da FNRH",
              stay_id: stayId,
              guest_id: guestId
            });
          }

          if (currentFnrhHospedeId) {
            return res.status(409).json({
              error: "Hóspede já possui outro vínculo oficial com a FNRH",
              stay_id: stayId,
              guest_id: guestId
            });
          }

          db.get(
            `SELECT guests.id
             FROM guests
             INNER JOIN stays ON stays.id = guests.stay_id
             WHERE guests.fnrh_hospede_id = ?
               AND guests.id <> ?
               AND stays.property_id = ?
             LIMIT 1`,
            [fnrhHospedeId, guestId, PROPERTY_ID],
            async (duplicateErr, duplicateGuest) => {
              if (duplicateErr) {
                console.error("[FNRH] erro ao verificar duplicidade de vínculo:", {
                  stay_id: stayId,
                  guest_id: guestId
                });
                return res.status(500).json({ error: "Erro no banco ao validar vínculo FNRH" });
              }

              if (duplicateGuest) {
                return res.status(409).json({
                  error: "Este registro da FNRH já está vinculado a outro hóspede local"
                });
              }

              const startedAt = Date.now();

              try {
                const result = await linkFnrhPreCheckin(fnrhReservaId, fnrhHospedeId);
                const responseBody = sanitizeFnrhLinkResponseBody(result.body);

                console.log("[FNRH] resultado do vínculo de pré-check-in:", {
                  stay_id: stayId,
                  guest_id: guestId,
                  status: result.status,
                  duration_ms: Date.now() - startedAt,
                  success: !!result.ok
                });

                if (!result.ok) {
                  return res.status(502).json({
                    error: "Não foi possível vincular o pré-check-in na FNRH",
                    stay_id: stayId,
                    guest_id: guestId,
                    response_status: result.status,
                    response_body: responseBody
                  });
                }

                return db.run(
                  `UPDATE guests
                   SET fnrh_hospede_id = ?
                   WHERE id = ?
                     AND stay_id = ?
                     AND (fnrh_hospede_id IS NULL OR TRIM(fnrh_hospede_id) = '')`,
                  [fnrhHospedeId, guestId, stayId],
                  function (persistErr) {
                    if (persistErr) {
                      if (isFnrhHospedeIdUniqueConstraintError(persistErr)) {
                        console.error("[FNRH] conflito de identificador oficial ao persistir vínculo:", {
                          stay_id: stayId,
                          guest_id: guestId
                        });
                        return res.status(409).json({
                          error: "Este registro FNRH já está associado a outro hóspede local.",
                          stay_id: stayId,
                          guest_id: guestId
                        });
                      }

                      console.error("[FNRH] erro ao persistir vínculo de pré-check-in:", {
                        stay_id: stayId,
                        guest_id: guestId
                      });
                      return res.status(500).json({
                        error: "Vínculo realizado na FNRH, mas não foi possível persistir o resultado local",
                        stay_id: stayId,
                        guest_id: guestId,
                        response_status: result.status,
                        response_body: responseBody
                      });
                    }

                    if (this.changes !== 1) {
                      return res.status(409).json({
                        error: "O hóspede recebeu outro vínculo local durante a operação",
                        stay_id: stayId,
                        guest_id: guestId,
                        response_status: result.status,
                        response_body: responseBody
                      });
                    }

                    db.get(
                      `SELECT guests.id, guests.stay_id, guests.fnrh_hospede_id
                       FROM guests
                       INNER JOIN stays ON stays.id = guests.stay_id
                       WHERE guests.id = ? AND guests.stay_id = ? AND stays.property_id = ?`,
                      [guestId, stayId, PROPERTY_ID],
                      (reloadErr, updatedGuest) => {
                        if (reloadErr || !updatedGuest) {
                          console.error("[FNRH] erro ao recarregar hóspede após vínculo:", {
                            stay_id: stayId,
                            guest_id: guestId
                          });
                          return res.status(500).json({
                            error: "Vínculo persistido, mas não foi possível recarregar o hóspede",
                            stay_id: stayId,
                            guest_id: guestId,
                            response_status: result.status,
                            response_body: responseBody
                          });
                        }

                        return res.json({
                          message: "Pré-check-in vinculado com sucesso.",
                          stay_id: updatedGuest.stay_id,
                          guest_id: updatedGuest.id,
                          fnrh_hospede_id: updatedGuest.fnrh_hospede_id,
                          response_status: result.status,
                          response_body: responseBody
                        });
                      }
                    );
                  }
                );
              } catch (linkErr) {
                console.error("[FNRH] falha operacional ao vincular pré-check-in:", {
                  stay_id: stayId,
                  guest_id: guestId,
                  duration_ms: Date.now() - startedAt,
                  type: linkErr?.name || "Error"
                });

                return res.status(500).json({
                  error: "Não foi possível acessar a FNRH para vincular o pré-check-in",
                  stay_id: stayId,
                  guest_id: guestId,
                  response_status: linkErr.fnrhStatus ?? null,
                  response_body: sanitizeFnrhLinkResponseBody(linkErr.fnrhBody || null)
                });
              }
            }
          );
        }
      );
    }
  );
});

app.post("/stays/:stayId/fnrh/importar-vincular-precheckin", async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  const requestBody = req.body;
  const allowedBodyFields = [
    "fnrh_hospede_id",
    "is_main_guest",
    "data_inicio",
    "data_fim"
  ];

  if (!stayId) {
    return res.status(400).json({ error: "stayId deve ser um inteiro positivo" });
  }
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return res.status(400).json({ error: "Corpo da requisição inválido" });
  }
  if (Object.keys(requestBody).some((field) => !allowedBodyFields.includes(field))) {
    return res.status(400).json({
      error: "O corpo aceita somente fnrh_hospede_id, is_main_guest, data_inicio e data_fim"
    });
  }

  const fnrhHospedeId = normalizeFnrhUuid(requestBody.fnrh_hospede_id);
  const dataInicio = String(requestBody.data_inicio || "").trim();
  const dataFim = String(requestBody.data_fim || "").trim();
  const periodLength = getFnrhPeriodLength(dataInicio, dataFim);

  if (!isValidUuid(fnrhHospedeId)) {
    return res.status(400).json({ error: "fnrh_hospede_id deve ser um UUID válido" });
  }
  if (typeof requestBody.is_main_guest !== "boolean") {
    return res.status(400).json({ error: "is_main_guest deve ser boolean" });
  }
  if (normalizeOptionalFnrhDate(dataInicio) !== dataInicio || normalizeOptionalFnrhDate(dataFim) !== dataFim) {
    return res.status(400).json({ error: "data_inicio e data_fim devem usar YYYY-MM-DD" });
  }
  if (periodLength == null || periodLength < 1) {
    return res.status(400).json({ error: "data_inicio deve ser menor ou igual a data_fim" });
  }
  if (periodLength > 7) {
    return res.status(400).json({ error: "O período máximo permitido é de sete dias" });
  }

  const isMainGuest = requestBody.is_main_guest;
  const sendExistingGuest = (guest) => {
    return res.status(200).json({
      success: true,
      already_imported: true,
      guest
    });
  };
  const sendExistingFnrhConflict = (guest) => {
    if (String(guest.stay_id) === String(stayId)) {
      return sendExistingGuest(guest);
    }
    return res.status(409).json({
      error: "Este registro FNRH já está associado a outra hospedagem local."
    });
  };

  try {
    const stay = await dbGetAsync(
      `SELECT id, fnrh_reserva_id
       FROM stays
       WHERE id = ? AND property_id = ?`,
      [stayId, PROPERTY_ID]
    );
    if (!stay) {
      return res.status(404).json({ error: "Stay não encontrada" });
    }

    const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
    if (!fnrhReservaId) {
      return res.status(409).json({
        error: "Registre a reserva na FNRH antes de importar hóspedes."
      });
    }

    const existingByFnrhId = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
    if (existingByFnrhId) {
      return sendExistingFnrhConflict(existingByFnrhId);
    }

    if (isMainGuest) {
      const existingMainGuest = await dbGetAsync(
        `SELECT id FROM guests WHERE stay_id = ? AND is_main_guest = 1 LIMIT 1`,
        [stayId]
      );
      if (existingMainGuest) {
        return res.status(409).json({
          error: "Esta hospedagem já possui um hóspede principal."
        });
      }
    }

    let precheckinCandidate = null;
    let precheckinReadFailed = false;
    try {
      const precheckinResult = await fetchFnrhPreCheckins(dataInicio, dataFim, "false");
      if (!precheckinResult.ok) {
        precheckinReadFailed = true;
      } else {
        const match = findUniqueFnrhOfficialCandidate(precheckinResult.body, fnrhHospedeId);
        if (match.matchCount > 1) {
          return res.status(409).json({
            error: "O identificador informado apareceu mais de uma vez na consulta oficial."
          });
        }
        precheckinCandidate = match.candidate;
        if (
          precheckinCandidate &&
          precheckinCandidate.situation !== "PRECHECKIN_NAOVINCULADO"
        ) {
          return res.status(409).json({
            error: "O pré-check-in não está disponível para vínculo."
          });
        }
      }
    } catch {
      precheckinReadFailed = true;
    }

    let confirmedCandidate = null;
    if (!precheckinCandidate) {
      try {
        confirmedCandidate = await fetchConfirmedFnrhReservationCandidate(
          fnrhReservaId,
          fnrhHospedeId
        );
      } catch (confirmationError) {
        console.error("[FNRH] falha ao recuperar importação por leitura oficial:", {
          stay_id: stayId,
          etapa: "consulta_reserva",
          status: confirmationError.fnrhStatus ?? null
        });
        return res.status(502).json({
          error: "Não foi possível confirmar o hóspede na reserva oficial."
        });
      }

      if (!confirmedCandidate) {
        return res.status(precheckinReadFailed ? 502 : 409).json({
          error: precheckinReadFailed
            ? "Não foi possível revalidar o pré-check-in na FNRH."
            : "O pré-check-in não está disponível para importação."
        });
      }
    }

    const candidateBeforeLink = precheckinCandidate || confirmedCandidate;
    if (!isFnrhCandidateOfficialDataValid(candidateBeforeLink)) {
      return res.status(422).json({
        error: "Os dados oficiais do hóspede são insuficientes para criar o registro local."
      });
    }

    const validateLocalConflicts = async (candidate) => {
      const currentByFnrhId = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
      if (currentByFnrhId) {
        return { type: "fnrh_id", guest: currentByFnrhId };
      }
      if (isMainGuest) {
        const mainGuest = await dbGetAsync(
          `SELECT id FROM guests WHERE stay_id = ? AND is_main_guest = 1 LIMIT 1`,
          [stayId]
        );
        if (mainGuest) return { type: "main_guest" };
      }
      const cpf = getFnrhCandidateCpf(candidate);
      if (cpf) {
        const cpfGuest = await dbGetAsync(
          `SELECT id, fnrh_hospede_id
           FROM guests
           WHERE stay_id = ? AND cpf = ?
           LIMIT 1`,
          [stayId, cpf]
        );
        if (cpfGuest) return { type: "cpf" };
      }
      return null;
    };

    const conflictBeforeLink = await validateLocalConflicts(candidateBeforeLink);
    if (conflictBeforeLink?.type === "fnrh_id") {
      return sendExistingFnrhConflict(conflictBeforeLink.guest);
    }
    if (conflictBeforeLink?.type === "main_guest") {
      return res.status(409).json({
        error: "Esta hospedagem já possui um hóspede principal."
      });
    }
    if (conflictBeforeLink?.type === "cpf") {
      return res.status(409).json({
        error: "Já existe um hóspede local com este CPF. Utilize o vínculo do hóspede existente."
      });
    }

    if (!confirmedCandidate) {
      let linkResult = null;
      let linkFailed = false;
      try {
        linkResult = await linkFnrhPreCheckin(fnrhReservaId, fnrhHospedeId);
        linkFailed = !linkResult.ok;
      } catch {
        linkFailed = true;
      }

      try {
        confirmedCandidate = await fetchConfirmedFnrhReservationCandidate(
          fnrhReservaId,
          fnrhHospedeId
        );
      } catch (confirmationError) {
        console.error("[FNRH] falha ao confirmar vínculo para importação:", {
          stay_id: stayId,
          etapa: "confirmacao_pos_vinculo",
          status: confirmationError.fnrhStatus ?? linkResult?.status ?? null
        });
        return res.status(502).json({
          error: "Não foi possível confirmar o vínculo na reserva oficial."
        });
      }

      if (!confirmedCandidate) {
        return res.status(502).json({
          error: linkFailed
            ? "O vínculo não foi confirmado após a falha da FNRH."
            : "A FNRH respondeu ao vínculo, mas o hóspede não foi confirmado na reserva."
        });
      }
    }

    if (!isFnrhCandidateOfficialDataValid(confirmedCandidate)) {
      return res.status(422).json({
        error: "Os dados oficiais confirmados são insuficientes para criar o registro local."
      });
    }

    const finalConflict = await validateLocalConflicts(confirmedCandidate);
    if (finalConflict?.type === "fnrh_id") {
      return sendExistingFnrhConflict(finalConflict.guest);
    }
    if (finalConflict?.type === "main_guest") {
      return res.status(409).json({
        error: "Esta hospedagem já possui um hóspede principal."
      });
    }
    if (finalConflict?.type === "cpf") {
      return res.status(409).json({
        error: "Já existe um hóspede local com este CPF. Utilize o vínculo do hóspede existente."
      });
    }

    const cpf = getFnrhCandidateCpf(confirmedCandidate);
    let insertResult;
    try {
      insertResult = await dbRunAsync(
        `INSERT INTO guests
         (stay_id, full_name, cpf, birth_date, is_main_guest, fnrh_hospede_id, fnrh_pessoa_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          stayId,
          confirmedCandidate.fullName,
          cpf,
          confirmedCandidate.birthDate,
          isMainGuest ? 1 : 0,
          fnrhHospedeId,
          confirmedCandidate.pessoaId
        ]
      );
    } catch (insertError) {
      if (isFnrhHospedeIdUniqueConstraintError(insertError)) {
        const concurrentGuest = await findLocalGuestByFnrhHospedeId(fnrhHospedeId);
        if (concurrentGuest) {
          return sendExistingFnrhConflict(concurrentGuest);
        }
      }
      console.error("[FNRH] falha ao persistir guest importado:", {
        stay_id: stayId,
        etapa: "persistencia_local",
        code: String(insertError?.code || "UNKNOWN")
      });
      return res.status(500).json({
        error: "Vínculo confirmado na FNRH, mas não foi possível criar o hóspede local."
      });
    }

    const importedGuest = await loadPropertyGuestById(insertResult.lastID);
    if (!importedGuest) {
      return res.status(500).json({
        error: "Hóspede criado, mas não foi possível recarregar o registro local."
      });
    }

    return res.status(201).json({
      success: true,
      already_imported: false,
      guest: importedGuest
    });
  } catch (error) {
    console.error("[FNRH] erro técnico na importação de pré-check-in:", {
      stay_id: stayId,
      etapa: "processamento",
      code: String(error?.code || "UNKNOWN")
    });
    return res.status(500).json({
      error: "Erro interno ao importar o pré-check-in."
    });
  }
});

app.post("/guests/:id/fnrh-checkin", (req, res) => {
  const guestId = req.params.id;

  db.get(
    `SELECT guests.id, guests.full_name, guests.fnrh_hospede_id, guests.fnrh_checkin_at, guests.fnrh_checkout_at, guests.stay_id
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID],
    async (err, guest) => {
      if (err) {
        console.error("Erro ao buscar hÃ³spede para check-in FNRH:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hÃ³spede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "HÃ³spede nÃ£o encontrado" });
      }

      const fnrhHospedeId = String(guest.fnrh_hospede_id || "").trim();
      if (!fnrhHospedeId) {
        return res.status(400).json({
          error: "HÃ³spede sem fnrh_hospede_id para check-in na FNRH",
          guest_id: guest.id
        });
      }

      if (String(guest.fnrh_checkin_at || "").trim()) {
        return res.status(409).json({
          error: "Check-in FNRH jÃ¡ registrado localmente para este hÃ³spede",
          guest_id: guest.id
        });
      }

      const checkinAtIso = new Date().toISOString();

      try {
        const result = await sendFnrhGuestCheckin(fnrhHospedeId, checkinAtIso);

        if (!result.ok) {
          const errorMessage = String(
            result.body?.error ||
            result.body?.message ||
            "Falha ao realizar check-in na FNRH"
          ).trim();

          return res.status(502).json({
            error: errorMessage,
            guest_id: guest.id,
            fnrh_hospede_id: fnrhHospedeId,
            checkin_at: checkinAtIso,
            fnrh_mode: process.env.FNRH_MODE || "mock",
            response_status: result.status,
            response_body: result.body
          });
        }

        return db.run(
          `UPDATE guests
           SET fnrh_checkin_at = ?
           WHERE id = ?`,
          [checkinAtIso, guest.id],
          (persistErr) => {
            if (persistErr) {
              console.error("Erro ao persistir check-in FNRH do hÃ³spede:", persistErr);
              return res.status(500).json({
                error: "Check-in FNRH realizado, mas falhou ao persistir o resultado local",
                guest_id: guest.id,
                fnrh_hospede_id: fnrhHospedeId,
                checkin_at: checkinAtIso,
                response_status: result.status,
                response_body: result.body
              });
            }

            return res.json({
              message: "Check-in FNRH realizado com sucesso",
              guest_id: guest.id,
              fnrh_hospede_id: fnrhHospedeId,
              checkin_at: checkinAtIso,
              response_status: result.status,
              response_body: result.body
            });
          }
        );
      } catch (checkinErr) {
        console.error("Erro ao realizar check-in FNRH:", checkinErr);

        return res.status(500).json({
          error: checkinErr.message || "Erro interno ao realizar check-in FNRH",
          guest_id: guest.id,
          fnrh_hospede_id: fnrhHospedeId,
          checkin_at: checkinAtIso,
          fnrh_mode: process.env.FNRH_MODE || "mock",
          response_status: checkinErr.fnrhStatus ?? null,
          response_body: checkinErr.fnrhBody || null
        });
      }
    }
  );
});

app.post("/guests/:id/fnrh-checkout", (req, res) => {
  const guestId = req.params.id;

  db.get(
    `SELECT guests.id, guests.full_name, guests.fnrh_hospede_id, guests.fnrh_checkin_at, guests.fnrh_checkout_at, guests.stay_id
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID],
    async (err, guest) => {
      if (err) {
        console.error("Erro ao buscar hÃƒÂ³spede para check-out FNRH:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hÃƒÂ³spede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "HÃƒÂ³spede nÃƒÂ£o encontrado" });
      }

      const fnrhHospedeId = String(guest.fnrh_hospede_id || "").trim();
      if (!fnrhHospedeId) {
        return res.status(400).json({
          error: "HÃƒÂ³spede sem fnrh_hospede_id para check-out na FNRH",
          guest_id: guest.id
        });
      }

      if (!String(guest.fnrh_checkin_at || "").trim()) {
        return res.status(409).json({
          error: "Check-out FNRH bloqueado: check-in ainda nÃ£o registrado localmente",
          guest_id: guest.id
        });
      }

      if (String(guest.fnrh_checkout_at || "").trim()) {
        return res.status(409).json({
          error: "Check-out FNRH jÃ¡ registrado localmente para este hÃ³spede",
          guest_id: guest.id
        });
      }

      const checkoutAtIso = new Date().toISOString();

      try {
        const result = await sendFnrhGuestCheckout(fnrhHospedeId, checkoutAtIso);

        if (!result.ok) {
          const errorMessage = String(
            result.body?.error ||
            result.body?.message ||
            "Falha ao realizar check-out na FNRH"
          ).trim();

          return res.status(502).json({
            error: errorMessage,
            guest_id: guest.id,
            fnrh_hospede_id: fnrhHospedeId,
            checkout_at: checkoutAtIso,
            fnrh_mode: process.env.FNRH_MODE || "mock",
            response_status: result.status,
            response_body: result.body
          });
        }

        return db.run(
          `UPDATE guests
           SET fnrh_checkout_at = ?
           WHERE id = ?`,
          [checkoutAtIso, guest.id],
          (persistErr) => {
            if (persistErr) {
              console.error("Erro ao persistir check-out FNRH do hÃƒÂ³spede:", persistErr);
              return res.status(500).json({
                error: "Check-out FNRH realizado, mas falhou ao persistir o resultado local",
                guest_id: guest.id,
                fnrh_hospede_id: fnrhHospedeId,
                checkout_at: checkoutAtIso,
                response_status: result.status,
                response_body: result.body
              });
            }

            return res.json({
              message: "Check-out FNRH realizado com sucesso",
              guest_id: guest.id,
              fnrh_hospede_id: fnrhHospedeId,
              checkout_at: checkoutAtIso,
              response_status: result.status,
              response_body: result.body
            });
          }
        );
      } catch (checkoutErr) {
        console.error("Erro ao realizar check-out FNRH:", checkoutErr);

        return res.status(500).json({
          error: checkoutErr.message || "Erro interno ao realizar check-out FNRH",
          guest_id: guest.id,
          fnrh_hospede_id: fnrhHospedeId,
          checkout_at: checkoutAtIso,
          fnrh_mode: process.env.FNRH_MODE || "mock",
          response_status: checkoutErr.fnrhStatus ?? null,
          response_body: checkoutErr.fnrhBody || null
        });
      }
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
        console.error("Erro ao buscar hÃ³spede para remoÃ§Ã£o:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hÃ³spede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "HÃ³spede nÃ£o encontrado" });
      }

      const deleteGuest = () => {
        db.run(
          "DELETE FROM guests WHERE id = ?",
          [guestId],
          function (deleteErr) {
            if (deleteErr) {
              console.error("Erro ao remover hÃ³spede:", deleteErr);
              return res.status(500).json({ error: "Erro ao remover hÃ³spede" });
            }

            return res.json({
              message: "HÃ³spede removido com sucesso",
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
            console.error("Erro ao validar titulares antes da remoÃ§Ã£o:", countErr);
            return res.status(500).json({ error: "Erro no banco ao validar titulares" });
          }

          if (Number(countRow?.main_guest_count || 0) <= 1) {
            return res.status(400).json({
              error: "NÃ£o Ã© possÃ­vel deixar a stay sem hÃ³spede titular."
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
    return res.status(400).json({ error: "Nome completo Ã© obrigatÃ³rio" });
  }

  const fullName = String(full_name || "").trim();
  const cpfClean = normalizeCPF(cpf);
  const phoneClean = phone ? onlyDigits(phone) : "";
  const emailClean = String(email || "").trim();
  const birthDateClean = String(birth_date || "").trim();
  const generoIdClean = String(genero_id || "").trim();
  const racaIdClean = String(raca_id || "").trim();
  const deficienciaIdClean = String(deficiencia_id || "").trim();
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
    return res.status(400).json({ error: "CPF Ã© obrigatÃ³rio" });
  }

  if (!isValidCPF(cpfClean)) {
    return res.status(400).json({
      error: "CPF invÃ¡lido"
    });
  }

  if (!birthDateClean) {
    return res.status(400).json({ error: "Data de nascimento Ã© obrigatÃ³ria" });
  }
  if (birthDateClean && !isValidBirthDate(birthDateClean)) {
    return res.status(400).json({ error: "Data de nascimento invÃ¡lida" });
  }

  if (!isMainGuestProvided) {
    return res.status(400).json({ error: "Tipo do hÃ³spede Ã© obrigatÃ³rio" });
  }

  if (!cidadeIdClean) {
    return res.status(400).json({ error: "cidade_id Ã© obrigatÃ³rio" });
  }

  if (!estadoIdClean) {
    return res.status(400).json({ error: "estado_id Ã© obrigatÃ³rio" });
  }

  if (generoIdClean && !VALID_GENERO_IDS.includes(generoIdClean)) {
    return res.status(400).json({ error: "GÃªnero invÃ¡lido" });
  }

  if (racaIdClean && !VALID_RACA_IDS.includes(racaIdClean)) {
    return res.status(400).json({ error: "RaÃ§a/Cor invÃ¡lida" });
  }

  if (deficienciaIdClean && !VALID_DEFICIENCIA_IDS.includes(deficienciaIdClean)) {
    return res.status(400).json({ error: "InformaÃ§Ã£o de deficiÃªncia invÃ¡lida" });
  }
  db.get(
    `SELECT guests.*, stays.property_id
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID],
    (err, guest) => {
      if (err) {
        console.error("Erro ao buscar hÃ³spede para ediÃ§Ã£o:", err);
        return res.status(500).json({ error: "Erro no banco ao buscar hÃ³spede" });
      }

      if (!guest) {
        return res.status(404).json({ error: "HÃ³spede nÃ£o encontrado" });
      }

      db.get(
        `SELECT id FROM guests
         WHERE stay_id = ? AND cpf = ? AND id <> ?`,
        [guest.stay_id, cpfClean, guestId],
        (duplicateErr, duplicateGuest) => {
          if (duplicateErr) {
            console.error("Erro ao validar CPF duplicado:", duplicateErr);
            return res.status(500).json({ error: "Erro no banco ao validar hÃ³spede" });
          }

          if (cpfClean && duplicateGuest) {
            return res.status(400).json({ error: "JÃ¡ existe um hÃ³spede com este CPF na mesma stay" });
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
                  console.error("Erro ao editar hÃ³spede:", updateErr);
                  return res.status(500).json({ error: "Erro ao editar hÃ³spede" });
                }

                return res.json({
                  message: "HÃ³spede atualizado com sucesso",
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
                  console.error("Erro ao validar titulares antes da ediÃ§Ã£o:", countErr);
                  return res.status(500).json({ error: "Erro no banco ao validar titulares" });
                }

                if (Number(countRow?.main_guest_count || 0) <= 1) {
                  return res.status(400).json({
                    error: "NÃ£o Ã© possÃ­vel deixar a stay sem hÃ³spede titular."
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
  const quantidadeHospedeAdultoFromRequest = req.body?.quantidade_hospede_adulto;
  const quantidadeHospedeMenorFromRequest = req.body?.quantidade_hospede_menor;

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
        return res.status(404).json({ error: "Stay nao encontrada" });
      }

      const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
      if (fnrhReservaId) {
        return res.status(409).json({
          error: "Esta reserva já foi registrada na FNRH. Use os fluxos de pré-check-in, vínculo, check-in ou check-out."
        });
      }

      db.all(
        `SELECT * FROM guests
         WHERE stay_id = ?
         ORDER BY created_at ASC`,
        [stayId],
        async (err, guests) => {
          if (err) {
            console.error("Erro ao buscar hospedes:", err);
            return res.status(500).json({ error: "Erro no banco ao buscar hospedes" });
          }

          const safeGuests = Array.isArray(guests) ? guests : [];
          const hasIdentifiedFnrhGuest = safeGuests.some((guest) => {
            return String(guest?.fnrh_hospede_id || "").trim() !== "";
          });
          if (hasIdentifiedFnrhGuest) {
            return res.status(409).json({
              error: "A reserva possui hóspede já identificado na FNRH e não pode ser registrada novamente pelo fluxo inicial."
            });
          }

          const hasGuests = safeGuests.length > 0;
          const missingMainGuest = hasGuests && !safeGuests.some((g) => g.is_main_guest);
          if (missingMainGuest) {
            return res.status(400).json({ error: "Nenhum hospede titular encontrado na stay" });
          }

          const quantidadeHospedeAdulto = Math.max(
            1,
            Number(quantidadeHospedeAdultoFromRequest ?? stay.quantidade_hospede_adulto) || 1
          );
          const quantidadeHospedeMenor = Math.max(
            0,
            Number(quantidadeHospedeMenorFromRequest ?? stay.quantidade_hospede_menor) || 0
          );
          const stayWithGuestCounts = {
            ...stay,
            quantidade_hospede_adulto: quantidadeHospedeAdulto,
            quantidade_hospede_menor: quantidadeHospedeMenor
          };
          const payload = useMinimalPayload
            ? buildFNRHPayloadMinimal(stayWithGuestCounts, safeGuests)
            : buildFNRHPayload(stayWithGuestCounts, safeGuests);
          const guestIds = safeGuests.map((g) => g.id);
          const guestCountSent = Array.isArray(payload?.dados_hospede) ? payload.dados_hospede.length : safeGuests.length;

          console.log("[FNRH] send-fnrh stay:", stay.id);
          console.log("[FNRH] send-fnrh quantidade adultos:", quantidadeHospedeAdulto);
          console.log("[FNRH] send-fnrh quantidade menores:", quantidadeHospedeMenor);
          console.log("[FNRH] send-fnrh com hospedes:", hasGuests ? "sim" : "nao");

          const persistSuccessResult = (result, guestCountConfirmed) => {
            const successMessage = guestCountSent === guestCountConfirmed
              ? "Envio concluido com todos os hospedes confirmados"
              : "Envio concluido com confirmacao parcial de hospedes";

            updateStayLastFNRHResult(
              stay.id,
              "success",
              successMessage,
              guestCountSent,
              guestCountConfirmed,
              (stayUpdateErr) => {
                if (stayUpdateErr) {
                  console.error("Erro ao salvar ultimo envio FNRH da stay:", stayUpdateErr);
                  return res.json({
                    message: "Stay enviada para FNRH com sucesso",
                    stay_id: stay.id,
                    fnrh_mode: process.env.FNRH_MODE || "mock",
                    response_status: result.status,
                    response_body: result.body,
                    local_persistence_warning: "Falhou ao salvar status consolidado local da stay"
                  });
                }

                persistFNRHReturnData(stay.id, safeGuests, result.body, (persistErr) => {
                  if (persistErr) {
                    console.error("Erro ao persistir identificadores retornados pela FNRH apos envio bem-sucedido:", persistErr);
                    return res.json({
                      message: "Stay enviada para FNRH com sucesso",
                      stay_id: stay.id,
                      fnrh_mode: process.env.FNRH_MODE || "mock",
                      response_status: result.status,
                      response_body: result.body,
                      local_persistence_warning: "Envio externo concluido, mas falhou ao salvar identificadores retornados pela FNRH"
                    });
                  }

                  return res.json({
                    message: "Stay enviada para FNRH com sucesso",
                    stay_id: stay.id,
                    fnrh_mode: process.env.FNRH_MODE || "mock",
                    response_status: result.status,
                    response_body: result.body
                  });
                });
              }
            );
          };

          const persistErrorResult = (result) => {
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
          };

          const persistSendErrorResult = (sendErr) => {
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
          };

          try {
            const result = await sendToFNRH(payload);
            const guestCountConfirmed = Array.isArray(result.body?.dados?.dados_hospedes) ? result.body.dados.dados_hospedes.length : 0;
            const returnedLink = String(result.body?.dados?.reserva?.link_precheckin || "").trim();

            console.log("[FNRH] send-fnrh link_precheckin retornado:", returnedLink || "(vazio)");

            if (result.ok) {
              if (!guestIds.length) {
                return persistSuccessResult(result, guestCountConfirmed);
              }

              return updateGuestsFNRHStatus(guestIds, "sent", "sent_to_fnrh", (updateErr) => {
                if (updateErr) {
                  console.error("Erro ao atualizar status FNRH dos hospedes:", updateErr);
                  updateStayLastFNRHResult(
                    stay.id,
                    "error",
                    "Enviado, mas falhou ao atualizar status local",
                    guestCountSent,
                    0,
                    (stayUpdateErr) => {
                      if (stayUpdateErr) {
                        console.error("Erro ao salvar falha local apos envio FNRH:", stayUpdateErr);
                      }

                      return res.status(500).json({
                        error: "Enviado, mas falhou ao atualizar status local"
                      });
                    }
                  );
                  return;
                }

                return persistSuccessResult(result, guestCountConfirmed);
              });
            }

            if (!guestIds.length) {
              return persistErrorResult(result);
            }

            return updateGuestsFNRHStatus(guestIds, "error", "validated", (updateErr) => {
              if (updateErr) {
                console.error("Erro ao marcar falha FNRH:", updateErr);
              }

              return persistErrorResult(result);
            });
          } catch (sendErr) {
            console.error("Erro ao enviar para FNRH:", sendErr);

            if (!guestIds.length) {
              return persistSendErrorResult(sendErr);
            }

            return updateGuestsFNRHStatus(guestIds, "error", "validated", (updateErr) => {
              if (updateErr) {
                console.error("Erro ao marcar status de erro FNRH:", updateErr);
              }

              return persistSendErrorResult(sendErr);
            });
          }
        }
      );
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

