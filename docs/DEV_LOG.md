# DEV_LOG

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
- Avaliar proteção adicional no backend para o fluxo público, quando a prova de conceito estiver estável.
- Validar comportamento do link público com IDs inválidos.
- Reavaliar a montagem da URL caso a estrutura de pastas públicas mude no futuro.

### Próximo passo recomendado

- Evoluir a página pública de pré-check-in com mais robustez operacional, agora que o link já pode ser compartilhado a partir do painel interno.

### Alertas e cuidados

- Não remover o fluxo legado sem verificar dependências reais no frontend e no uso operacional.
- Não tratar este projeto como greenfield.
- Reiniciar o backend sempre que novas rotas forem adicionadas, para evitar testes contra servidor antigo em memória.
- A página pública `precheckin.html` exige atualmente o parâmetro `?stay=ID`; sem ele, a stay não é carregada.

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

- Data: 2026-04-11
- Situação geral: MVP funcional, arquitetura híbrida `checkins` + `stays/guests`, FNRH em modo `mock`, painel interno de stays operacional e primeira versão do pré-check-in público iniciada
