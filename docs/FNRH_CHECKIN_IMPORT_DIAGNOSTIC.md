# Diagnóstico da importação de hóspedes FNRH em `CHECKIN_REALIZADO`

Data do diagnóstico: 29/08/2026
Escopo: leitura local do código e da documentação existente, sem chamadas reais à FNRH, sem banco de dados e sem alterações funcionais.

## 1. Caso real observado

O comportamento observado é explicado por uma divergência entre a consulta e a importação:

- a consulta de hóspedes oficiais aceita e exibe qualquer situação devolvida pela FNRH, inclusive `CHECKIN_REALIZADO`;
- a interface considera importável somente o hóspede cuja situação seja exatamente `PRECHECKIN_REALIZADO`;
- a rota interna de importação repete a mesma restrição e rejeita qualquer outra situação com HTTP `409`.

Por isso é coerente a tela mostrar `Oficiais: 3`, `No painel: 0` e `Ainda não adicionados: 3`, mas não permitir que esses hóspedes sejam trazidos ao painel. Eles não estão sendo classificados como já importados: estão ausentes localmente, porém inelegíveis por situação.

O suporte a `CHECKIN_REALIZADO` é tecnicamente viável sem alteração de esquema. A mudança futura mínima deve ampliar, no frontend e no backend, a lista de situações permitidas e gravar no ato da importação a situação oficial já confirmada. Sem essa gravação, seria necessária uma sincronização manual logo após importar para liberar corretamente o checkout no painel.

## 2. Fluxo atual de “Trazer hóspedes para o painel”

O texto atual do controle é **“Trazer hóspede para o painel”**, no singular. Ele é gerado dinamicamente e não possui `id`; o seletor usado pelo JavaScript é o atributo `data-open-official-import-index` em `frontend/reservas.html:2587`.

O primeiro clique não importa o hóspede. Ele apenas abre as escolhas de papel local:

- `Titular`, se a stay ainda não possuir titular;
- `Acompanhante`.

O encadeamento é:

1. `bindFnrhOfficialGuestsActions()` registra o listener de `[data-open-official-import-index]` em `frontend/reservas.html:2606`;
2. o listener reavalia `getFnrhOfficialImportEligibility()` e abre as escolhas em `frontend/reservas.html:2608`;
3. os botões de papel usam `[data-official-import-index]` e chamam `importFnrhOfficialGuest(index, isMain)` em `frontend/reservas.html:2616`;
4. `importFnrhOfficialGuest()` pede confirmação, revalida contexto e candidato e executa o `POST` em `frontend/reservas.html:2817`;
5. após sucesso, `refreshAfterFnrhOfficialImport()` recarrega a stay e a lista oficial.

Para um candidato em `CHECKIN_REALIZADO`, o fluxo é interrompido antes do primeiro listener útil: a elegibilidade retorna `null`, o botão “Trazer hóspede para o painel” não é renderizado e aparece a mensagem “A situação oficial precisa ser sincronizada antes da importação.”

### Função JavaScript, endpoint, payload e sucesso esperado

A função efetiva é `importFnrhOfficialGuest(index, isMainGuest)`.

Endpoint interno:

```text
POST /stays/:stayId/fnrh/importar-hospede-vinculado
```

Payload exato:

```json
{
  "fnrh_hospede_id": "<identificador oficial>",
  "is_main_guest": true
}
```

`is_main_guest` também pode ser `false` para acompanhante. A rota rejeita campos adicionais.

O frontend considera sucesso uma resposta HTTP válida da rota. Em seguida recarrega os detalhes locais e os hóspedes oficiais e exibe:

```text
Hóspede adicionado ao painel com sucesso.
```

Se a mesma identidade oficial já estiver na mesma stay, o backend oferece resposta idempotente, e a interface informa que o hóspede já estava no painel.

### Encadeamento frontend → backend → persistência

```text
GET interno de hóspedes oficiais
  → GET /reservas/{fnrh_reserva_id}/hospedes na FNRH
  → normalização e comparação por fnrh_hospede_id
  → renderização dos oficiais e contadores
  → filtro de elegibilidade do frontend
  → escolha Titular/Acompanhante
  → confirmação do operador
  → POST interno de importação
  → nova leitura oficial da reserva na FNRH
  → confirmação inequívoca do candidato e da situação
  → verificações de duplicidade e titularidade
  → INSERT em guests
  → recarga da stay e da consulta oficial
```

A consulta interna é `GET /stays/:stayId/fnrh/hospedes-oficiais`, implementada em `backend/server.js:1786`. Ela lê `stays.fnrh_reserva_id`, consulta a reserva oficial e cruza os resultados com hóspedes locais pelo `fnrh_hospede_id`.

A importação é implementada em `backend/server.js:1939`. Ela não confia apenas no objeto mantido no navegador: volta a consultar a reserva oficial, exige uma única correspondência exata para o identificador recebido e só então tenta persistir.

## 3. Critérios atuais de elegibilidade

### Frontend

`getFnrhOfficialImportEligibility()` em `frontend/reservas.html:2407` exige cumulativamente:

- índice válido;
- stay selecionada;
- lista oficial carregada;
- token de contexto existente e pertencente à stay ainda selecionada;
- `fnrh_hospede_id` em formato UUID válido;
- candidato ainda não marcado como local;
- situação oficial exatamente igual a `PRECHECKIN_REALIZADO` após `trim()` e conversão para maiúsculas, em `frontend/reservas.html:2418`;
- inexistência, na stay selecionada, de hóspede com o mesmo `fnrh_hospede_id`.

Além disso, a escolha como titular é impedida se já houver titular local.

### Backend

A rota exige:

- corpo JSON contendo somente `fnrh_hospede_id` e `is_main_guest`;
- ID de stay válido;
- UUID oficial válido;
- `is_main_guest` booleano;
- stay pertencente à propriedade configurada;
- `fnrh_reserva_id` presente na stay;
- inexistência global do mesmo `fnrh_hospede_id` em outra stay;
- exatamente um candidato oficial correspondente na reserva consultada;
- dados oficiais mínimos válidos: identificador, nome e, quando o documento é CPF, CPF válido;
- situação oficial exatamente igual a `PRECHECKIN_REALIZADO`, em `backend/server.js:2063`;
- ausência de outro titular na stay, quando solicitado como titular;
- ausência de CPF duplicado na mesma stay, quando houver CPF válido;
- manutenção dessas condições numa segunda verificação imediatamente antes do `INSERT`.

## 4. Tratamento de `PRECHECKIN_REALIZADO`

`PRECHECKIN_REALIZADO` funciona por uma regra explícita, não por uma aceitação genérica de hóspedes oficiais. É a única situação que satisfaz tanto a comparação estrita do frontend, em `frontend/reservas.html:2418`, quanto a comparação estrita do backend, em `backend/server.js:2063`.

Depois das demais validações de identidade, reserva, duplicidade e papel local, o candidato nessa situação pode ser inserido em `guests`.

## 5. Tratamento de `CHECKIN_REALIZADO`

`CHECKIN_REALIZADO` aparece normalmente na consulta oficial porque essa consulta não filtra candidatos por situação. Ele entra nos totais e é classificado como ausente quando não existe hóspede local com o mesmo `fnrh_hospede_id`.

Na importação, porém, ele é explicitamente inelegível no frontend e explicitamente rejeitado pelo backend. Não é tratado como “já processado” nem falha por falta de identificador: o motivo determinante é a lista de situações permitidas conter somente `PRECHECKIN_REALIZADO`.

## 6. Motivo exato da falha

| Etapa | `PRECHECKIN_REALIZADO` | `CHECKIN_REALIZADO` |
|---|---|---|
| Aparece na consulta oficial | Sim | Sim |
| Entra nos contadores oficiais/ausentes | Sim | Sim |
| Passa pela elegibilidade do frontend | Sim | Não |
| Exibe ação de importação | Sim | Não |
| Passa pela validação da rota | Sim | Não; HTTP `409` |
| Pode ser inserido pelo fluxo atual | Sim | Não |

Há dois bloqueios explícitos e independentes:

1. frontend: comparação estrita com `PRECHECKIN_REALIZADO`;
2. backend: comparação estrita com `PRECHECKIN_REALIZADO` após nova consulta oficial.

Assim, remover apenas o bloqueio visual não resolveria: uma chamada manual ou um frontend alterado continuaria sendo recusado pelo backend.

A mensagem visual de que a situação “precisa ser sincronizada” é imprecisa nesse cenário. Sincronizar atualiza hóspedes locais já identificados; não cria o hóspede ausente nem transforma a situação oficial `CHECKIN_REALIZADO` em `PRECHECKIN_REALIZADO`.

## 7. Dados oficiais disponíveis para importação

A normalização feita por `normalizeFnrhReservationGuestCandidate()` em `backend/server.js:805` dispõe dos seguintes dados, quando presentes na resposta oficial:

- `hospede_id`;
- `pessoa_id`;
- nome;
- data de nascimento;
- tipo e número de documento;
- `situacao_hospede_id`.

A documentação da resposta já diagnosticada confirma também `reserva_id` no objeto oficial do hóspede em `docs/FNRH_RESERVATION_GUESTS_DIAGNOSTIC.md:46`. A consulta é feita usando o `fnrh_reserva_id` da stay, portanto o candidato é revalidado dentro da reserva oficial correta.

O endpoint entregue ao frontend preserva dados pessoais: expõe documento apenas mascarado e não entrega número bruto, nascimento ou `pessoa_id`. A rota de importação obtém os valores necessários por uma nova consulta server-to-server, sem aceitá-los do navegador.

Não foram identificados campos de data/hora oficial de check-in ou checkout na resposta previamente documentada. Portanto, a situação `CHECKIN_REALIZADO` pode ser preservada, mas não há base confirmada nesse contrato para retropreencher `fnrh_checkin_at` com a hora real do check-in oficial.

## 8. Viabilidade de importar `CHECKIN_REALIZADO`

A tabela `guests`, em `backend/database/db.js:234`, já possui:

- `fnrh_hospede_id`;
- `fnrh_pessoa_id`;
- `fnrh_checkin_at`;
- `fnrh_checkout_at`;
- `fnrh_situacao_hospede_id`;
- `fnrh_situacao_synced_at`.

`CHECKIN_REALIZADO` já consta da lista de situações conhecidas em `backend/server.js:36`. O campo é textual e não exige migração para aceitar essa situação.

Porém, o `INSERT` da importação atual, em `backend/server.js:2123`, grava identidade, nome, CPF opcional, nascimento opcional e papel, deixando `fnrh_checkin_at` e `fnrh_checkout_at` nulos. Ele **não grava** `fnrh_situacao_hospede_id` nem `fnrh_situacao_synced_at`, apesar de o backend ter acabado de confirmar a situação oficial.

Esse detalhe não prejudica o caso hoje permitido de pré-check-in, porque o próximo passo operacional ainda é check-in. Para um hóspede já em check-in oficial, porém, o painel o carregaria inicialmente sem estado oficial local conhecido.

O controle atual do frontend reconhece `CHECKIN_REALIZADO` em `getFnrhGuestControlState()`, em `frontend/reservas.html:4211`, e libera checkout quando não há divergência nem checkout local. Ele não exige `fnrh_checkin_at` para essa decisão.

A rota ativa de checkout é registrada em `backend/server.js:3882`. Antes de operar, ela consulta novamente a situação oficial e aceita checkout apenas quando a FNRH confirma `CHECKIN_REALIZADO`, em `backend/server.js:3689`. Essa rota ativa também não exige `fnrh_checkin_at` local. As implementações posteriores envolvidas por `if (false)` são legadas e não determinam o fluxo atual.

Logo, não existe impedimento de esquema ou de identidade para a importação. `fnrh_checkin_at` pode permanecer nulo, com indicação de que o horário oficial não está disponível, pois o estado oficial confirmado é suficiente para o fluxo ativo de checkout. O backend ainda revalidará a situação na FNRH antes de enviar o checkout.

## 9. Riscos de duplicidade e proteções existentes

As principais proteções já existentes são:

- índice único parcial sobre `fnrh_hospede_id` normalizado;
- verificação global do identificador oficial antes da consulta externa;
- sucesso idempotente se o identificador já estiver na mesma stay;
- conflito se o mesmo identificador estiver em outra stay;
- verificação de titular já existente;
- verificação de CPF repetido dentro da stay;
- repetição das verificações imediatamente antes do `INSERT`;
- `INSERT` condicional e tratamento do índice único para reduzir corrida concorrente.

O principal risco residual é um candidato sem CPF utilizável — por exemplo, documento estrangeiro — já existir localmente sem `fnrh_hospede_id`. Não há deduplicação genérica por nome e nascimento; nesse caso, importar um identificador oficial novo pode criar uma segunda linha para a mesma pessoa. Comparar automaticamente por nome também seria arriscado. Uma futura implementação deve manter a confirmação explícita do operador e exibir possível correspondência local, sem fazer vínculo heurístico automático.

Ampliar a situação permitida de `PRECHECKIN_REALIZADO` para `CHECKIN_REALIZADO` não enfraquece as proteções por UUID, reserva, titular e CPF já presentes.

## 10. Mudança mínima recomendada

Conclusão operacional sobre sincronização:

- se apenas os dois filtros forem ampliados e o `INSERT` continuar como está, o hóspede será importado, mas o painel inicialmente não terá `fnrh_situacao_hospede_id`; será necessário executar **“Atualizar situações no painel”** antes que a interface libere o checkout;
- a solução mais segura e ainda mínima é persistir, no mesmo `INSERT`, `fnrh_situacao_hospede_id = CHECKIN_REALIZADO` e `fnrh_situacao_synced_at` com o instante da confirmação server-to-server;
- `fnrh_checkin_at` pode permanecer nulo, com indicação de que o horário oficial não está disponível, pois o estado oficial confirmado é suficiente para o fluxo ativo de checkout;
- o backend continuará revalidando a situação na FNRH antes de enviar o checkout, preservando a proteção contra estado desatualizado.

Sem implementar nesta etapa, a menor alteração coerente seria:

1. no frontend, trocar a igualdade exclusiva por uma lista explícita de situações importáveis: `PRECHECKIN_REALIZADO` e `CHECKIN_REALIZADO`;
2. no backend, aplicar exatamente a mesma lista explícita após a nova leitura oficial;
3. no `INSERT`, persistir a situação confirmada e o instante de sincronização;
4. ajustar a mensagem de inelegibilidade para informar a situação concreta e não sugerir uma sincronização incapaz de criar o hóspede;
5. manter a confirmação de titular/acompanhante, todas as verificações de duplicidade e a revalidação server-to-server;
6. manter `CHECKOUT_REALIZADO` fora da lista até existir um caso de uso próprio para importação histórica.

Não é recomendável incluir `CHECKOUT_REALIZADO` nessa mesma ampliação sem um caso de uso separado. Esse estado representa histórico concluído, não uma pessoa que ainda precisa de operação de hospedagem no painel.

Arquivos e pontos exatos de uma mudança futura:

- `frontend/reservas.html`, função `getFnrhOfficialImportEligibility()`: ampliar a comparação de situação;
- `backend/server.js`, rota `POST /stays/:stayId/fnrh/importar-hospede-vinculado`: ampliar a validação da situação e incluir situação/instante de sincronização no `INSERT`;
- `backend/database/db.js`: nenhuma mudança de esquema necessária.

## 11. Validação futura necessária

Uma implementação futura deve validar, com testes automatizados e ambiente controlado:

- importação de `PRECHECKIN_REALIZADO` sem regressão;
- importação de `CHECKIN_REALIZADO` como titular e acompanhante;
- persistência imediata de `fnrh_situacao_hospede_id` e `fnrh_situacao_synced_at`;
- exibição do estado “Hospedado” e liberação de checkout sem exigir `fnrh_checkin_at` local;
- revalidação oficial antes do checkout;
- tentativa do mesmo `fnrh_hospede_id` na mesma stay, com resposta idempotente;
- conflito do mesmo `fnrh_hospede_id` em outra stay;
- conflitos de titular e CPF;
- candidato sem CPF e possível correspondência local;
- chamadas concorrentes de importação;
- rejeição mantida para `CHECKOUT_REALIZADO`;
- mensagens específicas para situação inelegível e falhas de sincronização.

Nesta tarefa, as únicas validações executadas são as leituras locais e os comandos expressamente permitidos. Nenhum cenário real foi acionado.

### Respostas objetivas

1. **Botão:** gerado dinamicamente, sem `id`, pelo atributo `data-open-official-import-index`; texto “Trazer hóspede para o painel”.
2. **Listener:** `bindFnrhOfficialGuestsActions()`, seguido pelo listener dos botões de papel.
3. **Função:** `importFnrhOfficialGuest(index, isMainGuest)`.
4. **Endpoint:** `POST /stays/:stayId/fnrh/importar-hospede-vinculado`.
5. **Payload:** somente `fnrh_hospede_id` e `is_main_guest`.
6. **Bloqueio:** comparação estrita com `PRECHECKIN_REALIZADO` no frontend e no backend.
7. **Por que os contadores mostram ausentes:** a consulta não filtra essa situação e confirma que não há linha local com o mesmo identificador.
8. **Viabilidade:** sim; os identificadores e dados mínimos existem, e o esquema local já comporta `CHECKIN_REALIZADO`.
9. **Sincronização após importar:** necessária se o `INSERT` atual for mantido; dispensável como passo manual se a situação confirmada for gravada atomicamente na importação.
10. **Alteração realizada nesta etapa:** somente este relatório; nenhuma mudança funcional, banco, chamada real à FNRH, vínculo, check-in ou checkout.
