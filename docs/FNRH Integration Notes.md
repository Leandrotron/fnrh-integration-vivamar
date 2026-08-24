# FNRH Integration Notes — Viva Mar

## 📌 Contexto

Integração do sistema de pré-check-in com a API da FNRH Digital (Ministério do Turismo).

Backend:
- Node.js + Express
- SQLite
- Modelo: stays + guests

Nota operacional 2026-08-24:
- A interface principal continua em `frontend/reservas.html` e foi reorganizada sem alterar backend, banco, endpoints ou payloads FNRH.
- Ações de consulta, atualização de situações, diagnóstico, importação e vínculo foram separadas visualmente conforme seus efeitos reais.
- A consulta de hóspedes oficiais permanece uma leitura; atualizar situações persiste estados apenas no painel; diagnóstico permanece leitura técnica.
- Importar hóspede oficial já pertencente à reserva é diferente de vincular uma ficha `PRECHECKIN_NAOVINCULADO`.
- A hipótese de localizar ficha avulsa por CPF/passaporte ainda não foi implementada.
- O código prevê `tipo_documento` e `numero_documento`, mas ainda falta uma resposta real controlada que prove CPF completo no GET de fichas não vinculadas.
- O teste necessário está descrito em `docs/RESERVAS_UX_AND_UNLINKED_FNRH_AUDIT.md` e não deve ser executado incidentalmente.

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
```

---

## Nota operacional 2026-04-25

### Dois modos validados

- Modo 1: reserva sem hóspede
  - cria a reserva
  - retorna `link_precheckin`
  - acelera a operação da recepção
- Modo 2: reserva com hóspede no payload
  - envia `dados_hospede`
  - permite receber `fnrh_hospede_id`
  - libera controle de check-in/check-out pelo sistema

### Descoberta crítica de produto

- `1 link oficial != múltiplos hóspedes estruturados`
- O link pode ser reutilizado, mas isso não garante que a FNRH devolva uma estrutura de grupo equivalente à quantidade informada.
- Na prática, cada hóspede preenche individualmente no portal oficial.
- `quantidade_hospede_adulto` e `quantidade_hospede_menor` devem ser tratados como dados informativos/contextuais, não como garantia de vínculo estruturado.

### Regras operacionais observadas

- Quando `dados_hospede = []`, a FNRH aceita criar a reserva e devolver o link oficial.
- Quando há `dados_hospede`, `logradouro` é obrigatório.
- No fluxo com hóspede, os campos mínimos funcionais observados foram:
  - nome completo
  - CPF
  - data de nascimento
  - CEP
  - logradouro
  - `cidade_id`
  - `estado_id`
- `GET /hospedes/pre-checkins` não deve ser usado como fonte confiável de status operacional.

### Conclusão prática

- Fluxo sem hóspede = velocidade para geração do link oficial.
- Fluxo com hóspede = controle real para recepção, especialmente quando o objetivo é operar check-in/check-out pelo painel.
