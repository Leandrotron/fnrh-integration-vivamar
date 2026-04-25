# 🏨 FNRH Integration — Pousada Viva Mar

Sistema de **pré-check-in digital** com integração à FNRH, desenvolvido para eliminar retrabalho manual na recepção.

Status atual: fluxo operacional `stays + guests` funcional, com pré-check-in público por link, criação em lote de stays e envio real para a FNRH.

---

## 🎯 Objetivo

Permitir que o hóspede:

* Preencha seus dados antes da chegada
* Tenha suas informações validadas automaticamente
* Tenha seus dados enviados diretamente para a FNRH
* Reduza o tempo de check-in presencial

---

## 🧠 Problema

O processo tradicional de check-in:

* Uso de fichas em papel
* Dados ilegíveis ou incompletos
* Retrabalho manual no sistema
* Tempo perdido na recepção

---

## 💡 Solução

Um sistema onde:

```text
Stay → Link público → Hóspedes → Painel interno → FNRH API
```

Com isso:

* A recepção pode criar stays individuais ou em lote
* Cada stay gera um link público de pré-check-in
* Os hóspedes preenchem no próprio celular
* Os dados chegam organizados no painel interno
* O envio real para a FNRH já foi validado com resposta `201`

---

## 🏗️ Arquitetura

```text
frontend/   → formulário web (mobile-first)
backend/    → API + validação + integração FNRH
database/   → armazenamento dos dados
docs/       → documentação do projeto
```

---

## 💻 Troca de máquina

Este projeto é trabalhado em duas máquinas, uma com Windows e outra com macOS.

Regra prática:

* o código vem do Git
* as dependências são locais
* `backend/.env` é local
* `backend/database.sqlite` é local

Proteção operacional dos dados:

* Git/GitHub protege o código
* `database.sqlite` nao deve ser versionado no Git
* o banco local continua sendo dado operacional critico
* o projeto agora inclui backup versionado em `scripts/`
* destino recomendado do backup: `G:\Meu Drive\fnrh-integration-vivamar-backups`

Fluxo mínimo ao abrir o projeto em outra máquina:

```bash
git pull
npm install
cd backend && npm install
cp backend/.env.example backend/.env
```

Depois disso, para testar o backend localmente:

```bash
cd backend
node server.js
```

Para abrir o frontend localmente, mantenha o backend rodando em `http://localhost:3000` e abra os arquivos em `frontend/` como hoje. O fallback local continua apontando para essa porta sem exigir configuração extra.

---

## Beta / Deploy mínimo

Objetivo desta fase: publicar frontend e backend sem mexer na lógica atual.

Recomendação prática:

* backend em Render ou Railway
* frontend em hospedagem estática simples

Arquivo local do backend:

* `backend/.env`

Variáveis usadas hoje:

* `PORT` → porta HTTP da API (`3000` no local)
* `FNRH_MODE` → `mock` ou `real`
* `FNRH_BASE_URL`
* `FNRH_SUBMIT_PATH`
* `FNRH_USER`
* `FNRH_API_KEY`
* `FNRH_CPF_SOLICITANTE`

Se `FNRH_MODE=mock`, o fluxo continua funcionando sem credenciais reais da FNRH.

Se frontend e backend ficarem em domínios diferentes, defina a URL pública da API em `frontend/app-config.js`:

```js
window.APP_CONFIG = {
  API_BASE: "https://URL-DO-BACKEND"
};
```

Checklist mínimo:

* subir o backend
* copiar a URL pública do backend
* configurar `window.APP_CONFIG.API_BASE`
* publicar o frontend
* testar `precheckin.html`
* testar o painel interno
* validar criação, listagem e envio FNRH

Observação:

* SQLite é aceitável para beta controlada
* a persistência em cloud depende do disco oferecido pelo provedor
* não alterar isso agora

---

## Deploy Backend (Render)

Passos diretos:

* criar conta no Render
* criar um novo `Web Service`
* conectar o repositório Git
* definir `Root Directory`: `backend`
* definir `Build Command`: `npm install`
* definir `Start Command`: `npm start`

Nota:

* o backend usa `process.env.PORT` automaticamente, não precisa configurar porta manualmente

Observação:

* para uso com frontend externo, configurar `window.APP_CONFIG.API_BASE` com a URL pública do backend

---

## Publicação do frontend beta

O frontend publicado fica na pasta `frontend`.

Para esta beta externa:

* o backend está em `https://fnrh-integration-vivamar.onrender.com`
* `frontend/app-config.js` já aponta para esse backend

Depois de publicar o frontend, testar ao menos:

* `precheckin.html?token=...`
* `stays.html`

---

## ⚙️ Stack

### Frontend

* HTML
* CSS
* JavaScript

### Backend

* Node.js
* Express

### Banco de dados

* SQLite (MVP)
* PostgreSQL (futuro)

---

## 📊 Modelo de dados (resumo)

Modelo principal atual: `stays + guests`

### `stays`

* `reservation_id`
* `sub_reservation_id`
* `data_entrada`
* `data_saida`

### `guests`

* nome completo
* CPF
* data de nascimento
* telefone
* endereço completo
* `cidade_id` / `estado_id`
* gênero / raça / deficiência
* `vehicle_plate` (opcional, uso operacional, não enviado para a FNRH)
* status local e status FNRH

O fluxo legado com `checkins` ainda existe, mas a evolução atual do projeto está concentrada em `stays + guests`.

---

## Fluxo operacional atual

* Criação individual ou em lote de stays no painel interno
* Geração e cópia de links de pré-check-in por stay ou por reserva
* Pré-check-in público para múltiplos hóspedes
* Revisão interna dos dados antes do envio
* Envio real para a FNRH já validado com resposta `201`

---

## 🔄 Status do fluxo

* `draft`
* `validated`
* `sent_to_fnrh`
* `error`

---

## 🔗 Integrações

### Principal

* FNRH Digital (API V2)

### Futuro

* PMS (ex: Cloudbeds)

---

## 🛠️ Roadmap

### Fase 1

* Estrutura do projeto
* Formulário inicial
* Backend básico

### Fase 2

* Validações (CPF, CEP)
* Persistência de dados

### Fase 3

* Painel interno

### Fase 4

* Integração FNRH (homologação)

### Fase 5

* Produção

---

## ⚠️ Observações

* O projeto prioriza a integração com a FNRH
* Integração com PMS será tratada separadamente
* Dados devem seguir padrão exigido pela API oficial

---

## 🚀 Visão futura

Este projeto pode evoluir para:

* Produto para outros hotéis/pousadas
* Integração completa com PMS
* Automação total de check-in

---

## 👨‍💻 Autor

Desenvolvido internamente para a operação da Pousada Viva Mar.
---

## Fluxo atual de integracao com FNRH

O fluxo atual foi simplificado para gerar o link oficial da FNRH o mais cedo possivel, sem exigir ficha completa antes do envio inicial.

1. Criar a `stay` com os dados basicos da reserva.
2. Cadastrar o hospede com os dados minimos necessarios: nome completo, CPF, data de nascimento e CEP.
3. O sistema resolve `cidade_id` e `estado_id` a partir do CEP para compor o payload minimo funcional.
4. Enviar a stay para a FNRH.
5. Receber e persistir `link_precheckin`.
6. Compartilhar o link oficial para que o proprio hospede complete a ficha no ambiente da FNRH.

Esse fluxo substitui a estrategia anterior de exigir ficha completa antes do envio inicial. Dados como `genero_id`, `raca_id` e `deficiencia_id` continuam disponiveis no sistema, mas nao bloqueiam mais a geracao do link oficial.

## Dados minimos obrigatorios (fluxo atual)

* Nome completo
* CPF
* Data de nascimento
* CEP
* Datas da reserva


## Atualizacao operacional mais recente

- O fluxo principal agora prioriza o envio inicial para a FNRH e o uso do link oficial retornado pela propria FNRH.
- `frontend/reservas.html` foi criada como interface enxuta e experimental focada na recepcao.
- `frontend/stays.html` continua existindo como tela anterior, mais completa e mais carregada, sem ser removida nesta etapa.
- O sistema deixou de perseguir como fluxo principal a ideia de formulario completo proprio antes do primeiro envio.

## Posicionamento atual do sistema

O produto esta se consolidando como um painel/orquestrador da recepcao, com foco em:

- criar reserva com dados minimos
- cadastrar hospede principal com dados minimos
- enviar para FNRH
- compartilhar o link oficial
- exibir QR Code para operacao no balcao

Objetivo operacional central:

- eliminar papel
- reduzir retrabalho
- usar a FNRH como ambiente oficial de preenchimento do hospede

## Interfaces operacionais atuais

### `frontend/reservas.html`

- nova base provavel da interface futura
- focada no fluxo minimo da recepcao
- inclui link oficial, QR Code, CEP com preenchimento automatico no fluxo brasileiro e modo estrangeiro visualmente coerente

### `frontend/stays.html`

- permanece disponivel como tela anterior e mais completa
- segue util para operacoes e testes detalhados
- nao deve ser removida neste momento

---

## Modo de uso local (beta)

Fluxo mais simples para uso operacional local:

1. Execute `scripts/start-local.bat`
2. Aguarde o backend subir no terminal
3. Abra o navegador em `http://localhost:3000`
4. Use `reservas.html` como tela principal da recepcao

Regras praticas:

* nao fechar o terminal enquanto o sistema estiver em uso
* o backend agora serve tambem o frontend
* nao e mais necessario usar Live Server no VS Code

Fluxo basico da recepcao:

* criar ou selecionar a reserva
* salvar dados basicos da reserva
* enviar para a FNRH
* copiar ou abrir o link oficial
* opcionalmente vincular hospede para liberar controle de check-in/check-out pelo painel

Observacao operacional:

* fluxo sem hospede = geracao rapida do link oficial
* fluxo com hospede = controle completo, incluindo `fnrh_hospede_id`, check-in e check-out

## Atualizacao beta 2026-04-25

- O backend passou a servir o frontend localmente em `http://localhost:3000`.
- O produto agora opera em dois modos:
  - link rapido sem hospede
  - controle completo com hospede, check-in e check-out
- O fluxo com hospede passou a exigir tambem `logradouro` para evitar erro `logradouro e obrigatorio` na FNRH.
- O cadastro opcional de hospede usa dados minimos: nome completo, CPF, data de nascimento, CEP e logradouro.
- `frontend/reservas.html` foi consolidada como a interface beta operacional da recepcao.

## Observacoes atuais da integracao FNRH

- `quantidade_hospede_adulto` e `quantidade_hospede_menor` sao informativos e nao garantem vinculo estruturado dos hospedes.
- Um link oficial pode ser reutilizado, mas isso nao representa um grupo estruturado de hospedes no retorno da FNRH.
- Cada hospede tende a preencher individualmente no portal oficial.
- `GET /hospedes/pre-checkins` nao deve ser tratado como fonte operacional confiavel.
