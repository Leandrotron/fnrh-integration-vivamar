# DEV_LOG

## 2026-04-16

- InvestigaÃƒÂ§ÃƒÂ£o do bug de seleÃƒÂ§ÃƒÂ£o de stay apÃƒÂ³s salvar ou recarregar no painel `stays.html`
- Adicionados logs de rastreamento no frontend para acompanhar o fluxo de:
  - `loadStays`
  - `loadStayDetails`
  - `renderGuests`
- Tentativas de preservaÃƒÂ§ÃƒÂ£o de `selectedStayId` durante reloads da lista e reabertura da stay atual
- Ajustes incrementais na lÃƒÂ³gica de seleÃƒÂ§ÃƒÂ£o das stays para evitar retorno indevido ÃƒÂ  primeira stay da lista
- Resultado atual: bug ainda nÃƒÂ£o resolvido de forma confiÃƒÂ¡vel; investigaÃƒÂ§ÃƒÂ£o pausada para retomada posterior
- ObservaÃƒÂ§ÃƒÂ£o operacional: o estado atual foi versionado para manter ponto de retomada claro no prÃƒÂ³ximo ciclo de debug

## Finalidade

Este arquivo ÃƒÂ© o ponto oficial de retomada do projeto em novos chats.

Ele deve evitar que um novo contexto:

- tente recriar a arquitetura do zero;
- ignore decisÃƒÂµes jÃƒÂ¡ tomadas;
- perca tempo redescobrindo o estado atual do sistema.

Uso combinado da equipe:

- Eu: idealizador e responsÃƒÂ¡vel pelas decisÃƒÂµes de produto e operaÃƒÂ§ÃƒÂ£o.
- Codex: desenvolvedor executor dentro do projeto.
- ChatGPT no site: apoio de raciocÃƒÂ­nio, instruÃƒÂ§ÃƒÂ£o e brainstorm.

Regra prÃƒÂ¡tica:

- ao encerrar o dia, atualizar este arquivo antes do `push`;
- ao iniciar um novo chat, ler este arquivo antes de propor mudanÃƒÂ§as.

---

## Regras Para Novo Chat

Antes de sugerir qualquer refactor grande ou nova arquitetura, assumir que:

- o projeto jÃƒÂ¡ estÃƒÂ¡ em andamento;
- jÃƒÂ¡ existe backend funcional;
- o SQLite jÃƒÂ¡ estÃƒÂ¡ em uso;
- jÃƒÂ¡ existem telas operacionais;
- a estrutura atual estÃƒÂ¡ em transiÃƒÂ§ÃƒÂ£o de `checkins` para `stays + guests`;
- a prioridade ÃƒÂ© evoluir com continuidade, nÃƒÂ£o reiniciar.

Se houver dÃƒÂºvida, inspecionar o cÃƒÂ³digo real primeiro.

---

## Arquitetura Atual

### VisÃƒÂ£o geral

Fluxo principal hoje:

`frontend/index.html` -> `backend/server.js` -> `SQLite` -> envio FNRH (`mock` ou `real`)

### Backend

Local:

- `backend/server.js`

Stack:

- Node.js
- Express
- CORS
- dotenv
- sqlite3

CaracterÃƒÂ­sticas:

- backend monolÃƒÂ­tico em um ÃƒÂºnico arquivo;
- valida CPF e alguns campos bÃƒÂ¡sicos;
- normaliza dados antes de persistir;
- mantÃƒÂ©m dois fluxos convivendo:
  - legado: `checkins`
  - novo: `stays + guests`

### Banco

Locais:

- `backend/database/db.js`
- `backend/database.sqlite`

Banco atual:

- SQLite

Tabelas:

- `checkins`
- `stays`
- `guests`

Leitura do momento:

- `checkins` ainda existe e ainda ÃƒÂ© usado;
- `stays + guests` ÃƒÂ© a direÃƒÂ§ÃƒÂ£o nova do domÃƒÂ­nio.

### Frontend

Arquivos principais:

- `frontend/index.html`
- `frontend/checkins.html`
- `frontend/stays.html`

CaracterÃƒÂ­sticas:

- HTML, CSS e JavaScript puro;
- sem framework;
- JavaScript inline nas pÃƒÂ¡ginas;
- frontend principal coleta dados do hÃƒÂ³spede e chama a API;
- telas internas servem como painel operacional.

---

## Estado Atual Do Sistema

Hoje o projeto jÃƒÂ¡ consegue:

- registrar check-in principal;
- criar uma stay;
- vincular mÃƒÂºltiplos hÃƒÂ³spedes ÃƒÂ  mesma stay;
- listar check-ins no painel antigo;
- listar stays e hÃƒÂ³spedes no painel novo;
- gerar link de prÃƒÂ©-check-in;
- gerar mensagem para WhatsApp;
- simular envio para a FNRH.

ConfiguraÃƒÂ§ÃƒÂ£o atual da FNRH em `backend/.env`:

```env
FNRH_MODE=mock
FNRH_BASE_URL=
FNRH_SUBMIT_PATH=
FNRH_API_KEY=
```

InterpretaÃƒÂ§ÃƒÂ£o:

- o ambiente atual estÃƒÂ¡ em modo simulado;
- nÃƒÂ£o hÃƒÂ¡ credenciais reais preenchidas neste momento.

---

## DecisÃƒÂµes JÃƒÂ¡ Tomadas

- O MVP usa frontend simples com HTML/CSS/JS puro.
- O backend usa Express para velocidade e simplicidade.
- O banco inicial ÃƒÂ© SQLite.
- A prioridade principal ÃƒÂ© FNRH, nÃƒÂ£o PMS.
- A modelagem estÃƒÂ¡ migrando de `checkins` para `stays + guests`.
- O painel interno pode ser simples, desde que seja ÃƒÂºtil operacionalmente.
- O projeto ÃƒÂ© trabalhado em duas mÃƒÂ¡quinas, uma com Windows e outra com macOS.
- O repositÃƒÂ³rio deve permanecer portÃƒÂ¡til entre os dois sistemas.
- `node_modules` ÃƒÂ© dependÃƒÂªncia local e nÃƒÂ£o deve voltar ao versionamento.
- `backend/.env` ÃƒÂ© arquivo local e deve ser recriado a partir de `backend/.env.example`.
- `backend/database.sqlite` ÃƒÂ© arquivo local e nÃƒÂ£o deve ser versionado.
- Ao trocar de mÃƒÂ¡quina, reinstalar dependÃƒÂªncias localmente antes de testar o backend.

---

## LimitaÃƒÂ§ÃƒÂµes Atuais

- backend ainda sem separaÃƒÂ§ÃƒÂ£o por camadas;
- frontend com lÃƒÂ³gica inline;
- `PROPERTY_ID` fixo em cÃƒÂ³digo;
- dois modelos coexistindo ao mesmo tempo;
- sem autenticaÃƒÂ§ÃƒÂ£o;
- sem testes automatizados;
- sem migrations formais;
- fluxo antigo e fluxo novo ainda nÃƒÂ£o estÃƒÂ£o totalmente unificados.

---

## PrÃƒÂ³ximas DireÃƒÂ§ÃƒÂµes ProvÃƒÂ¡veis

Ordem sugerida de evoluÃƒÂ§ÃƒÂ£o:

1. Consolidar o domÃƒÂ­nio em `stays + guests`.
2. Decidir o destino do fluxo legado `checkins`.
3. Organizar melhor a integraÃƒÂ§ÃƒÂ£o FNRH.
4. Modularizar o backend.
5. Extrair JavaScript inline do frontend.
6. Adicionar verificaÃƒÂ§ÃƒÂµes operacionais e testes.

---

## Problemas JÃƒÂ¡ Resolvidos

Ver tambÃƒÂ©m:

- `PROBLEM_SOLVING_LOG.md`

Resumo do principal bug jÃƒÂ¡ documentado:

- `POST /stays` falhava porque as tabelas novas nÃƒÂ£o estavam sendo criadas corretamente;
- isso foi corrigido em `backend/database/db.js`;
- hoje o banco possui `checkins`, `stays` e `guests`.

---

## Modelo De Fechamento DiÃƒÂ¡rio

Ao final de cada sessÃƒÂ£o, atualizar as seÃƒÂ§ÃƒÂµes abaixo.

### Resumo do dia

- EvoluÃƒÂ§ÃƒÂ£o consistente do fluxo `stays + guests` no frontend interno.
- Painel `stays.html` ganhou capacidade operacional de envio FNRH, inclusÃƒÂ£o, ediÃƒÂ§ÃƒÂ£o e remoÃƒÂ§ÃƒÂ£o de hÃƒÂ³spedes.
- Regras de integridade de hÃƒÂ³spede titular foram reforÃƒÂ§adas no frontend e no backend.
- InÃƒÂ­cio da prova de conceito do prÃƒÂ©-check-in pÃƒÂºblico por link com `precheckin.html?stay=ID`.
- Fluxo pÃƒÂºblico de prÃƒÂ©-check-in evoluiu para uma experiÃƒÂªncia mais robusta para hÃƒÂ³spedes leigos.
- Painel interno passou a expor melhor o link pÃƒÂºblico, a mensagem pronta de WhatsApp e o status de recebimento do prÃƒÂ©-check-in.
- O fluxo pÃƒÂºblico de `precheckin.html` foi testado manualmente com mais profundidade nesta sessÃƒÂ£o.
- Os testes manuais evidenciaram ambiguidades de UX no retorno de sucesso/erro e na regra de titular por lote.
- A sessÃƒÂ£o terminou com ajustes pontuais para reduzir ambiguidade no prÃƒÂ©-check-in pÃƒÂºblico, sem refactor grande.

### AlteraÃƒÂ§ÃƒÂµes realizadas

- CriaÃƒÂ§ÃƒÂ£o inicial do `docs/DEV_LOG.md` para servir como contexto persistente entre chats.
- ReestruturaÃƒÂ§ÃƒÂ£o do `DEV_LOG.md` para um formato de fechamento diÃƒÂ¡rio.
- Melhoria de `frontend/stays.html` para exibir resumo operacional da stay selecionada e permitir envio da stay para FNRH.
- InclusÃƒÂ£o de formulÃƒÂ¡rio operacional em `frontend/stays.html` para adicionar hÃƒÂ³spedes manualmente ÃƒÂ  stay.
- InclusÃƒÂ£o de validaÃƒÂ§ÃƒÂµes mÃƒÂ­nimas no formulÃƒÂ¡rio de hÃƒÂ³spede da `stays.html`:
  - nome obrigatÃƒÂ³rio
  - CPF obrigatÃƒÂ³rio
  - bloqueio de CPF duplicado na mesma stay
- CriaÃƒÂ§ÃƒÂ£o da rota `DELETE /guests/:id` no backend para remoÃƒÂ§ÃƒÂ£o de hÃƒÂ³spedes.
- InclusÃƒÂ£o da aÃƒÂ§ÃƒÂ£o `Remover` em cada `guest-card` de `frontend/stays.html`.
- Bloqueio de remoÃƒÂ§ÃƒÂ£o do ÃƒÂºnico hÃƒÂ³spede titular no frontend.
- CriaÃƒÂ§ÃƒÂ£o da rota `PUT /guests/:id` no backend para ediÃƒÂ§ÃƒÂ£o de hÃƒÂ³spedes existentes.
- InclusÃƒÂ£o da aÃƒÂ§ÃƒÂ£o `Editar` em cada `guest-card` de `frontend/stays.html`, reaproveitando o formulÃƒÂ¡rio jÃƒÂ¡ existente para modo de ediÃƒÂ§ÃƒÂ£o.
- Bloqueio de ediÃƒÂ§ÃƒÂ£o que deixaria a stay sem titular no frontend.
- ReforÃƒÂ§o da regra de integridade no backend:
  - `DELETE /guests/:id` nÃƒÂ£o permite remover o ÃƒÂºnico titular
  - `PUT /guests/:id` nÃƒÂ£o permite transformar o ÃƒÂºnico titular em acompanhante
- CriaÃƒÂ§ÃƒÂ£o da rota `GET /stays/:id` para carregamento mÃƒÂ­nimo de uma stay por link pÃƒÂºblico.
- CriaÃƒÂ§ÃƒÂ£o de `frontend/precheckin.html` como primeira prova de conceito de prÃƒÂ©-check-in pÃƒÂºblico vinculado a uma stay.
- AdiÃƒÂ§ÃƒÂ£o de bloco de link pÃƒÂºblico do prÃƒÂ©-check-in em `frontend/stays.html`.
- ExibiÃƒÂ§ÃƒÂ£o da URL no formato `precheckin.html?stay=ID` para a stay selecionada.
- InclusÃƒÂ£o de botÃƒÂµes para copiar o link e abrir o prÃƒÂ©-check-in em nova aba.
- Tratamento do estado sem seleÃƒÂ§ÃƒÂ£o com botÃƒÂµes desabilitados e mensagem orientativa.
- InclusÃƒÂ£o de botÃƒÂ£o para copiar mensagem pronta de WhatsApp com o link pÃƒÂºblico do prÃƒÂ©-check-in em `frontend/stays.html`.
- InclusÃƒÂ£o de indicador simples no painel de detalhes da `stays.html` para mostrar se a stay jÃƒÂ¡ recebeu prÃƒÂ©-check-in ou ainda estÃƒÂ¡ aguardando.
- ReforÃƒÂ§o da UX de `frontend/precheckin.html` com:
  - tratamento amigÃƒÂ¡vel para ausÃƒÂªncia de `?stay=ID`
  - tratamento amigÃƒÂ¡vel para stay invÃƒÂ¡lida ou inexistente
  - feedback de carregamento e erro mais claros
  - prevenÃƒÂ§ÃƒÂ£o de envio duplicado
  - travamento do formulÃƒÂ¡rio apÃƒÂ³s envio bem-sucedido
- InclusÃƒÂ£o de resumo final informativo na `frontend/precheckin.html` apÃƒÂ³s envio, listando hÃƒÂ³spedes enviados e seus tipos.
- ValidaÃƒÂ§ÃƒÂ£o mÃƒÂ­nima de CPF com exatamente 11 dÃƒÂ­gitos adicionada em `frontend/precheckin.html` e `frontend/stays.html`.
- ReforÃƒÂ§o no backend para impedir CPF duplicado na mesma stay tambÃƒÂ©m em `POST /guests`, mantendo a validaÃƒÂ§ÃƒÂ£o em `PUT /guests/:id`.
- Ajuste da UX de `frontend/precheckin.html` para nÃƒÂ£o comunicar sucesso quando a tentativa atual falha.
- InclusÃƒÂ£o de aviso na `frontend/precheckin.html` quando a stay jÃƒÂ¡ possui hÃƒÂ³spedes registrados, esclarecendo que os dados anteriores nÃƒÂ£o aparecem preenchidos na tela.
- Ajuste do envio da `frontend/precheckin.html` para distinguir:
  - sucesso total
  - falha total
  - envio parcial
- Ajuste da regra de titular na `frontend/precheckin.html` para considerar se a stay jÃƒÂ¡ possui titular, permitindo envio apenas de acompanhantes quando isso jÃƒÂ¡ estiver atendido.
- Foi feita uma anÃƒÂ¡lise de lacunas entre o payload atual de `stays + guests` e a integraÃƒÂ§ÃƒÂ£o futura com a FNRH.
- A anÃƒÂ¡lise confirmou que ainda nÃƒÂ£o houve integraÃƒÂ§ÃƒÂ£o real; o projeto segue em modo `mock`.

### DecisÃƒÂµes do dia

- O `DEV_LOG.md` serÃƒÂ¡ atualizado ao final do dia antes do `push`.
- Este arquivo serÃƒÂ¡ a principal referÃƒÂªncia para retomar o projeto em novos chats.
- O fluxo legado `checkins` continua preservado.
- O avanÃƒÂ§o desta fase prioriza continuidade e prova de conceito funcional, sem refactor amplo.
- O prÃƒÂ©-check-in pÃƒÂºblico serÃƒÂ¡ iniciado com link simples via query string `?stay=ID`, sem autenticaÃƒÂ§ÃƒÂ£o nesta etapa.

### PendÃƒÂªncias

- Continuar evoluindo a arquitetura sem perder compatibilidade com o estado atual.
- Melhorar a experiÃƒÂªncia da pÃƒÂ¡gina pÃƒÂºblica para nÃƒÂ£o depender de montagem manual da URL.
- Avaliar validaÃƒÂ§ÃƒÂ£o mais forte de CPF no backend de hÃƒÂ³spedes.
- Mapear e decidir coleta dos principais faltantes para FNRH no fluxo `stays + guests`: datas reais de entrada/saÃƒÂ­da, documento alternativo, nacionalidade, residÃƒÂªncia/endereÃƒÂ§o e domÃƒÂ­nios oficiais.
- Registrar melhor, em momento oportuno, a modelagem operacional de reservas com mÃƒÂºltiplos quartos dentro da mesma stay.
- Avaliar proteÃƒÂ§ÃƒÂ£o adicional no backend para o fluxo pÃƒÂºblico, quando a prova de conceito estiver estÃƒÂ¡vel.
- Validar comportamento do link pÃƒÂºblico com IDs invÃƒÂ¡lidos.
- Reavaliar a montagem da URL caso a estrutura de pastas pÃƒÂºblicas mude no futuro.
- Revalidar manualmente o fluxo pÃƒÂºblico de prÃƒÂ©-check-in cobrindo:
  - sucesso total
  - falha total
  - envio parcial
  - stay sem titular prÃƒÂ©vio
  - stay com titular prÃƒÂ©vio e envio sÃƒÂ³ de acompanhantes
- Observar se a UX de sucesso parcial ainda precisa de refinamento para evitar reenvio manual de hÃƒÂ³spedes jÃƒÂ¡ salvos.

### PrÃƒÂ³ximo passo recomendado

- Revalidar o fluxo pÃƒÂºblico completo em uso operacional real, agora com foco em sucesso parcial, mensagens finais e regra de titular por stay, antes de qualquer nova evoluÃƒÂ§ÃƒÂ£o.

### ObservaÃƒÂ§ÃƒÂ£o de modelagem futura

- O sistema atualmente permite mÃƒÂºltiplos hÃƒÂ³spedes titulares (`is_main_guest = true`) na mesma stay.
- No contexto operacional da pousada, isso nÃƒÂ£o ÃƒÂ© necessariamente um erro:
  pode representar uma ÃƒÂºnica reserva contendo mÃƒÂºltiplos quartos.
- Isso ÃƒÂ© ÃƒÂºtil para identificar responsÃƒÂ¡veis por grupos diferentes dentro da mesma reserva.
- PorÃƒÂ©m, o modelo atual ainda nÃƒÂ£o vincula explicitamente hÃƒÂ³spedes a quartos especÃƒÂ­ficos.
- Isso pode gerar ambiguidade operacional na entrega de chaves e na alocaÃƒÂ§ÃƒÂ£o real dos hÃƒÂ³spedes.

### DireÃƒÂ§ÃƒÂ£o futura possÃƒÂ­vel

- Avaliar evoluÃƒÂ§ÃƒÂ£o do modelo para suportar agrupamento por quarto, sem refactor grande neste momento.
- Conceito desejado no futuro:
  - stay = reserva/grupo
  - quarto/unidade = subdivisÃƒÂ£o operacional da stay
  - hÃƒÂ³spedes vinculados ao seu respectivo quarto
- Se essa evoluÃƒÂ§ÃƒÂ£o acontecer, a abordagem preferencial ÃƒÂ© incremental e simples no inÃƒÂ­cio, evitando reestruturaÃƒÂ§ÃƒÂ£o ampla prematura.

### Alertas e cuidados

- NÃƒÂ£o remover o fluxo legado sem verificar dependÃƒÂªncias reais no frontend e no uso operacional.
- NÃƒÂ£o tratar este projeto como greenfield.
- Reiniciar o backend sempre que novas rotas forem adicionadas, para evitar testes contra servidor antigo em memÃƒÂ³ria.
- A pÃƒÂ¡gina pÃƒÂºblica `precheckin.html` exige atualmente o parÃƒÂ¢metro `?stay=ID`; sem ele, a stay nÃƒÂ£o ÃƒÂ© carregada.
- Em qualquer nova mÃƒÂ¡quina ou novo ambiente local, assumir este fluxo mÃƒÂ­nimo antes de validar o projeto:
  - `git pull`
  - `npm install`
  - `cd backend && npm install`
  - recriar `backend/.env` a partir de `backend/.env.example`
- Arquivos de sistema do macOS como `._*` e `.DS_Store` nÃƒÂ£o fazem parte do projeto e devem continuar ignorados.

### IntegraÃƒÂ§ÃƒÂ£o FNRH Ã¢â‚¬â€ progresso real

- IntegraÃƒÂ§ÃƒÂ£o com a API real ativada com sucesso.
- AutenticaÃƒÂ§ÃƒÂ£o Basic e `cpf_solicitante` validados.
- O endpoint `/hospedagem/registrar` estÃƒÂ¡ respondendo corretamente com status `201`.
- A reserva estÃƒÂ¡ sendo criada com sucesso na FNRH.

### Ajustes realizados

- InclusÃƒÂ£o de `data_entrada` e `data_saida` no modelo de `stays`.
- Ajuste do builder para usar:
  - `numero_reserva`
  - `numero_sub_reserva`
  - `data_entrada`
  - `data_saida`
- EvoluÃƒÂ§ÃƒÂ£o da estrutura de hÃƒÂ³spedes para formato aninhado:
  - `dados_hospede`
  - `dados_pessoais`
  - `documento_id`
  - `contato`

### Estado atual

- A reserva estÃƒÂ¡ sendo criada com sucesso.
- `dados_hospedes` ainda retorna vazio na resposta real.
- Isso indica que a estrutura de hÃƒÂ³spede ainda nÃƒÂ£o atende completamente o contrato da FNRH.

### ObservaÃƒÂ§ÃƒÂµes importantes

- A API da FNRH aceita a reserva mesmo com hÃƒÂ³spedes invÃƒÂ¡lidos ou incompletos.
- A ausÃƒÂªncia de erro explÃƒÂ­cito para hÃƒÂ³spedes sugere validaÃƒÂ§ÃƒÂ£o parcial silenciosa nessa etapa.
- A integraÃƒÂ§ÃƒÂ£o principal jÃƒÂ¡ foi validada com sucesso.
- O arquivo `docs/FNRH Integration Notes.md` existe, mas ainda precisa ser enriquecido na prÃƒÂ³xima sessÃƒÂ£o.

### PrÃƒÂ³ximo passo recomendado

- Identificar os campos mÃƒÂ­nimos obrigatÃƒÂ³rios de pessoa que a FNRH exige para aceitar hÃƒÂ³spedes.
- O foco mais provÃƒÂ¡vel ÃƒÂ©:
  - `genero_id`
  - estrutura mais completa de `dados_pessoais`
- Continuar a evoluÃƒÂ§ÃƒÂ£o de forma incremental, guiada pela resposta real da API.
- NÃƒÂ£o refatorar o sistema.
- NÃƒÂ£o antecipar campos sem validaÃƒÂ§ÃƒÂ£o real da API.

### Marco: IntegraÃƒÂ§ÃƒÂ£o FNRH funcional (MVP)

- IntegraÃƒÂ§ÃƒÂ£o real com a FNRH validada com sucesso.
- Resposta `201` confirmando criaÃƒÂ§ÃƒÂ£o de reserva.
- `dados_hospedes` retornando preenchido, com pelo menos um hÃƒÂ³spede processado corretamente.
- ValidaÃƒÂ§ÃƒÂ£o completa do payload principal (`reserva` + `hÃƒÂ³spede`) concluÃƒÂ­da em nÃƒÂ­vel MVP.

### Caminho percorrido atÃƒÂ© o marco

- CorreÃƒÂ§ÃƒÂ£o progressiva dos campos obrigatÃƒÂ³rios exigidos pela API:
  - `numero_reserva`
  - `data_entrada`
  - `data_saida`
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
  - `cidade_id`
  - `estado_id`
  - estrutura de `contato`
- EvoluÃƒÂ§ÃƒÂ£o do modelo de `guest` para suportar:
  - endereÃƒÂ§o/residÃƒÂªncia
  - gÃƒÂªnero
  - raÃƒÂ§a
  - deficiÃƒÂªncia
- Ajustes no painel interno para permitir ediÃƒÂ§ÃƒÂ£o mais completa de:
  - hÃƒÂ³spedes
  - stays

### Estado atual

- IntegraÃƒÂ§ÃƒÂ£o FNRH funcional em nÃƒÂ­vel MVP.
- Dados reais de hÃƒÂ³spede jÃƒÂ¡ sendo aceitos pela API.
- Builder usando dados do `guest` com fallback temporÃƒÂ¡rio para compatibilidade.
- Painel interno jÃƒÂ¡ permite preparar dados mais completos antes do envio.

### PrÃƒÂ³ximos passos

- Validar visualmente no painel da FNRH:
  - hÃƒÂ³spedes
  - fichas
- Melhorar o log da resposta FNRH para evitar saÃƒÂ­das resumidas como `[Object]`.
- Reduzir dependÃƒÂªncia de valores temporÃƒÂ¡rios:
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
- Melhorar a UX do painel interno para reduzir erro humano.
- Avaliar futura integraÃƒÂ§ÃƒÂ£o com o fluxo pÃƒÂºblico de prÃƒÂ©-check-in.

### Marco importante

- IntegraÃƒÂ§ÃƒÂ£o real com a FNRH validada com sucesso em nÃƒÂ­vel MVP.
- Resposta `201` confirmando criaÃƒÂ§ÃƒÂ£o de reserva.
- `dados_hospedes` deixou de vir vazio.
- Ficha do hÃƒÂ³spede jÃƒÂ¡ estÃƒÂ¡ visÃƒÂ­vel no painel oficial da FNRH.

### Ajustes realizados hoje

- EvoluÃƒÂ§ÃƒÂ£o do modelo de `guest` para suportar:
  - `cidade_id`
  - `estado_id`
  - `cep`
  - `logradouro`
  - `numero`
  - `complemento`
  - `bairro`
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
- Painel interno (`stays.html`) ajustado para:
  - editar dados da stay
  - editar dados de endereÃƒÂ§o/residÃƒÂªncia do hÃƒÂ³spede
  - exibir e preparar gÃƒÂªnero, raÃƒÂ§a e deficiÃƒÂªncia
  - melhorar ajuda visual em campos crÃƒÂ­ticos da FNRH
- Builder FNRH ajustado para priorizar dados reais do `guest` com fallback temporÃƒÂ¡rio.
- Log da resposta da FNRH no backend ajustado para exibir o objeto completo, evitando resumos como `[Object]`.

### Estado atual

- IntegraÃƒÂ§ÃƒÂ£o FNRH funcional em nÃƒÂ­vel MVP.
- Reserva e hÃƒÂ³spede jÃƒÂ¡ processados com sucesso.
- O sistema jÃƒÂ¡ gera ficha visÃƒÂ­vel no painel oficial.
- Ainda existem pontos de refinamento de precisÃƒÂ£o dos dados e UX operacional.

### ObservaÃƒÂ§ÃƒÂµes importantes

- Alguns testes ainda retornaram erro de duplicidade por reutilizaÃƒÂ§ÃƒÂ£o de `numero_reserva`.
- A conferÃƒÂªncia da ficha indicou necessidade de validar com cuidado se alguns campos estÃƒÂ£o sendo refletidos exatamente como esperado na FNRH.
- O projeto jÃƒÂ¡ deixou a fase de "conectar" e entrou na fase de "refinar dados e fluxo operacional".
- O arquivo `docs/FNRH Integration Notes.md` existe e ÃƒÂ© ÃƒÂºtil como apoio, mas ainda pode ser refinado depois.

### PrÃƒÂ³ximos passos recomendados

- Revisar os logs agora mais completos da resposta da FNRH durante novos testes reais.
- Validar com uma reserva realmente nova os campos que ainda parecem estar sendo refletidos de forma imperfeita.
- Reduzir dependÃƒÂªncia de fallbacks temporÃƒÂ¡rios:
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
- Avaliar futura evoluÃƒÂ§ÃƒÂ£o do fluxo pÃƒÂºblico de prÃƒÂ©-check-in.
- Continuar sem refactor grande.

---

## InstruÃƒÂ§ÃƒÂ£o De AtualizaÃƒÂ§ÃƒÂ£o No Fim Do Dia

Quando for pedido para atualizar este arquivo antes do `push`, registrar de forma objetiva:

- o que foi feito no dia;
- quais arquivos ou ÃƒÂ¡reas mudaram;
- decisÃƒÂµes tomadas;
- problemas encontrados;
- o que ficou pendente;
- qual deve ser o prÃƒÂ³ximo passo mais lÃƒÂ³gico.

Se houver investigaÃƒÂ§ÃƒÂ£o detalhada de bug, manter tambÃƒÂ©m o registro no `PROBLEM_SOLVING_LOG.md`.

---

## ÃƒÅ¡ltima AtualizaÃƒÂ§ÃƒÂ£o

## 2026-04-19

### Resumo do dia

- EvoluÃƒÂ§ÃƒÂ£o operacional importante do fluxo `stays + guests`, agora com suporte real a mÃƒÂºltiplas stays por reserva.
- Painel `stays.html` passou a permitir criaÃƒÂ§ÃƒÂ£o em lote de stays, reduzindo trabalho manual em reservas com vÃƒÂ¡rios quartos.
- O painel tambÃƒÂ©m passou a copiar uma mensagem ÃƒÂºnica com todos os links de prÃƒÂ©-check-in da mesma reserva.
- O fluxo pÃƒÂºblico de `precheckin.html` foi ajustado para exibir a mensagem real de erro retornada pelo backend em respostas `400`.
- O backend teve correÃƒÂ§ÃƒÂ£o pontual na rota `POST /guests`, eliminando o `ReferenceError` que impedia salvar hÃƒÂ³spedes vÃƒÂ¡lidos via link pÃƒÂºblico.
- O ciclo operacional completo foi revalidado em uso real:
  - criaÃƒÂ§ÃƒÂ£o de stays
  - prÃƒÂ©-check-in pÃƒÂºblico
  - associaÃƒÂ§ÃƒÂ£o correta de hÃƒÂ³spedes
  - envio real para FNRH com resposta `201`

### AlteraÃƒÂ§ÃƒÂµes realizadas

- CorreÃƒÂ§ÃƒÂ£o da rota `POST /guests` em `backend/server.js`:
  - definiÃƒÂ§ÃƒÂ£o de `stayIdClean` a partir de `stay_id`
  - preservaÃƒÂ§ÃƒÂ£o das validaÃƒÂ§ÃƒÂµes existentes
  - restauraÃƒÂ§ÃƒÂ£o do salvamento normal de hÃƒÂ³spedes vÃƒÂ¡lidos
- Ajuste do `frontend/precheckin.html` para:
  - ler o payload de erro do backend quando `response.ok === false`
  - priorizar mensagens reais do backend em erros `400`
  - manter fallback genÃƒÂ©rico para rede, resposta invÃƒÂ¡lida e erros inesperados
- InclusÃƒÂ£o de criaÃƒÂ§ÃƒÂ£o em lote de stays em `frontend/stays.html`:
  - campos de `reservation_id`
  - `data_entrada`
  - `data_saida`
  - quantidade de stays
  - nome de referÃƒÂªncia opcional
  - reaproveitamento da rota existente `POST /stays` com criaÃƒÂ§ÃƒÂµes individuais em sequÃƒÂªncia
- InclusÃƒÂ£o de seleÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica da primeira stay criada apÃƒÂ³s criaÃƒÂ§ÃƒÂ£o em lote.
- InclusÃƒÂ£o de feedback operacional para:
  - sucesso total
  - stays jÃƒÂ¡ existentes
  - falha parcial
  - falha total
- InclusÃƒÂ£o de botÃƒÂ£o em `frontend/stays.html` para copiar uma mensagem ÃƒÂºnica com os links de prÃƒÂ©-check-in da mesma reserva.
- Reaproveitamento de `reservation_id`, `sub_reservation_id` e da funÃƒÂ§ÃƒÂ£o jÃƒÂ¡ existente de geraÃƒÂ§ÃƒÂ£o de link pÃƒÂºblico para montar a mensagem da reserva.

### DecisÃƒÂµes do dia

- Manter a modelagem operacional:
  - `1 stay = 1 quarto/unidade operacional`
  - uma reserva pode gerar vÃƒÂ¡rias stays
- Permitir criaÃƒÂ§ÃƒÂ£o de stays sem titular inicial, porque o rooming list pode chegar depois.
- NÃƒÂ£o criar hÃƒÂ³spedes automaticamente no fluxo de criaÃƒÂ§ÃƒÂ£o em lote.
- NÃƒÂ£o criar rota nova de lote no backend neste momento.
- Preferir criaÃƒÂ§ÃƒÂ£o em lote no frontend, chamando a rota individual jÃƒÂ¡ existente, por ser o caminho mais seguro no estado atual do projeto.
- Reutilizar `sub_reservation_id` como identificador operacional simples das stays do mesmo lote, evitando modelagem nova.
- Reutilizar apenas dados jÃƒÂ¡ carregados no frontend para copiar os links da reserva, sem backend adicional.

### Problemas encontrados

- A rota `POST /guests` estava usando `stayIdClean` sem definir a variÃƒÂ¡vel antes.
- Esse erro gerava `ReferenceError` e bloqueava o salvamento de hÃƒÂ³spedes vÃƒÂ¡lidos via precheck-in pÃƒÂºblico.
- O frontend pÃƒÂºblico estava escondendo erros reais do backend com uma mensagem genÃƒÂ©rica.
- A operaÃƒÂ§ÃƒÂ£o com reservas multi-quarto ficou inviÃƒÂ¡vel usando apenas criaÃƒÂ§ÃƒÂ£o manual de stays uma a uma.
- Copiar links de prÃƒÂ©-check-in stay por stay tambÃƒÂ©m ficou ineficiente para reservas com vÃƒÂ¡rios quartos.

### PendÃƒÂªncias

- Revalidar manualmente em novo ciclo o comportamento de criaÃƒÂ§ÃƒÂ£o em lote quando parte das stays jÃƒÂ¡ existir previamente.
- Observar em uso real se o identificador atual baseado em `sub_reservation_id` ÃƒÂ© suficiente para a operaÃƒÂ§ÃƒÂ£o do dia a dia.
- Continuar refinando a UX operacional sem abrir refactor grande.
- Seguir reduzindo dependÃƒÂªncia de fallbacks temporÃƒÂ¡rios nos dados usados pela FNRH.
- Atualizar futuramente `docs/FNRH Integration Notes.md` com o que foi confirmado nos testes reais mais recentes.

### PrÃƒÂ³ximo passo recomendado

- Validar o uso operacional do fluxo multi-stay em reserva real com repasse dos links por quarto, observando se o formato atual da mensagem e a identificaÃƒÂ§ÃƒÂ£o das stays estÃƒÂ£o claros para a recepÃƒÂ§ÃƒÂ£o.

### Alertas e cuidados

- NÃƒÂ£o tratar reservas com mÃƒÂºltiplos quartos como se fossem uma ÃƒÂºnica stay.
- NÃƒÂ£o reverter para criaÃƒÂ§ÃƒÂ£o manual stay por stay sem necessidade real.
- NÃƒÂ£o criar automaÃƒÂ§ÃƒÂ£o de rooming list ou integraÃƒÂ§ÃƒÂ£o com Cloudbeds antes de consolidar bem o fluxo operacional atual.
- NÃƒÂ£o refatorar backend ou frontend amplo neste momento; o projeto segue pedindo evoluÃƒÂ§ÃƒÂ£o incremental.
- Ao testar mudanÃƒÂ§as em rotas, reiniciar o backend para evitar confusÃƒÂ£o com servidor antigo em memÃƒÂ³ria.
- Continuar verificando com cuidado os retornos reais da FNRH, porque a integraÃƒÂ§ÃƒÂ£o jÃƒÂ¡ estÃƒÂ¡ funcional e qualquer ajuste agora impacta fluxo real.

## 2026-04-20 - Nota operacional

- Backend e frontend ja estao preparados para deploy simples de beta sem refactor estrutural.
- Backend pronto para subir em Render/Railway e frontend pronto para apontar para API remota via `window.APP_CONFIG.API_BASE`.
- Proximo passo operacional: publicar a beta e validar uso externo real com `precheckin.html`, painel interno e fluxo de envio FNRH.
- Backend Render online em `https://fnrh-integration-vivamar.onrender.com`.
- Frontend beta preparado para apontar para esse backend; proximo passo operacional e publicar o frontend e validar uso externo com `precheckin.html?token=...` e `stays.html`.

## Ultima Atualizacao

- Data: 2026-04-19
- Situacao geral: fluxo `stays + guests` validado em cenario real com multiplas stays por reserva, criacao em lote operacional no painel interno, copia de links de pre-check-in por reserva, correcao do `POST /guests`, mensagens de erro do pre-check-in mais precisas e integracao real com FNRH confirmada com resposta `201`

---

## 2026-04-19 - Fechamento complementar

### Resumo do dia

- O fluxo `stays + guests` ganhou maturidade operacional no painel interno e no pre-check-in pÃºblico.
- O painel `stays.html` passou a operar melhor com volume real de stays:
  - filtro por `data_entrada`
  - abertura padrÃ£o em hoje
  - botÃ£o `Hoje`
- O `precheckin.html` ficou mais claro para o hÃ³spede:
  - orientaÃ§Ã£o para cadastrar todos os hÃ³spedes da stay
  - contador de hÃ³spedes jÃ¡ cadastrados
  - continuidade do fluxo apÃ³s envio com sucesso
- O campo operacional `vehicle_plate` foi consolidado no sistema:
  - persistÃªncia no banco
  - captura no fluxo pÃºblico
  - exibiÃ§Ã£o no painel
  - ediÃ§Ã£o operacional no painel
  - sem participaÃ§Ã£o no payload da FNRH
- O fluxo real atÃ© a FNRH foi mantido funcional, com confirmaÃ§Ã£o prÃ¡tica de resposta `201`.

### Alteracoes realizadas

- Ajuste do `frontend/precheckin.html` para exibir mensagens reais do backend em respostas `400`.
- CorreÃ§Ã£o do bug `stayIdClean is not defined` em `POST /guests`.
- InclusÃ£o de criaÃ§Ã£o em lote de stays no `frontend/stays.html`.
- InclusÃ£o de botÃ£o para copiar links de prÃ©-check-in por reserva no `frontend/stays.html`.
- Melhoria de UX do `frontend/precheckin.html` com orientaÃ§Ã£o operacional e contador de hÃ³spedes jÃ¡ cadastrados.
- CorreÃ§Ã£o de encoding/acentuaÃ§Ã£o em textos do `frontend/precheckin.html`.
- InclusÃ£o de filtro por data de entrada em `frontend/stays.html`, com valor inicial em hoje e botÃ£o `Hoje`.
- InclusÃ£o de `vehicle_plate` no modelo `guests`, com suporte em:
  - `backend/database/db.js`
  - `POST /guests`
  - `PUT /guests/:id`
  - `frontend/precheckin.html`
  - `frontend/stays.html`

### Decisoes do dia

- Manter `data_entrada` como filtro operacional principal do painel.
- Manter `created_at` apenas como dado secundÃ¡rio.
- Consolidar a leitura operacional de que `1 stay = 1 quarto/unidade operacional`.
- Manter `sub_reservation_id` como identificador operacional da stay no contexto atual.
- Tratar `vehicle_plate` como dado operacional da pousada, fora do escopo FNRH.
- Continuar priorizando evoluÃ§Ã£o incremental e estabilidade em vez de refactor amplo.

### Problemas encontrados

- O frontend pÃºblico ainda escondia mensagens reais de validaÃ§Ã£o do backend.
- O `POST /guests` tinha uma referÃªncia quebrada que bloqueava salvamento vÃ¡lido.
- O filtro de data inicialmente falhou por diferenÃ§a de formato entre `input[type="date"]` e `data_entrada`.
- A placa do veÃ­culo estava salva, mas ainda nÃ£o estava completa como recurso operacional no painel interno.

### Pendencias

- Observar em uso real se o identificador atual das stays continua suficiente para reservas maiores.
- Revalidar em rotina operacional o filtro por data com volume maior de stays.
- Refinar gradualmente textos com encoding antigo em arquivos que ainda preservam histÃ³rico legado.
- Continuar reduzindo dependÃªncia de fallbacks temporÃ¡rios no builder da FNRH sem abrir refactor amplo.

### Proximo passo recomendado

- Validar em uso operacional real um ciclo completo com:
  - criaÃ§Ã£o em lote
  - distribuiÃ§Ã£o de links por reserva
  - preenchimento pÃºblico por mÃºltiplos hÃ³spedes
  - revisÃ£o no painel interno antes do envio FNRH

### Alertas e cuidados

- NÃ£o mover `vehicle_plate` para o payload da FNRH.
- NÃ£o trocar o filtro principal do painel para data de criaÃ§Ã£o sem necessidade operacional comprovada.
- NÃ£o tratar o projeto como greenfield; o estado atual jÃ¡ Ã© funcional e validado em uso real.
- Reiniciar o backend ao testar alteraÃ§Ãµes em schema ou rotas de `guests`.

### Ultima atualizacao

- Data: 2026-04-19
- Situacao geral: painel interno mais maduro para operacao diaria, com criacao em lote, copia de links por reserva, filtro por data de entrada com foco em hoje, pre-check-in publico mais claro, `vehicle_plate` operacional completo e fluxo real para FNRH preservado

## 2026-04-21 - Fechamento do fluxo minimo FNRH

### Resumo do dia

- A estrategia operacional mudou para gerar o link oficial da FNRH o mais cedo possivel.
- O fluxo deixou de exigir ficha completa antes do envio inicial.
- O sistema agora consegue criar a stay, cadastrar o hospede com validacao reduzida, enviar para a FNRH e receber `link_precheckin` funcional.

### Descobertas tecnicas

- A FNRH exigiu nos testes reais:
  - `nome`
  - `CPF`
  - `data_nascimento`
  - `cidade_id`
  - `estado_id`
- `cidade_id` e `estado_id` passaram a ser tratados como dados minimos de residencia, normalmente resolvidos a partir do CEP.
- A FNRH nao exigiu para gerar o link oficial:
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`

### Ajustes realizados

- Criacao de um builder minimal dedicado para o envio ao endpoint `/hospedagem/registrar`.
- Testes incrementais do payload ate encontrar o menor conjunto funcional aceito pela FNRH.
- Ajuste do bloco `reserva` para ficar mais proximo do contrato oficial.
- Persistencia e exibicao operacional do `link_precheckin` oficial no painel interno.
- Ajuste final das validacoes do backend em `POST /guests` e `PUT /guests/:id` para permitir cadastro minimo sem exigir campos que nao entram no fluxo inicial.

### Resultado final

- Fluxo funcional confirmado para:
  - criar stay com dados minimos
  - cadastrar hospede com validacao reduzida
  - enviar para a FNRH
  - gerar o link oficial de pre-check-in
- A ficha completa pode ser concluida depois pelo proprio hospede no link oficial da FNRH.

### Observacoes importantes

- `data_nascimento` continua obrigatoria.
- O CEP continua importante porque viabiliza a resolucao de `cidade_id` e `estado_id`.
- O preenchimento completo da ficha nao precisa mais acontecer antes do primeiro envio.
- A separacao entre dados minimos para gerar link e ficha completa para conclusao posterior passou a ser a referencia operacional do projeto.

### Proximo passo recomendado

- Manter o foco em estabilidade do fluxo minimo e evoluir a UX operacional sem reintroduzir validacoes antigas que nao sao exigidas para a geracao do link oficial.
