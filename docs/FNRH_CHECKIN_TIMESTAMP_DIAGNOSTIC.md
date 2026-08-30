# Diagnóstico do timestamp de check-in e checkout FNRH

Data da auditoria: 30/08/2026

Escopo: leitura do fluxo atual. Nenhuma chamada real de check-in/checkout foi executada e nenhum código funcional, banco ou configuração foi alterado.

## 1. Resumo executivo

O fluxo ativo é individual por hóspede. Tanto no check-in quanto no checkout, o frontend envia ao backend um `POST` sem body. Depois de consultar e validar a situação oficial, o backend cria `operationTimestamp` com `new Date().toISOString()` e o envia à FNRH em um `PATCH` cujo body é o próprio texto ISO 8601 UTC.

Portanto, a classificação do comportamento atual é **A: envia `new Date().toISOString()`**. O instante vem do relógio da máquina que executa o backend, no momento imediatamente anterior ao `PATCH`; não vem do navegador, de `data_entrada`, de `data_saida` nem de outro campo persistido.

Embora a documentação informada para esta auditoria descreva `data_hora` como body opcional, a implementação comprovada no repositório não envia um objeto JSON com uma propriedade `data_hora`. Ela envia diretamente o valor do timestamp como `text/plain`. Os registros históricos do projeto documentam que esse formato foi aceito em testes reais controlados. Isso é evidência do comportamento atual do sistema, não uma conclusão sobre todas as formas aceitas pela API atual.

O projeto possui suporte técnico parcial para receber um timestamp escolhido no interior das funções de envio e para armazená-lo, mas não existe hoje caminho de entrada para o operador informá-lo: não há campo no frontend, os endpoints locais ignoram body e o executor sempre substitui qualquer possibilidade por “agora”.

## 2. Fluxo atual de check-in

1. `renderFnrhGuestOperations()`, em `frontend/reservas.html`, renderiza o botão `Check-in FNRH` e conecta seu clique a `checkInGuestFnrh()`.
2. `getFnrhGuestControlState()` só libera o botão quando a situação local sincronizada permite a operação. A função `checkInGuestFnrh()` repete essa validação visual e pede confirmação pelo `window.confirm`.
3. O frontend chama `POST /guests/{guest_id_local}/fnrh-checkin` somente com `{ method: "POST" }`: não há body nem timestamp.
4. O backend registra essa rota por `registerFnrhGuestOperationRoute()` e chama `executeFnrhGuestOperation(guestId, "checkin", res)`.
5. O backend carrega o hóspede e a reserva oficial, consulta os hóspedes da reserva na FNRH e exige situação oficial conhecida `PRECHECKIN_REALIZADO`. Se já estiver em `CHECKIN_REALIZADO`, responde idempotentemente sem novo `PATCH`; outras situações incompatíveis são recusadas.
6. Logo antes do envio, `executeFnrhGuestOperation()` executa `const operationTimestamp = new Date().toISOString()`.
7. `sendFnrhGuestCheckin(fnrhHospedeId, operationTimestamp)` envia `PATCH /hospedes/{fnrh_hospede_id}/checkin` com o timestamp no body textual.
8. O backend lê a resposta do `PATCH`, tenta confirmar novamente a situação oficial e persiste o timestamp operacional local. Quando consegue confirmar `CHECKIN_REALIZADO`, também persiste a situação e o horário da consulta.
9. A resposta local contém `checkin_at: operationTimestamp`, além dos indicadores de confirmação. O frontend recarrega os detalhes da stay e apresenta a mensagem de sucesso ou pendência.

Pontos responsáveis: `checkInGuestFnrh()` em `frontend/reservas.html:4799`, chamada local em `frontend/reservas.html:4829`, executor em `backend/server.js:3642`, geração do instante em `backend/server.js:3723` e envio oficial em `backend/server.js:943`.

## 3. Fluxo atual de checkout

1. `renderFnrhGuestOperations()` renderiza o botão `Check-out FNRH` e conecta seu clique a `checkOutGuestFnrh()`.
2. O frontend só libera a operação quando a situação sincronizada é `CHECKIN_REALIZADO`, não existe checkout local divergente e nenhuma operação do mesmo hóspede está em andamento. O operador ainda confirma pelo `window.confirm`.
3. O frontend chama `POST /guests/{guest_id_local}/fnrh-checkout` somente com `{ method: "POST" }`, sem body ou timestamp.
4. A rota ativa chama `executeFnrhGuestOperation(guestId, "checkout", res)`.
5. O backend consulta novamente a situação oficial e exige `CHECKIN_REALIZADO`. Se já estiver em `CHECKOUT_REALIZADO`, retorna sucesso idempotente sem novo `PATCH`.
6. O mesmo `operationTimestamp = new Date().toISOString()` é criado imediatamente antes do envio.
7. `sendFnrhGuestCheckout(fnrhHospedeId, operationTimestamp)` envia `PATCH /hospedes/{fnrh_hospede_id}/checkout` com o timestamp no body textual.
8. Após a resposta, o backend tenta confirmar `CHECKOUT_REALIZADO`, persiste o timestamp operacional e, quando disponível, a situação confirmada e o horário de sincronização.
9. A resposta local contém `checkout_at: operationTimestamp`; o frontend recarrega a stay e mostra o resultado.

Pontos responsáveis: `checkOutGuestFnrh()` em `frontend/reservas.html:4862`, chamada local em `frontend/reservas.html:4892`, executor em `backend/server.js:3642`, geração do instante em `backend/server.js:3723` e envio oficial em `backend/server.js:1044`.

## 4. Requisições enviadas à FNRH

### Check-in individual atual

```http
PATCH {FNRH_BASE_URL}/hospedes/{fnrh_hospede_id}/checkin
Content-Type: text/plain
Authorization: Basic <credencial omitida>
cpf_solicitante: <valor omitido>

<operationTimestamp gerado por new Date().toISOString()>
```

O body exato em termos de estrutura é uma string ISO 8601 UTC sem objeto JSON, por exemplo conceitual `AAAA-MM-DDTHH:mm:ss.sssZ`. Nenhum valor fictício foi usado nesta auditoria.

### Checkout individual atual

```http
PATCH {FNRH_BASE_URL}/hospedes/{fnrh_hospede_id}/checkout
Content-Type: text/plain
Authorization: Basic <credencial omitida>
cpf_solicitante: <valor omitido>

<operationTimestamp gerado por new Date().toISOString()>
```

Em ambos, `fetch()` recebe o timestamp diretamente em `body`, nas funções `sendFnrhGuestCheckin()` e `sendFnrhGuestCheckout()`. A resposta é lida como texto e depois convertida por `JSON.parse`; uma resposta não JSON é marcada como formato incompatível, mesmo que o HTTP tenha sido concluído.

Antes e depois do `PATCH`, o fluxo ativo pode realizar consultas de leitura dos hóspedes da reserva para validar ou confirmar a situação. Essas consultas não definem o timestamp operacional.

## 5. Tratamento atual de `data_hora`

Classificação: **A. envia `new Date().toISOString()`**.

O trecho determinante está em `executeFnrhGuestOperation()`, `backend/server.js:3723`:

```js
const operationTimestamp = new Date().toISOString();
```

Esse valor é passado sem alteração à função de check-in ou checkout em `backend/server.js:3734`, e cada função o usa diretamente como body do `fetch()`.

Não há propriedade chamada `data_hora` no request real. Esse nome aparece apenas no objeto de resposta simulada do modo mock. Semanticamente, o texto enviado representa a data/hora da operação; estruturalmente, o request real atual é `text/plain`, não `{ "data_hora": ... }`.

Os endpoints locais não leem `req.body`, e `executeFnrhGuestOperation()` não recebe um timestamp como argumento. Assim, o sistema não aceita atualmente um instante informado pelo frontend.

## 6. Relação com `data_entrada`/`data_saida`

- `data_entrada` **não influencia** o timestamp enviado no check-in.
- `data_saida` **não influencia** o timestamp enviado no checkout.
- As duas são datas previstas da stay/reserva e participam do cadastro, edição, exibição, filtros e payload de registro da hospedagem; não são carregadas pelo contexto da operação individual.
- Não existe no fluxo ativo validação que bloqueie check-in ou checkout por ocorrer em um dia de calendário diferente dessas datas.

As restrições operacionais encontradas são de identificação oficial, situação FNRH, divergência de estado local, idempotência e concorrência por hóspede. A data prevista da reserva não participa dessas decisões.

## 7. Persistência local

A tabela `guests`, definida em `backend/database/db.js`, contém:

- `fnrh_checkin_at TEXT`: timestamp que o sistema enviou ao executar ou recuperar um check-in;
- `fnrh_checkout_at TEXT`: timestamp que o sistema enviou ao executar ou recuperar um checkout;
- `fnrh_situacao_hospede_id TEXT`: última situação oficial conhecida;
- `fnrh_situacao_synced_at TEXT`: horário em que a situação foi consultada/sincronizada.

`persistFnrhGuestOperationState()` grava `operationalTimestamp` em `fnrh_checkin_at` ou `fnrh_checkout_at`. Quando há confirmação oficial disponível, grava também situação e `syncedAt`. O frontend distingue corretamente o horário de sincronização com a mensagem “Horário da consulta, não da ação”.

Não existe coluna separada para “horário efetivo confirmado e devolvido pela FNRH” versus “horário solicitado pelo painel”. Nos fluxos realizados por este sistema, os campos operacionais guardam o timestamp enviado. Para uma operação já confirmada oficialmente antes da ação local, o caminho idempotente não inventa nem retropreenche um horário ausente.

## 8. Timezone

`new Date()` representa o instante atual do relógio do servidor. `toISOString()` o serializa em UTC, com sufixo `Z`, no formato exigido no contexto fornecido para esta auditoria. Não existe soma/subtração manual de fuso nem conversão baseada em `America/Sao_Paulo`.

Consequências:

- a origem física do relógio é a máquina do backend;
- a serialização enviada é UTC, não hora local textual;
- o timezone do navegador não participa;
- não há interpretação de uma data/hora escolhida pelo operador, pois esse campo ainda não existe.

## 9. Operações individuais x lote

O fluxo operacional ativo implementa somente:

- `POST /guests/:id/fnrh-checkin` → `PATCH /hospedes/{id}/checkin`;
- `POST /guests/:id/fnrh-checkout` → `PATCH /hospedes/{id}/checkout`.

Não foram encontrados registro ou chamada ativa para `POST /reservas/{reserva_id}/checkin` ou `POST /reservas/{reserva_id}/checkout`. Portanto, embora esses endpoints em lote tenham sido descritos como disponíveis na documentação fornecida, o projeto atual não permite comparar seu tratamento prático de `data_hora` porque não os implementa.

`frontend/stays.html` ainda participa de cadastro, edição e envio de dados de stays, mas não do fluxo operacional atual de check-in/checkout FNRH.

As rotas locais antigas `POST /checkin` e `POST /checkins/:id/send-fnrh` pertencem à estrutura legada `checkins`; a segunda produz apenas uma resposta simulada e não é o fluxo oficial individual atual. Há ainda implementações antigas das rotas de hóspedes dentro de `if (false)`, explicitamente inativas. Nenhuma delas altera a conclusão sobre o fluxo ativo.

## 10. Compatibilidade potencial com registro retroativo

Existe suporte técnico parcial:

- `sendFnrhGuestCheckin()` e `sendFnrhGuestCheckout()` já recebem o timestamp por parâmetro, sem criá-lo internamente;
- `persistFnrhGuestOperationState()` já recebe `operationalTimestamp` por parâmetro;
- o banco já possui campos textuais para os timestamps de check-in e checkout;
- o formato de saída atual já é ISO 8601 UTC.

O suporte não é completo porque:

- não há input ou modal de hora efetiva no frontend;
- o frontend envia `POST` sem body;
- a rota local não lê nem valida um timestamp opcional;
- o executor sempre cria o horário atual;
- não há regras locais para futuro, ordem check-in/checkout, limites retroativos ou interpretação explícita do fuso de um campo `datetime-local`.

Não se pode concluir apenas pelo código que a API aceitará alteração retroativa em toda situação. Em especial, se a situação já estiver oficialmente concluída, o fluxo atual retorna idempotentemente sem `PATCH`; a possibilidade de corrigir o horário de uma operação já confirmada depende do contrato e de teste controlado da API.

## 11. Mudança mínima possível

Sem implementar nesta etapa, a menor evolução coerente seria:

1. manter “agora” como padrão dos botões atuais;
2. oferecer uma opção discreta “Informar outro horário” para check-in e checkout;
3. enviar ao endpoint local um único timestamp opcional;
4. no backend, aceitar apenas esse campo conhecido, validar formato e instante e usar `new Date().toISOString()` quando ele estiver ausente;
5. converter a escolha para um instante UTC com `Z` antes de enviá-la à FNRH;
6. passar o instante validado às funções de envio e persistência já existentes;
7. manter todas as consultas oficiais, regras de situação, idempotência, concorrência e confirmação atuais.

Um `<input type="datetime-local">` não contém timezone. Para evitar deslocamento silencioso, a implementação deve definir explicitamente que a hora digitada é a hora local da pousada e convertê-la segundo o fuso operacional configurado, em vez de depender implicitamente do fuso do navegador. As políticas de limite retroativo, instante futuro e correção de operação já confirmada devem ser definidas somente após confirmação contratual da API.

Isso exige uma extensão pequena do request local e do executor, não uma refatoração ampla nem uma migration.

## 12. Próximo teste recomendado

Antes de implementar, confirmar na documentação/ambiente oficial controlado:

1. a forma exata atualmente aceita para o timestamp nos endpoints individuais: texto ISO no body, JSON com `data_hora`, ou ambos;
2. se um timestamp anterior ao momento da chamada é aceito na transição normal de situação;
3. limites de antiguidade e rejeição de datas futuras;
4. regras de ordem entre check-in e checkout;
5. se uma operação já em `CHECKIN_REALIZADO` ou `CHECKOUT_REALIZADO` permite correção do horário ou permanece apenas idempotente;
6. qual timestamp a resposta oficial devolve, para distinguir valor solicitado de valor efetivamente registrado.

O teste deve usar um hóspede controlado e horários não ambíguos no fuso da pousada, comparar request, resposta e consulta oficial posterior, e só ocorrer em uma tarefa futura com autorização expressa para escrita na FNRH.
