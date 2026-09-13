console.log("SERVER COM SUB_RESERVATION_ID ðŸš€");
require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const db = require("./database/db");
const express = require("express");
const cors = require("cors");
const { performance } = require("node:perf_hooks");
const { AsyncLocalStorage } = require("node:async_hooks");

const fnrhTimingContext = new AsyncLocalStorage();
const fnrhResponseTiming = new WeakMap();
let fnrhTimingSequence = 0;

function logFnrhTiming(op, phase, started, fields = {}) {
  const context = fnrhTimingContext.getStore();
  console.log("[FNRH_TIMING]", JSON.stringify({
    request_id: context?.id ?? null, op, phase,
    duration_ms: Math.round((performance.now() - started) * 1000) / 1000,
    ...fields
  }));
}

function fnrhTimingError(error) {
  const codes = [error?.name, error?.code, error?.cause?.code];
  const timeout = codes.some(code => ["TimeoutError", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code));
  const type = codes.find(code => ["TimeoutError", "AbortError", "TypeError", "SyntaxError", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code)) || "Error";
  return { outcome: timeout ? "timeout" : "error", error_type: type };
}

async function measureFnrhPhase(op, phase, action) {
  const started = performance.now();
  logFnrhTiming(op, `${phase}_start`, started);
  try {
    const result = await action();
    logFnrhTiming(op, phase, started, { outcome: "complete" });
    return result;
  } catch (error) {
    logFnrhTiming(op, phase, started, fnrhTimingError(error));
    throw error;
  }
}

async function timedFnrhFetch(url, options) {
  // Only fixed logical names are logged; URLs, bodies and headers stay private.
  let pathname = "";
  try { pathname = new URL(url).pathname; } catch { /* Let fetch handle invalid URLs as before. */ }
  const endpoint = /\/pessoas\/documento\//.test(pathname) ? "pessoa_por_documento"
    : /\/reservas$/.test(pathname) ? "reserva_busca"
    : /\/reservas\/[^/]+$/.test(pathname) ? "reserva_detalhe"
    : /\/pessoas$/.test(pathname) ? "pessoas"
    : /\/reservas\/[^/]+\/hospedes$/.test(pathname) ? "reserva_hospedes"
    : /\/hospedes\/[^/]+\/checkin$/.test(pathname) ? "hospede_checkin"
    : /\/hospedes\/[^/]+\/checkout$/.test(pathname) ? "hospede_checkout"
    : /\/hospedes\/[^/]+$/.test(pathname) ? "hospede_detalhe" : "fnrh_other";
  const method = options?.method || "GET";
  const started = performance.now();
  const context = fnrhTimingContext.getStore();
  if (context && !context.externalStarted) {
    context.externalStarted = true;
    logFnrhTiming(context.op, "local_before_first_request", context.started);
  }
  logFnrhTiming(endpoint, "fnrh_request_start", started, { method, endpoint });
  try {
    const response = await fetch(url, options);
    fnrhResponseTiming.set(response, { endpoint, method });
    logFnrhTiming(endpoint, "fnrh_request", started, { method, endpoint, status: response.status, outcome: response.ok ? "success" : "http_error" });
    return response;
  } catch (error) {
    logFnrhTiming(endpoint, "fnrh_request", started, { method, endpoint, status: null, ...fnrhTimingError(error) });
    throw error;
  }
}

async function readFnrhResponse(response, format) {
  const started = performance.now();
  const meta = fnrhResponseTiming.get(response) || { endpoint: "fnrh_other", method: "GET" };
  try {
    const result = await response[format]();
    logFnrhTiming(meta.endpoint, "fnrh_body", started, { ...meta, status: response.status, outcome: "complete" });
    return result;
  } catch (error) {
    logFnrhTiming(meta.endpoint, "fnrh_body", started, { ...meta, status: response.status, ...fnrhTimingError(error) });
    throw error;
  }
}

function fnrhTimingMiddleware(req, res, next) {
  const path = req.path;
  const op = /^\/fnrh\/pessoas\/documento\/CPF\//.test(path) ? "lookup_cpf"
    : /^\/stays\/[^/]+\/fnrh\/hospede-assistido$/.test(path) ? "assisted_guest"
    : /^\/stays\/[^/]+\/fnrh\/hospedes-oficiais$/.test(path) ? "list_guests"
    : /^\/stays\/[^/]+\/fnrh\/sincronizar-situacoes$/.test(path) ? "reconcile_guests"
    : /^\/stays\/[^/]+\/fnrh\/vincular-reserva-existente$/.test(path) ? "link_existing_reservation"
    : /^\/guests\/[^/]+\/fnrh-checkin$/.test(path) ? "checkin" : null;
  if (!op) return next();
  const context = { id: ++fnrhTimingSequence, op, started: performance.now(), externalStarted: false };
  fnrhTimingContext.run(context, () => {
    logFnrhTiming(op, "route_start", context.started);
    let ended = false;
    const finish = outcome => {
      if (ended) return;
      ended = true;
      fnrhTimingContext.run(context, () => logFnrhTiming(op, "route_end", context.started, { status: res.statusCode, outcome }));
    };
    res.once("finish", () => finish("finished"));
    res.once("close", () => finish("closed"));
    next();
  });
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

app.use(fnrhTimingMiddleware);

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
const KNOWN_FNRH_GUEST_SITUATIONS = new Set([
  "PRECHECKIN_NAOVINCULADO",
  "PRECHECKIN_PENDENTE",
  "PRECHECKIN_REALIZADO",
  "CHECKIN_REALIZADO",
  "CHECKOUT_REALIZADO"
]);
const fnrhSituationSyncByStayId = new Map();
const fnrhGuestOperationByGuestId = new Map();
const FNRH_PROPERTY_TIME_ZONE = "America/Sao_Paulo";
const FNRH_MANUAL_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

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
    response = await timedFnrhFetch(finalUrl, {
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
  const text = await readFnrhResponse(response, "text");

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
    response = await timedFnrhFetch(finalUrl, {
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
  const text = await readFnrhResponse(response, "text");

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

function getFnrhRequestConfig() {
  const baseUrl = String(process.env.FNRH_BASE_URL || "").trim();
  const user = String(process.env.FNRH_USER || "").trim();
  const apiKey = String(process.env.FNRH_API_KEY || "").trim();
  const cpfSolicitante = String(process.env.FNRH_CPF_SOLICITANTE || "").trim();

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
  return { baseUrl, requestHeaders };
}

async function fetchFnrhReservationGuests(fnrhReservaId) {
  const { baseUrl, requestHeaders } = getFnrhRequestConfig();
  const finalUrl = `${baseUrl}/reservas/${encodeURIComponent(fnrhReservaId)}/hospedes`;
  const startedAt = Date.now();

  console.log("[FNRH][debug] reservation guests request:", {
    stage: "reservation_guests"
  });

  let response;

  try {
    response = await timedFnrhFetch(finalUrl, {
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
  const text = await readFnrhResponse(response, "text");
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

// Assisted requests never write locally or retry an official mutation.
const fnrhAssistedBusy = new Set();
const fnrhAssistedUncertain = new Set();
const fnrhAssistedPeople = new Map();
const fnrhAssistedCompleted = new Set();

function assistedError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function guardFnrhAssisted(req, res, next) {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  try {
    if (req.get("X-Vivamar-Assisted") !== "1" ||
        req.get("sec-fetch-site") === "cross-site" ||
        (origin && new URL(origin).host !== req.get("host"))) {
      return res.status(403).json({ error: "Abra esta ação pelo painel da recepção." });
    }
  } catch {
    return res.status(403).json({ error: "Origem inválida." });
  }
  next();
}

async function requestFnrhAssisted(pathname, method = "GET", body, responseMeta = null) {
  const { baseUrl, requestHeaders } = getFnrhRequestConfig();
  let response;
  try {
    response = await timedFnrhFetch(`${baseUrl}${pathname}`, {
      method, headers: requestHeaders, redirect: "manual",
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (responseMeta) responseMeta.status = response.status;
    if (method === "GET" && pathname.startsWith("/pessoas/documento/CPF/") && response.status === 404) return { dados: null };
    const data = await readFnrhResponse(response, "json");
    if (!response.ok) {
      throw Object.assign(assistedError(`A FNRH recusou a operação (HTTP ${response.status}). Revise os dados antes de continuar.`, 502), {
        uncertain: method !== "GET" && (response.status < 400 || response.status >= 500)
      });
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(assistedError("Não foi possível confirmar a resposta da FNRH. Não repita uma inclusão sem conferir o resultado oficial.", 502), {
      uncertain: method !== "GET"
    });
  }
}

function getFnrhAssistedAge(value, today = new Date()) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const birth = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(+birth) || birth.toISOString().slice(0, 10) !== text || birth > today) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

async function lookupFnrhAssistedPerson(cpf) {
  const body = await requestFnrhAssisted(`/pessoas/documento/CPF/${cpf}`);
  const d = body?.dados;
  if (d == null && body && typeof body === "object" && !Array.isArray(body) &&
      (Object.keys(body).length === 0 || Object.prototype.hasOwnProperty.call(body, "dados"))) {
    return { pessoa_id: null, fields: { cpf } };
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw assistedError("Resposta de pessoa não reconhecida.", 502);
  const doc = d.documento || {};
  const id = d.id || d.pessoa_id || null;
  const returnedCpf = normalizeCPF(doc.numero_documento || "");
  const returnedType = doc.tipo_documento?.id || doc.tipo_documento_id || (typeof doc.tipo_documento === "string" ? doc.tipo_documento : "");
  if ((d.id && d.pessoa_id && d.id !== d.pessoa_id) || (returnedType && returnedType !== "CPF") ||
      (returnedCpf && returnedCpf !== cpf) || (id && (!isValidUuid(id) || returnedCpf !== cpf))) {
    throw assistedError("Identidade oficial ambígua. Inclusão bloqueada.", 409);
  }
  const p = d.dado_pessoal || d;
  const c = d.contato || {};
  const a = c.endereco || {};
  const domain = value => typeof value === "object" && value ? value.id || "" : value || "";
  const fields = {
    cpf, nome: p.nome || "", data_nascimento: p.data_nascimento || "",
    genero_id: domain(p.genero || p.genero_id), GeneroDescricao: p.GeneroDescricao || "",
    PaisNacionalidade_id: domain(p.PaisNacionalidade_id), PaisResidencia_id: domain(a.PaisResidencia_id),
    cep: a.cep || "", logradouro: a.logradouro || "", numero: a.numero || "",
    complemento: a.complemento || "", bairro: a.bairro || "", cidade: a.cidade?.nome || "",
    cidade_id: a.cidade?.id || "", estado_id: a.cidade?.estado?.uf || "",
    raca_id: domain(p.raca_id), deficiencia_id: domain(p.deficiencia?.possui_deficiencia || p.deficiencia_id),
    tipo_deficiencia_id: domain(p.deficiencia?.tipo_deficiencia || p.tipo_deficiencia_id)
  };
  return { pessoa_id: id, fields };
}

function buildFnrhAssistedPerson(input) {
  const text = key => String(input?.[key] || "").trim();
  const cpf = normalizeCPF(text("cpf"));
  if (!isValidCPF(cpf)) throw assistedError("Informe um CPF válido.");
  const birth = text("data_nascimento");
  const parsed = new Date(`${birth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== birth || parsed > new Date()) throw assistedError("Data de nascimento inválida.");
  const gender = text("genero_id");
  if (!text("nome") || !["HOMEM", "MULHER", "OUTRO", "NAOINFORMADO"].includes(gender)) throw assistedError("Informe nome completo e gênero.");
  if (gender === "OUTRO" && !text("GeneroDescricao")) throw assistedError("Informe a descrição do gênero.");
  if (text("PaisNacionalidade_id") !== "BR" || text("PaisResidencia_id") !== "BR") throw assistedError("Esta primeira versão atende brasileiros residentes no Brasil.");
  if (!/^\d{7}$/.test(text("cidade_id")) || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(text("estado_id"))) throw assistedError("Informe município IBGE e UF válidos.");
  const cep = onlyDigits(text("cep"));
  if (cep && (cep.length !== 8 || !text("logradouro") || !text("numero") || !text("bairro"))) throw assistedError("Com CEP, informe logradouro, número e bairro completos.");
  const person = {
    nome: text("nome"), data_nascimento: birth, genero_id: gender, PaisNacionalidade_id: "BR",
    documento_id: { tipo_documento_id: "CPF", numero_documento: cpf },
    contato: { PaisResidencia_id: "BR", cidade_id: text("cidade_id"), estado_id: text("estado_id") }
  };
  for (const key of ["logradouro", "numero", "complemento", "bairro"]) if (text(key)) person.contato[key] = text(key);
  if (cep) person.contato.cep = cep;
  if (gender === "OUTRO") person.GeneroDescricao = text("GeneroDescricao");
  if (text("raca_id")) person.raca_id = text("raca_id");
  if (text("deficiencia_id")) {
    if (!["SIM", "NAO", "NAOINFORMAR"].includes(text("deficiencia_id"))) throw assistedError("Deficiência inválida.");
    person.deficiencia_id = text("deficiencia_id");
    if (person.deficiencia_id === "SIM") {
      if (!text("tipo_deficiencia_id")) throw assistedError("Informe o código oficial do tipo de deficiência.");
      person.tipo_deficiencia_id = text("tipo_deficiencia_id");
    }
  }
  return person;
}

app.get("/fnrh/pessoas/documento/CPF/:cpf", guardFnrhAssisted, async (req, res) => {
  const cpf = normalizeCPF(req.params.cpf);
  if (!isValidCPF(cpf)) return res.status(400).json({ error: "Informe um CPF válido." });
  try { return res.json(await lookupFnrhAssistedPerson(cpf)); }
  catch (error) { return res.status(error.status || 502).json({ error: error.message }); }
});

app.post("/stays/:stayId/fnrh/hospede-assistido", guardFnrhAssisted, async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  const cpf = normalizeCPF(req.body?.cpf || "");
  if (!stayId || !isValidCPF(cpf) || typeof req.body?.is_principal !== "boolean") return res.status(400).json({ error: "Stay, CPF ou papel inválido." });
  if (req.body.situacao_hospede_id != null || req.body.pessoa_id != null) return res.status(400).json({ error: "Identidade e situação são confirmadas pelo servidor." });
  const personKey = crypto.createHash("sha256").update(cpf).digest("hex");
  const operationKey = `${stayId}:${personKey}`;
  if (fnrhAssistedCompleted.has(operationKey)) return res.status(409).json({ error: "Inclusão já confirmada. Atualize a lista oficial; não repita." });
  const keys = [`stay:${stayId}`, `cpf:${personKey}`];
  if (keys.some(key => fnrhAssistedUncertain.has(key))) return res.status(409).json({ error: "Há uma inclusão de resultado incerto. Confira a FNRH antes de nova tentativa; não reinicie o serviço para repetir." });
  if (keys.some(key => fnrhAssistedBusy.has(key))) return res.status(409).json({ error: "Já existe uma inclusão em andamento." });
  keys.forEach(key => fnrhAssistedBusy.add(key));
  try {
    const stay = await measureFnrhPhase("assisted_guest", "local_lookup", () => dbGetAsync("SELECT id, fnrh_reserva_id FROM stays WHERE id = ? AND property_id = ?", [stayId, PROPERTY_ID]));
    if (!stay || !isValidUuid(stay.fnrh_reserva_id)) throw assistedError("A stay precisa de uma reserva FNRH existente.", 409);
    const official = await fetchFnrhReservationGuests(stay.fnrh_reserva_id);
    const items = getFnrhOfficialCandidateItems(official.body) ||
      (official.body && typeof official.body === "object" && !Array.isArray(official.body) && Object.keys(official.body).length === 0 ? [] : null);
    if (!official.ok || !items) throw assistedError("Não foi possível conferir os hóspedes oficiais. Nenhuma inclusão iniciada.", 502);
    const candidates = items.map(normalizeFnrhOfficialCandidate);
    if (candidates.some(c => !c || !isValidUuid(c.hospedeId) || !isValidUuid(c.pessoaId) ||
        !["CPF", "PASSAPORTE"].includes(c.documentType) || !c.documentValue || /[*•]/.test(c.documentValue) ||
        (c.documentType === "CPF" && !isValidCPF(normalizeCPF(c.documentValue))))) throw assistedError("Lista oficial sem identificação suficiente para excluir duplicidade.", 409);
    const lookup = await measureFnrhPhase("assisted_guest", "person_lookup", () => lookupFnrhAssistedPerson(cpf));
    let pessoaId = lookup.pessoa_id || fnrhAssistedPeople.get(personKey);
    const birthDate = lookup.fields?.data_nascimento || (!pessoaId ? req.body.data_nascimento : null);
    const age = getFnrhAssistedAge(birthDate);
    if (age === null) throw assistedError("Não foi possível confirmar a idade. Confira a data de nascimento.");
    const responsibleId = normalizeFnrhUuid(req.body.responsavel_id);
    if (age < 18) {
      if (!isValidUuid(responsibleId)) throw assistedError("Selecione um responsável adulto da reserva.");
      const responsible = candidates.filter(c => c.hospedeId === responsibleId);
      const responsibleAge = responsible.length === 1 ? getFnrhAssistedAge(responsible[0].birthDate) : null;
      if (responsible.length !== 1 || responsibleAge === null || responsibleAge < 18 ||
          responsible[0].pessoaId === pessoaId || normalizeCPF(responsible[0].documentValue) === cpf) {
        throw assistedError("O responsável deve ser outro hóspede adulto vinculado a esta reserva.");
      }
    }
    const duplicateStarted = performance.now();
    try {
      if (lookup.pessoa_id && fnrhAssistedPeople.has(personKey) && lookup.pessoa_id !== fnrhAssistedPeople.get(personKey)) throw assistedError("Identidade divergente. Confira a pessoa na FNRH.", 409);
      if (candidates.some(c => (pessoaId && c.pessoaId === pessoaId) ||
          (c.documentType === "CPF" && normalizeCPF(c.documentValue) === cpf))) throw assistedError("Esta pessoa já está na reserva FNRH. Atualize a lista oficial.", 409);
      if (req.body.is_principal && items.some(item => Number(item.hospede?.responsavel_quarto) === 1 || Number(item.hospede?.is_principal) === 1)) throw assistedError("A reserva já possui titular. Selecione acompanhante.", 409);
    } finally {
      logFnrhTiming("assisted_guest", "duplicate_check", duplicateStarted);
    }
    if (!pessoaId) {
      const person = buildFnrhAssistedPerson({ ...req.body, data_nascimento: birthDate });
      const created = await requestFnrhAssisted("/pessoas", "POST", { pessoa: person });
      pessoaId = created?.pessoa_id;
      if (!isValidUuid(pessoaId)) throw Object.assign(assistedError("Criação de pessoa sem ID confirmado. Não repita a inclusão.", 502), { uncertain: true });
      fnrhAssistedPeople.set(personKey, pessoaId);
    }
    const responseMeta = {};
    const added = await requestFnrhAssisted(`/reservas/${encodeURIComponent(stay.fnrh_reserva_id)}/hospedes`, "POST", {
      pessoa_id: pessoaId, is_principal: req.body.is_principal, situacao_hospede_id: "PRECHECKIN_PENDENTE",
      ...(age < 18 ? { responsavel_id: responsibleId } : {})
    }, responseMeta);
    if (!isValidUuid(added?.hospede_id)) {
      console.log("[FNRH] fnrh_assisted_guest_uncertain_result", {
        stay_id: stayId, fnrh_reserva_id: stay.fnrh_reserva_id, pessoa_id: pessoaId,
        http_status: responseMeta.status, timestamp: new Date().toISOString()
      });
      throw Object.assign(assistedError("Inclusão sem ID confirmado. Consulte a lista antes de repetir.", 502), { uncertain: true });
    }
    fnrhAssistedCompleted.add(operationKey);
    console.log("[FNRH] fnrh_assisted_guest_created", {
      stay_id: stayId, fnrh_reserva_id: stay.fnrh_reserva_id,
      pessoa_id: pessoaId, hospede_id: added.hospede_id,
      situacao_hospede_id: "PRECHECKIN_PENDENTE", timestamp: new Date().toISOString()
    });
    return res.json({ pessoa_id: pessoaId, hospede_id: added.hospede_id, situacao_hospede_id: "PRECHECKIN_PENDENTE",
      message: "Hóspede incluído como pendente. Nenhum check-in ou importação foi realizado." });
  } catch (error) {
    if (error.uncertain) keys.forEach(key => fnrhAssistedUncertain.add(key));
    return res.status(error.status || 502).json({ error: error.status ? error.message : "Não foi possível concluir a operação. Confira a FNRH antes de repetir." });
  } finally { keys.forEach(key => fnrhAssistedBusy.delete(key)); }
});

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
    response = await timedFnrhFetch(finalUrl, {
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

  const text = await readFnrhResponse(response, "text");
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
  if (body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0) return [];
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
  console.log("[FNRH] guest operation:", {
    operation: "checkin",
    stage: "patch_mode",
    mode
  });

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        hospede_id: fnrhHospedeId,
        situacao_id: "CHECKIN_REALIZADO",
        data_hora: checkinAtIso
      },
      compatible: true
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

  console.log("[FNRH] guest operation:", {
    operation: "checkin",
    stage: "patch_request"
  });

  let response;

  try {
    response = await timedFnrhFetch(finalUrl, {
      method: "PATCH",
      headers: requestHeaders,
      body: checkinAtIso
    });
  } catch (networkError) {
    console.error("[FNRH] guest operation error:", {
      operation: "checkin",
      stage: "patch_network",
      status: null,
      code: String(networkError?.code || networkError?.name || "NETWORK_ERROR")
    });
    networkError.fnrhStatus = null;
    throw networkError;
  }

  let body;
  const text = await readFnrhResponse(response, "text");
  let compatible = true;

  try {
    body = JSON.parse(text);
  } catch {
    body = null;
    compatible = false;
  }

  console.log("[FNRH] guest operation:", {
    operation: "checkin",
    stage: "patch_response",
    status: response.status,
    compatible
  });

  return {
    ok: response.ok,
    status: response.status,
    body,
    compatible
  };
}

async function sendFnrhGuestCheckout(fnrhHospedeId, checkoutAtIso) {
  const mode = process.env.FNRH_MODE || "mock";
  console.log("[FNRH] guest operation:", {
    operation: "checkout",
    stage: "patch_mode",
    mode
  });

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      body: {
        mode: "mock",
        hospede_id: fnrhHospedeId,
        situacao_id: "CHECKOUT_REALIZADO",
        data_hora: checkoutAtIso
      },
      compatible: true
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

  console.log("[FNRH] guest operation:", {
    operation: "checkout",
    stage: "patch_request"
  });

  let response;

  try {
    response = await timedFnrhFetch(finalUrl, {
      method: "PATCH",
      headers: requestHeaders,
      body: checkoutAtIso
    });
  } catch (networkError) {
    console.error("[FNRH] guest operation error:", {
      operation: "checkout",
      stage: "patch_network",
      status: null,
      code: String(networkError?.code || networkError?.name || "NETWORK_ERROR")
    });
    networkError.fnrhStatus = null;
    throw networkError;
  }

  let body;
  const text = await readFnrhResponse(response, "text");
  let compatible = true;

  try {
    body = JSON.parse(text);
  } catch {
    body = null;
    compatible = false;
  }

  console.log("[FNRH] guest operation:", {
    operation: "checkout",
    stage: "patch_response",
    status: response.status,
    compatible
  });

  return {
    ok: response.ok,
    status: response.status,
    body,
    compatible
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

function normalizeFnrhOfficialSituation(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!code || code.length > 64 || !/^[A-Z][A-Z0-9_]*$/.test(code)) return null;
  return {
    code,
    isKnown: KNOWN_FNRH_GUEST_SITUATIONS.has(code)
  };
}

function createFnrhSituationSyncError(status, message, code, stage, fnrhStatus = null) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  error.code = code;
  error.stage = stage;
  error.fnrhStatus = fnrhStatus;
  return error;
}

async function persistFnrhSituationSyncUpdates(stayId, updates, syncedAt) {
  if (!updates.length) return;

  const transactionDb = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(db.filename, (error) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
  transactionDb.configure("busyTimeout", 5000);
  const runTransactionStatement = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      transactionDb.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve({ changes: this.changes });
      });
    });
  };
  let transactionStarted = false;

  try {
    await runTransactionStatement("BEGIN IMMEDIATE TRANSACTION");
    transactionStarted = true;
    for (const update of updates) {
      const result = await runTransactionStatement(
        `UPDATE guests
         SET fnrh_situacao_hospede_id = ?,
             fnrh_situacao_synced_at = ?
         WHERE id = ?
           AND stay_id = ?
           AND LOWER(TRIM(fnrh_hospede_id)) = ?`,
        [update.situationCode, syncedAt, update.guestId, stayId, update.fnrhHospedeId]
      );
      if (result.changes !== 1) {
        throw new Error("Guest local mudou durante a sincronizacao");
      }
    }
    await runTransactionStatement("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await runTransactionStatement("ROLLBACK");
      } catch (rollbackError) {
        console.error("[FNRH] situation sync error:", {
          stay_id: stayId,
          etapa: "rollback",
          status: null,
          code: "FNRH_SITUATION_SYNC_ROLLBACK_FAILED"
        });
      }
    }
    throw error;
  } finally {
    await new Promise((resolve) => transactionDb.close(() => resolve()));
  }
}

async function synchronizeFnrhGuestSituations(stayId) {
  const stay = await dbGetAsync(
    `SELECT id, fnrh_reserva_id
     FROM stays
     WHERE id = ? AND property_id = ?`,
    [stayId, PROPERTY_ID]
  );
  if (!stay) {
    throw createFnrhSituationSyncError(
      404,
      "Stay não encontrada",
      "FNRH_SITUATION_SYNC_STAY_NOT_FOUND",
      "validacao_local"
    );
  }

  const fnrhReservaId = String(stay.fnrh_reserva_id || "").trim();
  if (!fnrhReservaId) {
    throw createFnrhSituationSyncError(
      409,
      "Registre a reserva na FNRH antes de sincronizar as situações.",
      "FNRH_SITUATION_SYNC_RESERVATION_REQUIRED",
      "validacao_local"
    );
  }

  const localGuests = await dbAllAsync(
    `SELECT id, stay_id, fnrh_hospede_id, fnrh_situacao_hospede_id
     FROM guests
     WHERE stay_id = ?`,
    [stayId]
  );
  const validLocalGuests = localGuests.filter((guest) => {
    return isValidUuid(normalizeFnrhUuid(guest.fnrh_hospede_id));
  });
  const localGuestsByFnrhId = new Map();
  for (const guest of validLocalGuests) {
    const normalizedId = normalizeFnrhUuid(guest.fnrh_hospede_id);
    if (localGuestsByFnrhId.has(normalizedId)) {
      throw new Error("Identificador FNRH local duplicado");
    }
    localGuestsByFnrhId.set(normalizedId, guest);
  }

  let officialResult;
  try {
    officialResult = await fetchFnrhReservationGuests(fnrhReservaId);
  } catch (error) {
    throw createFnrhSituationSyncError(
      502,
      "Não foi possível sincronizar as situações dos hóspedes na FNRH.",
      "FNRH_SITUATION_SYNC_REQUEST_FAILED",
      "consulta_oficial",
      error?.fnrhStatus ?? null
    );
  }
  if (!officialResult.ok) {
    throw createFnrhSituationSyncError(
      502,
      "Não foi possível sincronizar as situações dos hóspedes na FNRH.",
      "FNRH_SITUATION_SYNC_HTTP_ERROR",
      "resposta_oficial",
      officialResult.status
    );
  }

  const officialItems = getFnrhOfficialCandidateItems(officialResult.body);
  if (!officialItems) {
    throw createFnrhSituationSyncError(
      502,
      "Não foi possível sincronizar as situações dos hóspedes na FNRH.",
      "FNRH_SITUATION_SYNC_INVALID_FORMAT",
      "formato_resposta",
      officialResult.status
    );
  }

  const normalized = normalizeUniqueFnrhOfficialCandidates(officialItems);
  if (normalized.hasConflict) {
    throw createFnrhSituationSyncError(
      502,
      "Não foi possível sincronizar as situações dos hóspedes na FNRH.",
      "FNRH_SITUATION_SYNC_OFFICIAL_CONFLICT",
      "deduplicacao",
      officialResult.status
    );
  }

  const officialIds = new Set(normalized.candidates.map((candidate) => candidate.hospedeId));
  const updates = [];
  let matchedTotal = 0;
  let updatedTotal = 0;
  let unchangedTotal = 0;
  let missingLocalTotal = 0;
  let unknownStatusTotal = 0;

  for (const candidate of normalized.candidates) {
    const localGuest = localGuestsByFnrhId.get(candidate.hospedeId);
    if (!localGuest) {
      missingLocalTotal += 1;
      continue;
    }
    matchedTotal += 1;

    const situation = normalizeFnrhOfficialSituation(candidate.situation);
    if (!situation) {
      unknownStatusTotal += 1;
      continue;
    }
    if (!situation.isKnown) {
      unknownStatusTotal += 1;
    }

    const previousCode = String(localGuest.fnrh_situacao_hospede_id || "").trim().toUpperCase();
    if (previousCode === situation.code) {
      unchangedTotal += 1;
    } else {
      updatedTotal += 1;
    }
    updates.push({
      guestId: localGuest.id,
      fnrhHospedeId: candidate.hospedeId,
      situationCode: situation.code
    });
  }

  const localOnlyTotal = Array.from(localGuestsByFnrhId.keys()).filter((id) => {
    return !officialIds.has(id);
  }).length;
  const syncedAt = new Date().toISOString();
  await persistFnrhSituationSyncUpdates(stayId, updates, syncedAt);

  const result = {
    success: true,
    stay_id: stayId,
    official_total: normalized.candidates.length,
    matched_total: matchedTotal,
    updated_total: updatedTotal,
    unchanged_total: unchangedTotal,
    missing_local_total: missingLocalTotal,
    local_only_total: localOnlyTotal,
    unknown_status_total: unknownStatusTotal,
    synced_at: syncedAt
  };
  console.log("[FNRH] situation sync response:", {
    stay_id: stayId,
    etapa: "concluido",
    status: officialResult.status,
    official_total: result.official_total,
    matched_total: result.matched_total,
    updated_total: result.updated_total,
    unchanged_total: result.unchanged_total,
    missing_local_total: result.missing_local_total,
    local_only_total: result.local_only_total,
    unknown_status_total: result.unknown_status_total,
    ignored_invalid_official_ids: normalized.invalidIdCount
  });
  return result;
}

app.post("/stays/:stayId/fnrh/sincronizar-situacoes", async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  if (!stayId) {
    return res.status(400).json({ error: "stayId deve ser um inteiro positivo" });
  }

  const requestBody = req.body;
  if (
    requestBody !== undefined &&
    (
      requestBody === null ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody) ||
      Object.keys(requestBody).length > 0
    )
  ) {
    return res.status(400).json({ error: "O corpo da sincronização deve ser vazio." });
  }

  const key = String(stayId);
  let operation = fnrhSituationSyncByStayId.get(key);
  if (!operation) {
    operation = synchronizeFnrhGuestSituations(stayId);
    fnrhSituationSyncByStayId.set(key, operation);
    operation.finally(() => {
      if (fnrhSituationSyncByStayId.get(key) === operation) {
        fnrhSituationSyncByStayId.delete(key);
      }
    }).catch(() => {});
  }

  try {
    const result = await operation;
    return res.json(result);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const message = error?.publicMessage ||
      "Não foi possível concluir a sincronização das situações dos hóspedes.";
    console.error("[FNRH] situation sync error:", {
      stay_id: stayId,
      etapa: error?.stage || "persistencia_local",
      status: error?.fnrhStatus ?? null,
      code: String(error?.code || "FNRH_SITUATION_SYNC_INTERNAL_ERROR")
    });
    return res.status(status).json({ error: message });
  }
});

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
        is_adult: getFnrhAssistedAge(candidate.birthDate) === null ? null : getFnrhAssistedAge(candidate.birthDate) >= 18,
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
  const ineligibleSituationMessage =
    "A situação oficial deste hóspede não permite importação para o painel.";
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
    const officialSituation = String(confirmedCandidate.situation || "").trim().toUpperCase();
    if (!["PRECHECKIN_PENDENTE", "PRECHECKIN_REALIZADO", "CHECKIN_REALIZADO"].includes(officialSituation)) {
      return res.status(409).json({ error: ineligibleSituationMessage });
    }
    if (!isFnrhCandidateOfficialDataValid(confirmedCandidate)) {
      return res.status(422).json({
        error: "Os dados oficiais do hóspede são insuficientes para criar o registro local."
      });
    }

    const cpf = getFnrhCandidateCpf(confirmedCandidate);
    const birthDate = normalizeOptionalFnrhDate(confirmedCandidate.birthDate);
    const pessoaId = String(confirmedCandidate.pessoaId || "").trim() || null;
    const situationSyncedAt = new Date().toISOString();

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
          fnrh_pessoa_id, fnrh_checkin_at, fnrh_checkout_at,
          fnrh_situacao_hospede_id, fnrh_situacao_synced_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
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
          officialSituation,
          situationSyncedAt,
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
      resultado: "created",
      situacao: officialSituation
    });
    return res.status(201).json({
      success: true,
      already_imported: false,
      official_status: officialSituation,
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
// BEGIN VIVAMAR LOCAL
// Rotas da Fase 1 sao locais e precisam de revisao antes de futura exposicao publica.
const VIVAMAR_PERSONAL_FIELDS = ["phone", "email", "postal_code", "street", "number", "complement", "neighborhood", "city", "state"];
const VIVAMAR_OPERATIONAL_FIELDS = ["vehicle_plate", "estimated_arrival", "notes"];
function vivamarError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function vivamarObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw vivamarError("Estrutura ou campo desconhecido na Ficha Viva Mar.");
  }
  return value;
}
function vivamarText(value, max = 160) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw vivamarError("Campo com tipo ou tamanho inválido.");
  return value.trim();
}
function vivamarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function vivamarClassification(birth, arrival) {
  // Regra operacional local na data de entrada; NAO representa regra oficial FNRH.
  if (!vivamarDate(birth) || !vivamarDate(arrival) || arrival < birth) return "PENDENTE";
  const years = Number(arrival.slice(0, 4)) - Number(birth.slice(0, 4)) - (arrival.slice(5) < birth.slice(5) ? 1 : 0);
  return years >= 18 ? "ADULTO" : "MENOR";
}
function vivamarNormalize(body) {
  vivamarObject(body, ["submission_key", "people"]);
  const key = value => {
    const text = vivamarText(value, 80);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(text)) throw vivamarError("Chave de submissão/pessoa inválida.");
    return text;
  };
  if (!Array.isArray(body.people) || body.people.length < 1 || body.people.length > 20) throw vivamarError("Informe de 1 a 20 pessoas.");
  const submissionKey = key(body.submission_key);
  const fields = ["client_person_key", "full_name", "birth_date", "document_type", "document_number", "nationality", "residence_country", "gender_id", "responsible_client_person_key", "personal_details", "operational_details"];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const people = body.people.map(input => {
    vivamarObject(input, fields);
    const fullName = vivamarText(input.full_name);
    const birth = vivamarText(input.birth_date, 10);
    if (!fullName || !vivamarDate(birth) || birth > today) throw vivamarError("Nome e data de nascimento real, não futura, são obrigatórios.");
    const type = vivamarText(input.document_type, 20).toUpperCase();
    let number = vivamarText(input.document_number, 80);
    if (!["", "CPF", "PASSAPORTE"].includes(type) || (!!type !== !!number)) throw vivamarError("Informe tipo e número do documento, ou deixe ambos vazios.");
    if (type === "CPF") {
      number = normalizeCPF(number);
      if (!isValidCPF(number)) throw vivamarError("CPF inválido.");
    }
    const country = value => {
      const code = vivamarText(value, 2).toUpperCase();
      if (code && !/^[A-Z]{2}$/.test(code)) throw vivamarError("País deve usar código de duas letras.");
      return code;
    };
    const gender = vivamarText(input.gender_id, 20);
    if (!["", "HOMEM", "MULHER", "OUTRO", "NAOINFORMADO"].includes(gender)) throw vivamarError("Gênero inválido.");
    const details = (value, allowed) => {
      const source = vivamarObject(value ?? {}, allowed);
      return Object.fromEntries(allowed.map(field => [field, vivamarText(source[field], field === "notes" ? 1000 : 160)]));
    };
    return { client_person_key: key(input.client_person_key), full_name: fullName, birth_date: birth,
      document_type: type, document_number: number, nationality: country(input.nationality), residence_country: country(input.residence_country), gender_id: gender,
      responsible_client_person_key: input.responsible_client_person_key ? key(input.responsible_client_person_key) : null,
      personal_details: details(input.personal_details, VIVAMAR_PERSONAL_FIELDS),
      operational_details: details(input.operational_details, VIVAMAR_OPERATIONAL_FIELDS) };
  });
  if (new Set(people.map(person => person.client_person_key)).size !== people.length) throw vivamarError("Chaves de pessoas repetidas.");
  return { submission_key: submissionKey, people };
}
function vivamarStoredPerson(row, rows) {
  return { client_person_key: row.client_person_key, full_name: row.full_name, birth_date: row.birth_date,
    document_type: row.document_type || "", document_number: row.document_number || "", nationality: row.nationality || "",
    residence_country: row.residence_country || "", gender_id: row.gender_id || "",
    responsible_client_person_key: rows.find(item => item.id === row.responsible_preregistro_id)?.client_person_key || null,
    personal_details: JSON.parse(row.personal_details_json), operational_details: JSON.parse(row.operational_details_json) };
}
function vivamarSummary(row, rows, stay) {
  const classification = vivamarClassification(row.birth_date, stay.data_entrada);
  const responsible = rows.find(item => item.id === row.responsible_preregistro_id);
  const validResponsible = responsible && responsible.submission_key === row.submission_key && vivamarClassification(responsible.birth_date, stay.data_entrada) === "ADULTO";
  return { id: row.id, stay_id: row.stay_id, full_name: row.full_name, classification,
    review_status: row.review_status, document_type: row.document_type || null,
    document_masked: row.document_number ? (row.document_number.length > 4 ? `***${row.document_number.slice(-2)}` : "***") : null,
    responsible_preregistro_id: row.responsible_preregistro_id, responsible_name: responsible?.full_name || null,
    responsavel_pendente: classification === "MENOR" && !validResponsible,
    vehicle_plate: JSON.parse(row.operational_details_json).vehicle_plate || null, created_at: row.created_at };
}
async function vivamarConnection() {
  const connection = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(db.filename, sqlite3.OPEN_READWRITE, error => error ? reject(error) : resolve(instance));
  });
  connection.configure("busyTimeout", 5000);
  return { all: (sql, params = []) => new Promise((resolve, reject) => connection.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))),
    run: (sql, params = []) => new Promise((resolve, reject) => connection.run(sql, params, function(error) { error ? reject(error) : resolve(this.lastID); })),
    close: () => new Promise(resolve => connection.close(resolve)) };
}
async function vivamarStay(connection, value) {
  const id = parsePositiveInteger(value);
  if (!id) throw vivamarError("Stay inválida.");
  const [stay] = await connection.all(`SELECT id, reservation_id, sub_reservation_id, data_entrada, data_saida,
    quantidade_hospede_adulto, quantidade_hospede_menor FROM stays WHERE id = ? AND property_id = ?`, [id, PROPERTY_ID]);
  if (!stay) throw vivamarError("Stay não encontrada.", 404);
  return stay;
}
function vivamarRoute(handler) {
  return async (req, res) => {
    let connection;
    try { connection = await vivamarConnection(); await handler(req, res, connection); }
    catch (error) {
      const conflict = error.code === "SQLITE_CONSTRAINT";
      res.status(conflict ? 409 : error.status || 500).json({ error: conflict ? "Documento ou submissão já registrado nesta stay." : error.status ? error.message : "Não foi possível acessar a Ficha Viva Mar." });
    } finally { if (connection) await connection.close(); }
  };
}
app.get("/stays/:stayId/ficha-vivamar/contexto", vivamarRoute(async (req, res, connection) => {
  const stay = await vivamarStay(connection, req.params.stayId);
  const { id, ...context } = stay;
  res.json({ stay_id: id, ...context });
}));
app.get("/stays/:stayId/ficha-vivamar", vivamarRoute(async (req, res, connection) => {
  const stay = await vivamarStay(connection, req.params.stayId);
  const rows = await connection.all("SELECT * FROM vivamar_preregistros WHERE stay_id = ? ORDER BY id", [stay.id]);
  res.json({ stay_id: stay.id, preregistros: rows.map(row => vivamarSummary(row, rows, stay)) });
}));
app.post("/stays/:stayId/ficha-vivamar", vivamarRoute(async (req, res, connection) => {
  if (Buffer.byteLength(JSON.stringify(req.body) || "") > 65536) throw vivamarError("Submissão excede 64 KB.", 413);
  const input = vivamarNormalize(req.body);
  let transaction = false;
  try {
    await connection.run("BEGIN IMMEDIATE TRANSACTION"); transaction = true;
    const stay = await vivamarStay(connection, req.params.stayId);
    for (const person of input.people) {
      if (!person.responsible_client_person_key) continue;
      const responsible = input.people.find(item => item.client_person_key === person.responsible_client_person_key);
      if (!responsible || responsible === person || vivamarClassification(responsible.birth_date, stay.data_entrada) !== "ADULTO" || vivamarClassification(person.birth_date, stay.data_entrada) !== "MENOR") {
        throw vivamarError("Responsável deve ser outro adulto da mesma submissão, associado a um menor.");
      }
    }
    let rows = await connection.all("SELECT * FROM vivamar_preregistros WHERE stay_id = ? AND submission_key = ? ORDER BY id", [stay.id, input.submission_key]);
    const repeated = rows.length > 0;
    if (repeated) {
      if (rows.length !== input.people.length || input.people.some(person => {
        const row = rows.find(item => item.client_person_key === person.client_person_key);
        return !row || JSON.stringify(person) !== JSON.stringify(vivamarStoredPerson(row, rows));
      })) throw vivamarError("Esta chave já foi recebida com conteúdo diferente. Nenhum dado foi sobrescrito.", 409);
    } else {
      const ids = new Map();
      const now = new Date().toISOString();
      for (const person of input.people) {
        const id = await connection.run(`INSERT INTO vivamar_preregistros
          (stay_id, submission_key, client_person_key, full_name, birth_date, document_type, document_number, nationality,
           residence_country, gender_id, personal_details_json, operational_details_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [stay.id, input.submission_key, person.client_person_key, person.full_name, person.birth_date,
            person.document_type || null, person.document_number || null, person.nationality, person.residence_country,
            person.gender_id, JSON.stringify(person.personal_details), JSON.stringify(person.operational_details), now, now]);
        ids.set(person.client_person_key, id);
      }
      for (const person of input.people) if (person.responsible_client_person_key) {
        await connection.run("UPDATE vivamar_preregistros SET responsible_preregistro_id = ? WHERE id = ? AND stay_id = ?",
          [ids.get(person.responsible_client_person_key), ids.get(person.client_person_key), stay.id]);
      }
      rows = await connection.all("SELECT * FROM vivamar_preregistros WHERE stay_id = ? AND submission_key = ? ORDER BY id", [stay.id, input.submission_key]);
    }
    await connection.run("COMMIT"); transaction = false;
    res.status(repeated ? 200 : 201).json({ submission_key: input.submission_key, repeated,
      preregistros: rows.map(row => vivamarSummary(row, rows, stay)) });
  } catch (error) {
    if (transaction) await connection.run("ROLLBACK");
    throw error;
  }
}));
// END VIVAMAR LOCAL

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

function createFnrhGuestOperationError(status, publicMessage, code, stage, fnrhStatus = null) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  error.code = code;
  error.stage = stage;
  error.fnrhStatus = fnrhStatus;
  return error;
}

async function loadFnrhGuestOperationContext(guestId) {
  const guest = await dbGetAsync(
    `SELECT guests.id, guests.stay_id, guests.fnrh_hospede_id,
            guests.fnrh_checkin_at, guests.fnrh_checkout_at,
            guests.fnrh_situacao_hospede_id, guests.fnrh_situacao_synced_at,
            stays.fnrh_reserva_id
     FROM guests
     INNER JOIN stays ON stays.id = guests.stay_id
     WHERE guests.id = ? AND stays.property_id = ?`,
    [guestId, PROPERTY_ID]
  );

  if (!guest) {
    throw createFnrhGuestOperationError(
      404,
      "Hóspede não encontrado",
      "FNRH_GUEST_OPERATION_NOT_FOUND",
      "validacao_local"
    );
  }

  const fnrhHospedeId = normalizeFnrhUuid(guest.fnrh_hospede_id);
  if (!isValidUuid(fnrhHospedeId)) {
    throw createFnrhGuestOperationError(
      400,
      "Hóspede sem identificador FNRH válido para esta operação.",
      "FNRH_GUEST_OPERATION_INVALID_GUEST_ID",
      "validacao_local"
    );
  }

  const fnrhReservaId = normalizeFnrhUuid(guest.fnrh_reserva_id);
  if (!isValidUuid(fnrhReservaId)) {
    throw createFnrhGuestOperationError(
      409,
      "A reserva local não possui identificador FNRH válido.",
      "FNRH_GUEST_OPERATION_INVALID_RESERVATION_ID",
      "validacao_local"
    );
  }

  return {
    guest: {
      id: guest.id,
      stay_id: guest.stay_id,
      fnrh_hospede_id: fnrhHospedeId,
      fnrh_checkin_at: guest.fnrh_checkin_at,
      fnrh_checkout_at: guest.fnrh_checkout_at,
      fnrh_situacao_hospede_id: guest.fnrh_situacao_hospede_id,
      fnrh_situacao_synced_at: guest.fnrh_situacao_synced_at
    },
    stay: {
      id: guest.stay_id,
      fnrh_reserva_id: fnrhReservaId
    }
  };
}

async function persistFnrhGuestOperationState(
  guest,
  { operation = null, operationalTimestamp = null, situationCode = null, syncedAt = null }
) {
  const assignments = [];
  const params = [];

  if (operation === "checkin" && operationalTimestamp) {
    assignments.push("fnrh_checkin_at = ?");
    params.push(operationalTimestamp);
  } else if (operation === "checkout" && operationalTimestamp) {
    assignments.push("fnrh_checkout_at = ?");
    params.push(operationalTimestamp);
  }

  if (situationCode && syncedAt) {
    assignments.push("fnrh_situacao_hospede_id = ?", "fnrh_situacao_synced_at = ?");
    params.push(situationCode, syncedAt);
  }

  if (!assignments.length) return;

  params.push(guest.id, guest.stay_id, guest.fnrh_hospede_id);
  const result = await dbRunAsync(
    `UPDATE guests
     SET ${assignments.join(", ")}
     WHERE id = ?
       AND stay_id = ?
       AND LOWER(TRIM(fnrh_hospede_id)) = ?`,
    params
  );
  if (result.changes !== 1) {
    throw new Error("Guest local mudou durante a operação FNRH");
  }
}

async function confirmOfficialSituationForLocalGuest(stay, guest, { persist = true } = {}) {
  const syncedAt = new Date().toISOString();
  let officialResult;

  try {
    officialResult = await fetchFnrhReservationGuests(stay.fnrh_reserva_id);
  } catch (error) {
    throw createFnrhGuestOperationError(
      502,
      "Não foi possível consultar a situação oficial na FNRH.",
      "FNRH_GUEST_OPERATION_OFFICIAL_REQUEST_FAILED",
      "consulta_oficial",
      error?.fnrhStatus ?? null
    );
  }

  if (!officialResult.ok) {
    throw createFnrhGuestOperationError(
      502,
      "Não foi possível consultar a situação oficial na FNRH.",
      "FNRH_GUEST_OPERATION_OFFICIAL_HTTP_ERROR",
      "resposta_oficial",
      officialResult.status
    );
  }

  const officialItems = getFnrhOfficialCandidateItems(officialResult.body);
  if (!officialItems) {
    throw createFnrhGuestOperationError(
      502,
      "A FNRH retornou um formato incompatível para a consulta oficial.",
      "FNRH_GUEST_OPERATION_OFFICIAL_INVALID_FORMAT",
      "formato_resposta",
      officialResult.status
    );
  }

  const matches = officialItems
    .map(normalizeFnrhOfficialCandidate)
    .filter((candidate) => {
      return normalizeFnrhUuid(candidate?.hospedeId) === guest.fnrh_hospede_id;
    });

  if (matches.length > 1) {
    throw createFnrhGuestOperationError(
      502,
      "A FNRH retornou identificadores conflitantes para o hóspede.",
      "FNRH_GUEST_OPERATION_OFFICIAL_DUPLICATE",
      "correspondencia_oficial",
      officialResult.status
    );
  }
  if (matches.length !== 1) {
    throw createFnrhGuestOperationError(
      409,
      "O hóspede não foi encontrado de forma única na reserva oficial.",
      "FNRH_GUEST_OPERATION_OFFICIAL_GUEST_NOT_FOUND",
      "correspondencia_oficial",
      officialResult.status
    );
  }

  const situation = normalizeFnrhOfficialSituation(matches[0].situation);
  if (!situation) {
    throw createFnrhGuestOperationError(
      409,
      "Atualize a situação oficial antes de realizar esta operação.",
      "FNRH_GUEST_OPERATION_OFFICIAL_SITUATION_INVALID",
      "situacao_oficial",
      officialResult.status
    );
  }

  if (persist) {
    await persistFnrhGuestOperationState(guest, {
      situationCode: situation.code,
      syncedAt
    });
  }

  return {
    code: situation.code,
    isKnown: situation.isKnown,
    syncedAt,
    httpStatus: officialResult.status
  };
}

function logFnrhGuestOperationError(guestId, stayId, operation, error) {
  console.error("[FNRH] guest operation error:", {
    guest_id: guestId,
    stay_id: stayId ?? null,
    operation,
    stage: error?.stage || "processamento",
    status: error?.fnrhStatus ?? null,
    code: String(error?.code || "FNRH_GUEST_OPERATION_INTERNAL_ERROR")
  });
}

function sendFnrhGuestOperationFailure(res, guestId, stayId, operation, error) {
  logFnrhGuestOperationError(guestId, stayId, operation, error);
  const status = Number(error?.status) || 500;
  const message = error?.publicMessage ||
    "Não foi possível concluir a operação FNRH.";
  return res.status(status).json({
    error: message,
    guest_id: guestId
  });
}

function sendFnrhAlreadyConfirmed(res, guest, operation, officialStatus) {
  return res.json({
    success: true,
    already_confirmed: true,
    performed_by_system: false,
    official_status: officialStatus,
    guest_id: guest.id,
    message: operation === "checkin"
      ? "Check-in já confirmado na FNRH."
      : "Checkout já confirmado na FNRH."
  });
}

function getFnrhOperationalTimestampField(operation) {
  return operation === "checkin" ? "checkin_at" : "checkout_at";
}

function getFnrhGuestOperationOfficialErrorMessage(patchResult, patchError) {
  const responseBody = patchResult?.body || patchError?.fnrhBody || null;
  const candidates = [
    responseBody?.error?.message,
    responseBody?.error,
    responseBody?.message,
    responseBody?.mensagem
  ];
  const message = candidates.find((candidate) => {
    return typeof candidate === "string" && candidate.trim();
  });
  return message ? message.trim() : null;
}

function getFnrhPropertyTimeParts(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FNRH_PROPERTY_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function getFnrhPropertyUtcOffset(timestamp) {
  const parts = getFnrhPropertyTimeParts(timestamp);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

function convertFnrhLocalDateTimeToUtc(value) {
  if (typeof value !== "string") {
    throw new Error("data_hora_local deve ser uma data e hora válida.");
  }

  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    throw new Error("data_hora_local deve usar o formato AAAA-MM-DDTHH:mm.");
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const expected = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: 0
  };
  const localAsUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    0
  );
  const roundTrip = new Date(localAsUtc);
  if (
    roundTrip.getUTCFullYear() !== expected.year ||
    roundTrip.getUTCMonth() + 1 !== expected.month ||
    roundTrip.getUTCDate() !== expected.day ||
    roundTrip.getUTCHours() !== expected.hour ||
    roundTrip.getUTCMinutes() !== expected.minute
  ) {
    throw new Error("data_hora_local deve representar uma data e hora válida.");
  }

  let timestamp = localAsUtc - getFnrhPropertyUtcOffset(localAsUtc);
  timestamp = localAsUtc - getFnrhPropertyUtcOffset(timestamp);
  const convertedParts = getFnrhPropertyTimeParts(timestamp);
  if (Object.entries(expected).some(([key, expectedValue]) => convertedParts[key] !== expectedValue)) {
    throw new Error(`data_hora_local não é válida no fuso ${FNRH_PROPERTY_TIME_ZONE}.`);
  }

  return new Date(timestamp).toISOString();
}

function getOptionalFnrhOperationTimestamp(requestBody) {
  if (
    !requestBody ||
    typeof requestBody !== "object" ||
    Array.isArray(requestBody) ||
    !Object.prototype.hasOwnProperty.call(requestBody, "data_hora_local")
  ) {
    return null;
  }

  const timestamp = convertFnrhLocalDateTimeToUtc(requestBody.data_hora_local);
  if (Date.parse(timestamp) > Date.now() + FNRH_MANUAL_FUTURE_TOLERANCE_MS) {
    throw new Error("data_hora_local não pode estar mais de 5 minutos no futuro.");
  }
  return timestamp;
}

async function executeFnrhGuestOperation(guestId, operation, res, requestedTimestamp = null) {
  let context;
  try {
    context = await measureFnrhPhase(operation, "local_lookup", () => loadFnrhGuestOperationContext(guestId));
  } catch (error) {
    return sendFnrhGuestOperationFailure(res, guestId, null, operation, error);
  }

  const { guest, stay } = context;
  let officialBefore;
  try {
    officialBefore = await measureFnrhPhase(operation, "revalidate_get", () => confirmOfficialSituationForLocalGuest(stay, guest));
  } catch (error) {
    return sendFnrhGuestOperationFailure(res, guest.id, stay.id, operation, error);
  }

  if (operation === "checkin") {
    if (officialBefore.code === "CHECKIN_REALIZADO") {
      return sendFnrhAlreadyConfirmed(res, guest, operation, officialBefore.code);
    }
    if (officialBefore.code === "CHECKOUT_REALIZADO") {
      return res.status(409).json({
        error: "O checkout deste hóspede já está confirmado na FNRH.",
        guest_id: guest.id
      });
    }
    if (String(guest.fnrh_checkin_at || "").trim()) {
      return res.status(409).json({
        error: "O registro local de check-in diverge da situação oficial. Atualize ou confira a situação antes de tentar novamente.",
        guest_id: guest.id
      });
    }
    if (
      officialBefore.code === "PRECHECKIN_NAOVINCULADO"
    ) {
      return res.status(409).json({
        error: "O pré-check-in oficial ainda não está realizado para este hóspede.",
        guest_id: guest.id
      });
    }
    if (
      !["PRECHECKIN_PENDENTE", "PRECHECKIN_REALIZADO"].includes(officialBefore.code) ||
      !officialBefore.isKnown
    ) {
      return res.status(409).json({
        error: "Atualize a situação oficial antes de realizar o check-in.",
        guest_id: guest.id
      });
    }
  } else {
    if (officialBefore.code === "CHECKOUT_REALIZADO") {
      return sendFnrhAlreadyConfirmed(res, guest, operation, officialBefore.code);
    }
    if (String(guest.fnrh_checkout_at || "").trim()) {
      return res.status(409).json({
        error: "O registro local de checkout diverge da situação oficial. Atualize ou confira a situação antes de tentar novamente.",
        guest_id: guest.id
      });
    }
    if (
      officialBefore.code === "PRECHECKIN_REALIZADO" ||
      officialBefore.code === "PRECHECKIN_PENDENTE" ||
      officialBefore.code === "PRECHECKIN_NAOVINCULADO"
    ) {
      return res.status(409).json({
        error: "O check-in oficial ainda não está confirmado para este hóspede.",
        guest_id: guest.id
      });
    }
    if (
      officialBefore.code !== "CHECKIN_REALIZADO" ||
      !officialBefore.isKnown
    ) {
      return res.status(409).json({
        error: "Atualize a situação oficial antes de realizar o checkout.",
        guest_id: guest.id
      });
    }
  }

  const operationTimestamp = requestedTimestamp || new Date().toISOString();
  const expectedSituation = operation === "checkin"
    ? "CHECKIN_REALIZADO"
    : "CHECKOUT_REALIZADO";
  const sendPatch = operation === "checkin"
    ? sendFnrhGuestCheckin
    : sendFnrhGuestCheckout;
  let patchResult;
  let patchError = null;

  try {
    patchResult = await measureFnrhPhase(operation, "patch", () => sendPatch(guest.fnrh_hospede_id, operationTimestamp));
  } catch (error) {
    patchError = error;
  }

  if (patchResult?.ok && patchResult.compatible !== false) {
    let officialAfter = null;
    try {
      officialAfter = await measureFnrhPhase(operation, "reconcile_get", () => confirmOfficialSituationForLocalGuest(stay, guest, { persist: false }));
    } catch (error) {
      logFnrhGuestOperationError(guest.id, stay.id, operation, error);
    }

    try {
      if (officialAfter?.code === expectedSituation) {
        await persistFnrhGuestOperationState(guest, {
          operation,
          operationalTimestamp: operationTimestamp,
          situationCode: officialAfter.code,
          syncedAt: officialAfter.syncedAt
        });
      } else {
        await persistFnrhGuestOperationState(guest, {
          operation,
          operationalTimestamp: operationTimestamp
        });
      }
    } catch (error) {
      error.publicMessage =
        "A FNRH confirmou a operação, mas não foi possível persistir o resultado local.";
      error.code = "FNRH_GUEST_OPERATION_PERSIST_FAILED";
      error.stage = "persistencia_local";
      return sendFnrhGuestOperationFailure(res, guest.id, stay.id, operation, error);
    }

    const timestampField = getFnrhOperationalTimestampField(operation);
    if (officialAfter?.code === expectedSituation) {
      return res.json({
        success: true,
        already_confirmed: false,
        performed_by_system: true,
        official_status_confirmed: true,
        guest_id: guest.id,
        [timestampField]: operationTimestamp,
        response_status: patchResult.status,
        message: operation === "checkin"
          ? "Check-in FNRH realizado com sucesso"
          : "Checkout FNRH realizado com sucesso"
      });
    }

    return res.json({
      success: true,
      already_confirmed: false,
      performed_by_system: true,
      official_status_confirmed: false,
      status_sync_pending: true,
      guest_id: guest.id,
      [timestampField]: operationTimestamp,
      response_status: patchResult.status,
      message: operation === "checkin"
        ? "Check-in aceito pela FNRH; confirmação oficial pendente."
        : "Checkout aceito pela FNRH; confirmação oficial pendente."
    });
  }

  let recoverySituation = null;
  try {
    recoverySituation = await measureFnrhPhase(operation, "reconcile_get", () => confirmOfficialSituationForLocalGuest(stay, guest, { persist: false }));
  } catch (error) {
    logFnrhGuestOperationError(guest.id, stay.id, operation, error);
  }

  if (recoverySituation?.code === expectedSituation) {
    try {
      await persistFnrhGuestOperationState(guest, {
        operation,
        operationalTimestamp: operationTimestamp,
        situationCode: recoverySituation.code,
        syncedAt: recoverySituation.syncedAt
      });
    } catch (error) {
      error.publicMessage =
        "A operação foi confirmada na FNRH, mas não foi possível persistir o resultado local.";
      error.code = "FNRH_GUEST_OPERATION_RECOVERY_PERSIST_FAILED";
      error.stage = "persistencia_local";
      return sendFnrhGuestOperationFailure(res, guest.id, stay.id, operation, error);
    }

    return res.json({
      success: true,
      recovered_after_uncertain_patch: true,
      performed_by_system: true,
      official_status_confirmed: true,
      guest_id: guest.id,
      [getFnrhOperationalTimestampField(operation)]: operationTimestamp,
      response_status: patchResult?.status ?? patchError?.fnrhStatus ?? null
    });
  }

  if (recoverySituation) {
    try {
      await persistFnrhGuestOperationState(guest, {
        situationCode: recoverySituation.code,
        syncedAt: recoverySituation.syncedAt
      });
    } catch (error) {
      error.publicMessage = "Não foi possível persistir a situação oficial consultada.";
      error.code = "FNRH_GUEST_OPERATION_RECOVERY_STATUS_PERSIST_FAILED";
      error.stage = "persistencia_local";
      return sendFnrhGuestOperationFailure(res, guest.id, stay.id, operation, error);
    }
  }

  const officialErrorMessage = getFnrhGuestOperationOfficialErrorMessage(patchResult, patchError);
  return res.status(502).json({
    error: officialErrorMessage ||
      "Não foi possível confirmar o resultado na FNRH. Atualize a situação antes de tentar novamente.",
    guest_id: guest.id
  });
}

function registerFnrhGuestOperationRoute(path, operation) {
  app.post(path, async (req, res) => {
    const guestId = parsePositiveInteger(req.params.id);
    if (!guestId) {
      return res.status(400).json({ error: "id do hóspede deve ser um inteiro positivo" });
    }

    let requestedTimestamp;
    try {
      requestedTimestamp = getOptionalFnrhOperationTimestamp(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const key = String(guestId);
    if (fnrhGuestOperationByGuestId.has(key)) {
      return res.status(409).json({
        error: "Já existe uma operação FNRH em andamento para este hóspede."
      });
    }

    const operationToken = {};
    fnrhGuestOperationByGuestId.set(key, operationToken);
    try {
      return await executeFnrhGuestOperation(guestId, operation, res, requestedTimestamp);
    } finally {
      if (fnrhGuestOperationByGuestId.get(key) === operationToken) {
        fnrhGuestOperationByGuestId.delete(key);
      }
    }
  });
}

registerFnrhGuestOperationRoute("/guests/:id/fnrh-checkin", "checkin");
registerFnrhGuestOperationRoute("/guests/:id/fnrh-checkout", "checkout");

if (false) {
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
}

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

async function findFnrhReservationByCode(code) {
  let candidate = null;
  let expectedTotal = null;
  let expectedPages = null;
  let expectedSize = null;
  let received = 0;
  const seen = new Set();
  // Public API v2: pagination is one-based. Unknown/inconsistent shapes fail closed.
  for (let page = 1; page <= 100; page += 1) {
    const body = await requestFnrhAssisted(`/reservas?page_number=${page}&codigo_reserva=${encodeURIComponent(code)}`, "GET");
    const meta = body?.pagination;
    const items = body?.dados;
    if (!Array.isArray(items) || !meta ||
        ![meta.PaginaAtual, meta.TotalPaginas, meta.TotalRegistros, meta.TamanhoPagina].every(Number.isSafeInteger) ||
        meta.PaginaAtual !== page || meta.TotalRegistros < 0 || meta.TotalPaginas < 0 || meta.TamanhoPagina < 1 ||
        meta.TotalPaginas !== Math.max(meta.TotalPaginas === 0 ? 0 : 1, Math.ceil(meta.TotalRegistros / meta.TamanhoPagina))) {
      throw assistedError("Resposta de busca FNRH incompleta ou paginação inválida. Nenhum vínculo salvo.", 502);
    }
    if (page === 1) {
      expectedTotal = meta.TotalRegistros;
      expectedPages = meta.TotalPaginas;
      expectedSize = meta.TamanhoPagina;
    }
    if (meta.TotalRegistros !== expectedTotal || meta.TotalPaginas !== expectedPages || meta.TamanhoPagina !== expectedSize ||
        items.length !== Math.min(expectedSize, Math.max(0, expectedTotal - received))) {
      throw assistedError("A listagem FNRH mudou ou está incompleta. Nenhum vínculo salvo.", 502);
    }
    for (const item of items) {
      const id = normalizeFnrhUuid(item?.reserva_id);
      if (!isValidUuid(id) || typeof item?.numero_reserva !== "string" || !item.numero_reserva.trim() || seen.has(id)) {
        throw assistedError("Resultado FNRH ambíguo ou incompleto. Nenhum vínculo salvo.", 502);
      }
      seen.add(id);
      if (item.numero_reserva === code) {
        if (candidate) throw assistedError("Mais de uma reserva FNRH corresponde ao código comercial.", 409);
        candidate = id;
      }
    }
    received += items.length;
    if (page >= expectedPages) {
      if (received !== expectedTotal) throw assistedError("Listagem FNRH incompleta. Nenhum vínculo salvo.", 502);
      if (!candidate) throw assistedError("Reserva não encontrada na FNRH para este código comercial.", 404);
      return candidate;
    }
  }
  throw assistedError("Não foi possível concluir a paginação FNRH. Nenhum vínculo salvo.", 502);
}

async function linkExistingFnrhReservation(stayId) {
  const stay = await dbGetAsync("SELECT id, reservation_id, data_entrada, data_saida, fnrh_reserva_id FROM stays WHERE id = ? AND property_id = ?", [stayId, PROPERTY_ID]);
  if (!stay) throw assistedError("Stay não encontrada.", 404);
  const code = String(stay.reservation_id || "");
  if (!code.trim() || code !== code.trim() || code.length > 200 || /[\x00-\x1f\x7f]/.test(code)) {
    throw assistedError("A stay precisa de um código comercial válido.", 422);
  }
  const id = await measureFnrhPhase("link_existing_reservation", "search", () => findFnrhReservationByCode(code));
  const existing = String(stay.fnrh_reserva_id || "").trim();
  if (existing && normalizeFnrhUuid(existing) !== id) throw assistedError("Esta stay já está vinculada a outra reserva FNRH.", 409);
  const body = await measureFnrhPhase("link_existing_reservation", "detail", () => requestFnrhAssisted(`/reservas/${encodeURIComponent(id)}`, "GET"));
  const detail = body?.reserva;
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!detail || normalizeFnrhUuid(detail.reserva_id) !== id || detail.numero_reserva !== code ||
      !validDate(detail.data_entrada) || !validDate(detail.data_saida) || detail.data_saida < detail.data_entrada ||
      detail.data_entrada !== String(stay.data_entrada || "").slice(0, 10) ||
      detail.data_saida !== String(stay.data_saida || "").slice(0, 10)) {
    throw assistedError("Os dados da reserva oficial não correspondem à stay. Nenhum vínculo salvo.", 409);
  }
  let link = null;
  try {
    const url = new URL(detail.link_precheckin);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
        ["fnrh.turismo.serpro.gov.br", "fnrh.turismo.gov.br"].includes(url.hostname)) link = url.href;
  } catch { /* An absent/invalid optional link does not prevent a verified ID link. */ }
  const conflict = await dbGetAsync("SELECT id FROM stays WHERE LOWER(TRIM(fnrh_reserva_id)) = ? AND id <> ?", [id, stayId]);
  if (conflict) throw assistedError("Esta reserva FNRH já está vinculada a outra stay.", 409);
  // One atomic statement rechecks both local identity and uniqueness; no guest writes.
  const saved = await dbRunAsync(`UPDATE stays
    SET fnrh_reserva_id = ?, fnrh_link_precheckin_oficial = COALESCE(?, fnrh_link_precheckin_oficial)
    WHERE id = ? AND property_id = ? AND reservation_id = ? AND data_entrada = ? AND data_saida = ?
      AND (TRIM(COALESCE(fnrh_reserva_id, '')) = '' OR LOWER(TRIM(fnrh_reserva_id)) = ?)
      AND NOT EXISTS (SELECT 1 FROM stays other WHERE other.id <> ? AND LOWER(TRIM(other.fnrh_reserva_id)) = ?)`,
    [id, link, stayId, PROPERTY_ID, code, stay.data_entrada, stay.data_saida, id, stayId, id]);
  if (saved.changes !== 1) throw assistedError("O vínculo local mudou ou conflita com outra stay. Atualize o painel.", 409);
  return { message: "Reserva FNRH vinculada ao painel.", stay_id: stayId, fnrh_reserva_id: id };
}

app.post("/stays/:stayId/fnrh/vincular-reserva-existente", async (req, res) => {
  const stayId = parsePositiveInteger(req.params.stayId);
  if (!stayId) return res.status(400).json({ error: "stayId inválido." });
  try {
    return res.json(await linkExistingFnrhReservation(stayId));
  } catch (error) {
    const status = [404, 409, 422].includes(error?.status) ? error.status : 502;
    return res.status(status).json({ error: status === 502
      ? "Não foi possível concluir a consulta ou confirmar o vínculo. Atualize o painel para verificar o estado antes de tentar novamente."
      : error.message });
  }
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

