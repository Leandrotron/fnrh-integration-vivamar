# FNRH Integration Notes — Viva Mar

## 📌 Contexto

Integração do sistema de pré-check-in com a API da FNRH Digital (Ministério do Turismo).

Backend:
- Node.js + Express
- SQLite
- Modelo: stays + guests

Nota tecnica 2026-04-24:
- O endpoint individual de check-out real foi validado via `POST /guests/:id/fnrh-checkout`.
- A FNRH aceitou `PATCH /hospedes/{hospede_id}/checkout` com body `text/plain` em timestamp ISO 8601.
- Retorno de sucesso observado: `situacao_id = CHECKOUT_REALIZADO`.
- `GET /hospedes/pre-checkins` nao deve ser tratado, neste momento, como fonte confiavel de status operacional porque retornou `{}` em testes reais.
- `quantidade_hospede_adulto` e `quantidade_hospede_menor` controlam a capacidade do formulario oficial da FNRH.
- O suporte inicial a quantidade foi iniciado sem alteracao de schema e ainda precisa de validacao real controlada.

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
