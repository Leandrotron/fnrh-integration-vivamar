# FNRH Integration Notes — Viva Mar

## 📌 Contexto

Integração do sistema de pré-check-in com a API da FNRH Digital (Ministério do Turismo).

Backend:
- Node.js + Express
- SQLite
- Modelo: stays + guests

Nota tecnica 2026-04-23:
- O endpoint individual de check-in real foi validado via `POST /guests/:id/fnrh-checkin`.
- A FNRH aceitou `PATCH /hospedes/{hospede_id}/checkin` com body `text/plain` em timestamp ISO 8601.
- Retorno de sucesso observado: `situacao_id = CHECKIN_REALIZADO`.

Status atual:
- Integração real funcionando
- Reserva sendo criada com sucesso
- Hóspedes ainda não sendo processados completamente

---

## 🔐 Autenticação

### Tipo:
HTTP Basic Auth

### Header:
Authorization: Basic base64(USER:API_KEY)

### Header adicional obrigatório:
cpf_solicitante: <CPF do responsável>

---

## 🌐 Endpoint principal

POST /hospedagem/registrar

Base URL:
https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2

---

## 🧱 Estrutura geral do payload

```json
{
  "reserva": {},
  "dados_hospede": []
}
