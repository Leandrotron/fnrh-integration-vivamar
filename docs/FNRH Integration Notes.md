# FNRH Integration Notes — Viva Mar

## 📌 Contexto

Integração do sistema de pré-check-in com a API da FNRH Digital (Ministério do Turismo).

Backend:
- Node.js + Express
- SQLite
- Modelo: stays + guests

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