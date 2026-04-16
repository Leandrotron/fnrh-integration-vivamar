# DEV_LOG

## 2026-04-16

- Investigação do bug de seleção de stay após salvar ou recarregar no painel `stays.html`
- Adicionados logs de rastreamento no frontend para acompanhar o fluxo de:
  - `loadStays`
  - `loadStayDetails`
  - `renderGuests`
- Tentativas de preservação de `selectedStayId` durante reloads da lista e reabertura da stay atual
- Ajustes incrementais na lógica de seleção das stays para evitar retorno indevido à primeira stay da lista
- Resultado atual: bug ainda não resolvido de forma confiável; investigação pausada para retomada posterior
- Observação operacional: o estado atual foi versionado para manter ponto de retomada claro no próximo ciclo de debug

## Finalidade

Este arquivo é o ponto oficial de retomada do projeto em novos chats.

Ele deve evitar que um novo contexto:

- tente recriar a arquitetura do zero;
- ignore decisões já tomadas;
- perca tempo redescobrindo o estado atual do sistema.

Uso combinado da equipe:

- Eu: idealizador e responsável pelas decisões de produto e operação.
- Codex: desenvolvedor executor dentro do projeto.
- ChatGPT no site: apoio de raciocínio, instrução e brainstorm.

Regra prática:

- ao encerrar o dia, atualizar este arquivo antes do `push`;
- ao iniciar um novo chat, ler este arquivo antes de propor mudanças.

---

## Regras Para Novo Chat

Antes de sugerir qualquer refactor grande ou nova arquitetura, assumir que:

- o projeto já está em andamento;
- já existe backend funcional;
- o SQLite já está em uso;
- já existem telas operacionais;
- a estrutura atual está em transição de `checkins` para `stays + guests`;
- a prioridade é evoluir com continuidade, não reiniciar.

Se houver dúvida, inspecionar o código real primeiro.

---

## Arquitetura Atual

### Visão geral

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

Características:

- backend monolítico em um único arquivo;
- valida CPF e alguns campos básicos;
- normaliza dados antes de persistir;
- mantém dois fluxos convivendo:
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

- `checkins` ainda existe e ainda é usado;
- `stays + guests` é a direção nova do domínio.

### Frontend

Arquivos principais:

- `frontend/index.html`
- `frontend/checkins.html`
- `frontend/stays.html`

Características:

- HTML, CSS e JavaScript puro;
- sem framework;
- JavaScript inline nas páginas;
- frontend principal coleta dados do hóspede e chama a API;
- telas internas servem como painel operacional.

---

## Estado Atual Do Sistema

Hoje o projeto já consegue:

- registrar check-in principal;
- criar uma stay;
- vincular múltiplos hóspedes à mesma stay;
- listar check-ins no painel antigo;
- listar stays e hóspedes no painel novo;
- gerar link de pré-check-in;
- gerar mensagem para WhatsApp;
- simular envio para a FNRH.

Configuração atual da FNRH em `backend/.env`:

```env
FNRH_MODE=mock
FNRH_BASE_URL=
FNRH_SUBMIT_PATH=
FNRH_API_KEY=
```

Interpretação:

- o ambiente atual está em modo simulado;
- não há credenciais reais preenchidas neste momento.

---

## Decisões Já Tomadas

- O MVP usa frontend simples com HTML/CSS/JS puro.
- O backend usa Express para velocidade e simplicidade.
- O banco inicial é SQLite.
- A prioridade principal é FNRH, não PMS.
- A modelagem está migrando de `checkins` para `stays + guests`.
- O painel interno pode ser simples, desde que seja útil operacionalmente.
- O projeto é trabalhado em duas máquinas, uma com Windows e outra com macOS.
- O repositório deve permanecer portátil entre os dois sistemas.
- `node_modules` é dependência local e não deve voltar ao versionamento.
- `backend/.env` é arquivo local e deve ser recriado a partir de `backend/.env.example`.
- `backend/database.sqlite` é arquivo local e não deve ser versionado.
- Ao trocar de máquina, reinstalar dependências localmente antes de testar o backend.

---

## Limitações Atuais

- backend ainda sem separação por camadas;
- frontend com lógica inline;
- `PROPERTY_ID` fixo em código;
- dois modelos coexistindo ao mesmo tempo;
- sem autenticação;
- sem testes automatizados;
- sem migrations formais;
- fluxo antigo e fluxo novo ainda não estão totalmente unificados.

---

## Próximas Direções Prováveis

Ordem sugerida de evolução:

1. Consolidar o domínio em `stays + guests`.
2. Decidir o destino do fluxo legado `checkins`.
3. Organizar melhor a integração FNRH.
4. Modularizar o backend.
5. Extrair JavaScript inline do frontend.
6. Adicionar verificações operacionais e testes.

---

## Problemas Já Resolvidos

Ver também:

- `PROBLEM_SOLVING_LOG.md`

Resumo do principal bug já documentado:

- `POST /stays` falhava porque as tabelas novas não estavam sendo criadas corretamente;
- isso foi corrigido em `backend/database/db.js`;
- hoje o banco possui `checkins`, `stays` e `guests`.

---

## Modelo De Fechamento Diário

Ao final de cada sessão, atualizar as seções abaixo.

### Resumo do dia

- Evolução consistente do fluxo `stays + guests` no frontend interno.
- Painel `stays.html` ganhou capacidade operacional de envio FNRH, inclusão, edição e remoção de hóspedes.
- Regras de integridade de hóspede titular foram reforçadas no frontend e no backend.
- Início da prova de conceito do pré-check-in público por link com `precheckin.html?stay=ID`.
- Fluxo público de pré-check-in evoluiu para uma experiência mais robusta para hóspedes leigos.
- Painel interno passou a expor melhor o link público, a mensagem pronta de WhatsApp e o status de recebimento do pré-check-in.
- O fluxo público de `precheckin.html` foi testado manualmente com mais profundidade nesta sessão.
- Os testes manuais evidenciaram ambiguidades de UX no retorno de sucesso/erro e na regra de titular por lote.
- A sessão terminou com ajustes pontuais para reduzir ambiguidade no pré-check-in público, sem refactor grande.

### Alterações realizadas

- Criação inicial do `docs/DEV_LOG.md` para servir como contexto persistente entre chats.
- Reestruturação do `DEV_LOG.md` para um formato de fechamento diário.
- Melhoria de `frontend/stays.html` para exibir resumo operacional da stay selecionada e permitir envio da stay para FNRH.
- Inclusão de formulário operacional em `frontend/stays.html` para adicionar hóspedes manualmente à stay.
- Inclusão de validações mínimas no formulário de hóspede da `stays.html`:
  - nome obrigatório
  - CPF obrigatório
  - bloqueio de CPF duplicado na mesma stay
- Criação da rota `DELETE /guests/:id` no backend para remoção de hóspedes.
- Inclusão da ação `Remover` em cada `guest-card` de `frontend/stays.html`.
- Bloqueio de remoção do único hóspede titular no frontend.
- Criação da rota `PUT /guests/:id` no backend para edição de hóspedes existentes.
- Inclusão da ação `Editar` em cada `guest-card` de `frontend/stays.html`, reaproveitando o formulário já existente para modo de edição.
- Bloqueio de edição que deixaria a stay sem titular no frontend.
- Reforço da regra de integridade no backend:
  - `DELETE /guests/:id` não permite remover o único titular
  - `PUT /guests/:id` não permite transformar o único titular em acompanhante
- Criação da rota `GET /stays/:id` para carregamento mínimo de uma stay por link público.
- Criação de `frontend/precheckin.html` como primeira prova de conceito de pré-check-in público vinculado a uma stay.
- Adição de bloco de link público do pré-check-in em `frontend/stays.html`.
- Exibição da URL no formato `precheckin.html?stay=ID` para a stay selecionada.
- Inclusão de botões para copiar o link e abrir o pré-check-in em nova aba.
- Tratamento do estado sem seleção com botões desabilitados e mensagem orientativa.
- Inclusão de botão para copiar mensagem pronta de WhatsApp com o link público do pré-check-in em `frontend/stays.html`.
- Inclusão de indicador simples no painel de detalhes da `stays.html` para mostrar se a stay já recebeu pré-check-in ou ainda está aguardando.
- Reforço da UX de `frontend/precheckin.html` com:
  - tratamento amigável para ausência de `?stay=ID`
  - tratamento amigável para stay inválida ou inexistente
  - feedback de carregamento e erro mais claros
  - prevenção de envio duplicado
  - travamento do formulário após envio bem-sucedido
- Inclusão de resumo final informativo na `frontend/precheckin.html` após envio, listando hóspedes enviados e seus tipos.
- Validação mínima de CPF com exatamente 11 dígitos adicionada em `frontend/precheckin.html` e `frontend/stays.html`.
- Reforço no backend para impedir CPF duplicado na mesma stay também em `POST /guests`, mantendo a validação em `PUT /guests/:id`.
- Ajuste da UX de `frontend/precheckin.html` para não comunicar sucesso quando a tentativa atual falha.
- Inclusão de aviso na `frontend/precheckin.html` quando a stay já possui hóspedes registrados, esclarecendo que os dados anteriores não aparecem preenchidos na tela.
- Ajuste do envio da `frontend/precheckin.html` para distinguir:
  - sucesso total
  - falha total
  - envio parcial
- Ajuste da regra de titular na `frontend/precheckin.html` para considerar se a stay já possui titular, permitindo envio apenas de acompanhantes quando isso já estiver atendido.
- Foi feita uma análise de lacunas entre o payload atual de `stays + guests` e a integração futura com a FNRH.
- A análise confirmou que ainda não houve integração real; o projeto segue em modo `mock`.

### Decisões do dia

- O `DEV_LOG.md` será atualizado ao final do dia antes do `push`.
- Este arquivo será a principal referência para retomar o projeto em novos chats.
- O fluxo legado `checkins` continua preservado.
- O avanço desta fase prioriza continuidade e prova de conceito funcional, sem refactor amplo.
- O pré-check-in público será iniciado com link simples via query string `?stay=ID`, sem autenticação nesta etapa.

### Pendências

- Continuar evoluindo a arquitetura sem perder compatibilidade com o estado atual.
- Melhorar a experiência da página pública para não depender de montagem manual da URL.
- Avaliar validação mais forte de CPF no backend de hóspedes.
- Mapear e decidir coleta dos principais faltantes para FNRH no fluxo `stays + guests`: datas reais de entrada/saída, documento alternativo, nacionalidade, residência/endereço e domínios oficiais.
- Registrar melhor, em momento oportuno, a modelagem operacional de reservas com múltiplos quartos dentro da mesma stay.
- Avaliar proteção adicional no backend para o fluxo público, quando a prova de conceito estiver estável.
- Validar comportamento do link público com IDs inválidos.
- Reavaliar a montagem da URL caso a estrutura de pastas públicas mude no futuro.
- Revalidar manualmente o fluxo público de pré-check-in cobrindo:
  - sucesso total
  - falha total
  - envio parcial
  - stay sem titular prévio
  - stay com titular prévio e envio só de acompanhantes
- Observar se a UX de sucesso parcial ainda precisa de refinamento para evitar reenvio manual de hóspedes já salvos.

### Próximo passo recomendado

- Revalidar o fluxo público completo em uso operacional real, agora com foco em sucesso parcial, mensagens finais e regra de titular por stay, antes de qualquer nova evolução.

### Observação de modelagem futura

- O sistema atualmente permite múltiplos hóspedes titulares (`is_main_guest = true`) na mesma stay.
- No contexto operacional da pousada, isso não é necessariamente um erro:
  pode representar uma única reserva contendo múltiplos quartos.
- Isso é útil para identificar responsáveis por grupos diferentes dentro da mesma reserva.
- Porém, o modelo atual ainda não vincula explicitamente hóspedes a quartos específicos.
- Isso pode gerar ambiguidade operacional na entrega de chaves e na alocação real dos hóspedes.

### Direção futura possível

- Avaliar evolução do modelo para suportar agrupamento por quarto, sem refactor grande neste momento.
- Conceito desejado no futuro:
  - stay = reserva/grupo
  - quarto/unidade = subdivisão operacional da stay
  - hóspedes vinculados ao seu respectivo quarto
- Se essa evolução acontecer, a abordagem preferencial é incremental e simples no início, evitando reestruturação ampla prematura.

### Alertas e cuidados

- Não remover o fluxo legado sem verificar dependências reais no frontend e no uso operacional.
- Não tratar este projeto como greenfield.
- Reiniciar o backend sempre que novas rotas forem adicionadas, para evitar testes contra servidor antigo em memória.
- A página pública `precheckin.html` exige atualmente o parâmetro `?stay=ID`; sem ele, a stay não é carregada.
- Em qualquer nova máquina ou novo ambiente local, assumir este fluxo mínimo antes de validar o projeto:
  - `git pull`
  - `npm install`
  - `cd backend && npm install`
  - recriar `backend/.env` a partir de `backend/.env.example`
- Arquivos de sistema do macOS como `._*` e `.DS_Store` não fazem parte do projeto e devem continuar ignorados.

### Integração FNRH — progresso real

- Integração com a API real ativada com sucesso.
- Autenticação Basic e `cpf_solicitante` validados.
- O endpoint `/hospedagem/registrar` está respondendo corretamente com status `201`.
- A reserva está sendo criada com sucesso na FNRH.

### Ajustes realizados

- Inclusão de `data_entrada` e `data_saida` no modelo de `stays`.
- Ajuste do builder para usar:
  - `numero_reserva`
  - `numero_sub_reserva`
  - `data_entrada`
  - `data_saida`
- Evolução da estrutura de hóspedes para formato aninhado:
  - `dados_hospede`
  - `dados_pessoais`
  - `documento_id`
  - `contato`

### Estado atual

- A reserva está sendo criada com sucesso.
- `dados_hospedes` ainda retorna vazio na resposta real.
- Isso indica que a estrutura de hóspede ainda não atende completamente o contrato da FNRH.

### Observações importantes

- A API da FNRH aceita a reserva mesmo com hóspedes inválidos ou incompletos.
- A ausência de erro explícito para hóspedes sugere validação parcial silenciosa nessa etapa.
- A integração principal já foi validada com sucesso.
- O arquivo `docs/FNRH Integration Notes.md` existe, mas ainda precisa ser enriquecido na próxima sessão.

### Próximo passo recomendado

- Identificar os campos mínimos obrigatórios de pessoa que a FNRH exige para aceitar hóspedes.
- O foco mais provável é:
  - `genero_id`
  - estrutura mais completa de `dados_pessoais`
- Continuar a evolução de forma incremental, guiada pela resposta real da API.
- Não refatorar o sistema.
- Não antecipar campos sem validação real da API.

### Marco: Integração FNRH funcional (MVP)

- Integração real com a FNRH validada com sucesso.
- Resposta `201` confirmando criação de reserva.
- `dados_hospedes` retornando preenchido, com pelo menos um hóspede processado corretamente.
- Validação completa do payload principal (`reserva` + `hóspede`) concluída em nível MVP.

### Caminho percorrido até o marco

- Correção progressiva dos campos obrigatórios exigidos pela API:
  - `numero_reserva`
  - `data_entrada`
  - `data_saida`
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
  - `cidade_id`
  - `estado_id`
  - estrutura de `contato`
- Evolução do modelo de `guest` para suportar:
  - endereço/residência
  - gênero
  - raça
  - deficiência
- Ajustes no painel interno para permitir edição mais completa de:
  - hóspedes
  - stays

### Estado atual

- Integração FNRH funcional em nível MVP.
- Dados reais de hóspede já sendo aceitos pela API.
- Builder usando dados do `guest` com fallback temporário para compatibilidade.
- Painel interno já permite preparar dados mais completos antes do envio.

### Próximos passos

- Validar visualmente no painel da FNRH:
  - hóspedes
  - fichas
- Melhorar o log da resposta FNRH para evitar saídas resumidas como `[Object]`.
- Reduzir dependência de valores temporários:
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
- Melhorar a UX do painel interno para reduzir erro humano.
- Avaliar futura integração com o fluxo público de pré-check-in.

### Marco importante

- Integração real com a FNRH validada com sucesso em nível MVP.
- Resposta `201` confirmando criação de reserva.
- `dados_hospedes` deixou de vir vazio.
- Ficha do hóspede já está visível no painel oficial da FNRH.

### Ajustes realizados hoje

- Evolução do modelo de `guest` para suportar:
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
  - editar dados de endereço/residência do hóspede
  - exibir e preparar gênero, raça e deficiência
  - melhorar ajuda visual em campos críticos da FNRH
- Builder FNRH ajustado para priorizar dados reais do `guest` com fallback temporário.
- Log da resposta da FNRH no backend ajustado para exibir o objeto completo, evitando resumos como `[Object]`.

### Estado atual

- Integração FNRH funcional em nível MVP.
- Reserva e hóspede já processados com sucesso.
- O sistema já gera ficha visível no painel oficial.
- Ainda existem pontos de refinamento de precisão dos dados e UX operacional.

### Observações importantes

- Alguns testes ainda retornaram erro de duplicidade por reutilização de `numero_reserva`.
- A conferência da ficha indicou necessidade de validar com cuidado se alguns campos estão sendo refletidos exatamente como esperado na FNRH.
- O projeto já deixou a fase de "conectar" e entrou na fase de "refinar dados e fluxo operacional".
- O arquivo `docs/FNRH Integration Notes.md` existe e é útil como apoio, mas ainda pode ser refinado depois.

### Próximos passos recomendados

- Revisar os logs agora mais completos da resposta da FNRH durante novos testes reais.
- Validar com uma reserva realmente nova os campos que ainda parecem estar sendo refletidos de forma imperfeita.
- Reduzir dependência de fallbacks temporários:
  - `genero_id`
  - `raca_id`
  - `deficiencia_id`
- Avaliar futura evolução do fluxo público de pré-check-in.
- Continuar sem refactor grande.

---

## Instrução De Atualização No Fim Do Dia

Quando for pedido para atualizar este arquivo antes do `push`, registrar de forma objetiva:

- o que foi feito no dia;
- quais arquivos ou áreas mudaram;
- decisões tomadas;
- problemas encontrados;
- o que ficou pendente;
- qual deve ser o próximo passo mais lógico.

Se houver investigação detalhada de bug, manter também o registro no `PROBLEM_SOLVING_LOG.md`.

---

## Última Atualização

- Data: 2026-04-12
- Situação geral: MVP funcional, arquitetura híbrida `checkins` + `stays/guests`, FNRH em modo `mock`, painel interno de stays operacional, link público de pré-check-in integrado ao painel, validações de CPF reforçadas e fluxo público ajustado para comunicar melhor sucesso total, falha total e envio parcial
