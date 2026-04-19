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
