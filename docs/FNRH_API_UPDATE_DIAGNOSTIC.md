# Diagnostico de update da API FNRH

Data do diagnostico: 2026-07-08

## Escopo

Diagnostico seguro apos pausa de aproximadamente 1 mes. Nenhum fluxo funcional foi alterado. Nao houve envio real para FNRH, chamada autenticada, alteracao de banco, payload, endpoints locais, check-in ou check-out.

## Fontes consultadas

- Codigo local: `backend/server.js`, `backend/database/db.js`, `frontend/reservas.html`, `README.md`, `DEV_LOG.md`, `docs/FNRH Integration Notes.md`.
- Documentacao oficial MTur/FNRH:
  - Pagina "Meios de Hospedagem com PMS", atualizada em 23/06/2026.
  - API Versao 2.4, documento de 19/06/2026.
  - Changelog API 2.4.
  - API Versao 2.3 e changelog localmente ja referenciados em `deep-research-report.md`.

## Estado atual do projeto

### Base URL e endpoint principal

O backend monta a URL final de envio com:

- `FNRH_BASE_URL`
- `FNRH_SUBMIT_PATH`

Documentacao local indica:

- Base de producao: `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2`
- Endpoint principal: `POST /hospedagem/registrar`

O codigo atual continua compativel com `/rest/v2`, desde que o `.env` esteja configurado assim. O arquivo `.env.example` nao fixa valores.

### Autenticacao

O envio real usa:

- `Authorization: Basic base64(FNRH_USER:FNRH_API_KEY)`
- `cpf_solicitante: FNRH_CPF_SOLICITANTE`
- `Content-Type: application/json` para registro de hospedagem

Isso esta alinhado com a documentacao v2.4 para `POST /hospedagem/registrar`.

### Payload atual de reserva

O payload atual envia:

```json
{
  "reserva": {
    "numero_reserva": "...",
    "data_entrada": "...",
    "data_saida": "...",
    "origem_reserva_id": "MEIOHOSPEDAGEM",
    "quantidade_hospede_adulto": 1,
    "quantidade_hospede_menor": 0
  },
  "dados_hospede": []
}
```

Quando ha hospedes, cada item inclui:

- `is_principal`
- `situacao_hospede`: fixo em `PRECHECKIN_PENDENTE`
- `dados_pessoais.nome`
- `dados_pessoais.nome_social`: `""`
- `dados_pessoais.data_nascimento`, se houver
- `dados_pessoais.genero_id`, fallback `HOMEM`
- `dados_pessoais.raca_id`, fallback `NAOINFORMAR`
- `dados_pessoais.deficiencia_id`, fallback `NAO`
- `dados_pessoais.tipo_deficiencia_id`: `""`
- `dados_pessoais.PaisNacionalidade_id`: fixo `BR`
- `dados_pessoais.documento_id.numero_documento`, se houver CPF
- `dados_pessoais.documento_id.tipo_documento_id`: `CPF`
- `dados_pessoais.contato.email`, se houver
- `dados_pessoais.contato.telefone`, se houver
- `dados_pessoais.contato.cidade_id`, se houver
- `dados_pessoais.contato.estado_id`, se houver
- `dados_pessoais.contato.cep`, se houver
- `dados_pessoais.contato.logradouro`, se houver
- `dados_pessoais.contato.numero`, se houver
- `dados_pessoais.contato.complemento`, se houver
- `dados_pessoais.contato.bairro`, se houver
- `dados_pessoais.contato.PaisResidencia_id`: fixo `BR`

### Campos hardcoded relevantes

- `PROPERTY_ID = "vivamar"`
- `origem_reserva_id = "MEIOHOSPEDAGEM"`
- `situacao_hospede = "PRECHECKIN_PENDENTE"`
- fallbacks de hospede: `genero_id = "HOMEM"`, `raca_id = "NAOINFORMAR"`, `deficiencia_id = "NAO"`
- `PaisNacionalidade_id = "BR"`
- `PaisResidencia_id = "BR"`
- `tipo_documento_id = "CPF"`
- `useMinimalPayload = false`

### Persistencia do retorno

O backend le:

- `result.body?.dados?.reserva?.reserva_id`
- `result.body?.dados?.reserva?.link_precheckin`
- `result.body?.dados?.dados_hospedes`

E persiste:

- `stays.fnrh_reserva_id`
- `stays.fnrh_link_precheckin_oficial`
- `guests.fnrh_hospede_id`
- `guests.fnrh_pessoa_id`
- metadados locais de ultimo envio em `stays.fnrh_last_*`

O frontend le somente `fnrh_link_precheckin_oficial` para copiar link, abrir link e gerar QR Code.

### Check-in e check-out atuais

O sistema possui endpoints locais:

- `POST /guests/:id/fnrh-checkin`
- `POST /guests/:id/fnrh-checkout`

Eles dependem de `guests.fnrh_hospede_id`.

Chamadas FNRH usadas:

- `PATCH /hospedes/{hospede_id}/checkin`
- `PATCH /hospedes/{hospede_id}/checkout`

Body:

- `text/plain`
- timestamp ISO 8601 gerado no momento da chamada

O `DEV_LOG.md` registra validacao real anterior para check-in e check-out individuais.

## Comparacao com API FNRH 2.4

### Confirmado como compativel

- A API 2.4 continua usando URL-based `/rest/v2`.
- `POST /hospedagem/registrar` continua existindo.
- A resposta esperada continua trazendo `dados.reserva.link_precheckin`.
- A resposta esperada continua trazendo `dados.dados_hospedes[].hospede_id` quando ha hospedes processados.
- `cpf_solicitante` continua obrigatorio para `POST /hospedagem/registrar`.
- Check-in/check-out por texto ISO em `text/plain` continua documentado para operacoes de reserva em lote e segue coerente com os testes individuais ja feitos.

### Diferencas e pontos de atencao

- A versao oficial atual agora e 2.4, publicada em junho de 2026; o projeto estava baseado em notas v2.3.
- O changelog 2.4 diz que nao houve mudanca estrutural de endpoints.
- A v2.4 esclarece que `GeneroDescricao` e obrigatorio quando `genero_id = OUTRO`.
- A v2.4 esclarece que operacoes em lote de check-in, check-out e no-show de reserva nao alteram status se a reserva nao possui hospedes.
- Cancelamento e delecao de reserva so sao permitidos quando a reserva esta em status `CRIADA`.
- O payload atual nao envia `numero_reserva_ota`; para origem fixa `MEIOHOSPEDAGEM`, isso parece aceitavel no fluxo atual.
- O payload atual nao envia `check_in_em` e `check_out_em` no registro inicial; no fluxo atual `PRECHECKIN_PENDENTE`, isso e coerente.
- O payload atual nao envia `GeneroDescricao`; isso so vira risco se `genero_id = OUTRO`.
- O payload atual nao envia `responsavel` para menores; risco apenas se o projeto passar a enviar dados completos de menores via `dados_hospede`.
- O payload atual nao envia `dados_ficha.motivo_viagem_id` e `dados_ficha.meio_transporte_id`; nao parece necessario para o fluxo de link/pre-check-in pendente, mas e relevante para check-in completo.

## Endpoints oficiais uteis encontrados

- `GET /reservas/{id}`: consultar reserva por UUID; retorna dados da reserva e `link_precheckin`.
- `GET /reservas/{reserva_id}/hospedes`: listar hospedes da reserva e suas situacoes.
- `GET /hospedes/pre-checkins`: listar pre-check-ins feitos via QR Code/pre-check-in, com filtros.
- `POST /reservas/{reserva_id}/hospedes`: adicionar pessoa a reserva; v2.3+ retorna `hospede_id`.
- `POST /reservas/{reserva_id}/vincular-hospede/{hospede_id}`: vincular pre-check-in nao vinculado a reserva.
- `POST /reservas/{reserva_id}/checkin`: check-in em lote.
- `POST /reservas/{reserva_id}/checkout`: check-out em lote.
- `POST /reservas/{reserva_id}/noshow`: no-show em lote.
- `POST /reservas/{reserva_id}/cancelar`: cancelamento, somente status `CRIADA`.
- `DELETE /reservas/{id}`: delecao, somente status `CRIADA`.
- `GET /fichas`: auditoria/consulta de fichas, com filtros.

## Oportunidades de update

### A) Seguro implementar agora

- Atualizar somente documentacao local para mencionar API 2.4 como versao atual oficial.
- Preencher exemplos seguros no `.env.example` como comentarios, sem alterar runtime, se desejado em tarefa futura.
- Criar utilitario interno de leitura de status local a partir de campos ja persistidos, sem chamar FNRH.

### B) Precisa de teste controlado

- Implementar `GET /reservas/{fnrh_reserva_id}` como consulta manual, somente acionada por botao/admin, para revalidar `link_precheckin` e situacao da reserva.
- Implementar `GET /reservas/{fnrh_reserva_id}/hospedes` para consultar situacao real dos hospedes vinculados.
- Usar status `situacao_hospede_id` de `GET /reservas/{reserva_id}/hospedes` como possivel fonte de preenchimento real, mas somente depois de teste com uma reserva controlada criada pelo fluxo atual sem hospede e preenchida pelo link oficial.
- Testar em homologacao, se credenciais estiverem disponiveis, antes de qualquer uso operacional.

### C) Nao vale implementar agora

- Trocar o fluxo principal de `POST /hospedagem/registrar` para criacao granular (`POST /reservas`, `POST /pessoas`, `POST /reservas/{id}/hospedes`) sem necessidade operacional clara.
- Implementar cancelamento/delecao/no-show no painel agora.
- Implementar check-in/check-out em lote por reserva antes de consolidar vinculacao e status de hospedes.
- Voltar a depender de `GET /hospedes/pre-checkins` como painel de status, pois testes reais anteriores retornaram `{}` e a documentacao o descreve mais como consulta de pre-check-ins via QR Code/balcao.

### D) Risco de quebrar fluxo validado

- Alterar `FNRH_BASE_URL`, `FNRH_SUBMIT_PATH`, payload de `POST /hospedagem/registrar` ou nomes dos campos sem teste controlado.
- Remover o fluxo sem hospede, que esta validado e gera `link_precheckin`.
- Assumir que qualquer endpoint novo resolve automaticamente status de preenchimento sem evidencia pratica.
- Exigir hospede local antes do envio, pois isso reduz a velocidade operacional validada.
- Alterar check-in/check-out individuais ja validados.

## Recomendacao final

Nao implementar mudanca funcional agora.

Primeiro update seguro: documentar oficialmente que a API atual publicada e a v2.4, mas que o contrato principal usado pelo projeto segue compativel e sem mudanca estrutural segundo o changelog. Em seguida, como tarefa separada e controlada, testar somente leitura de `GET /reservas/{fnrh_reserva_id}/hospedes` em uma reserva de teste ja criada, para verificar se `situacao_hospede_id` oferece status real de preenchimento no fluxo atual.

Enquanto isso, preservar o fluxo validado:

criar reserva local -> enviar `POST /hospedagem/registrar` -> receber `link_precheckin` oficial -> mostrar QR/link -> hospede preenche na FNRH.
