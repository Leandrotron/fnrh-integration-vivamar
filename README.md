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
