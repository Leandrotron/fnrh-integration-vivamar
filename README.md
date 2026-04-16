# 🏨 FNRH Integration — Pousada Viva Mar

Sistema de **pré-check-in digital** com integração à FNRH, desenvolvido para eliminar retrabalho manual na recepção.

Status atual: investigação ativa de bug na seleção de stays após edição.

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
Hóspede → Formulário → Backend → FNRH API
```

Com isso:

* O hóspede preenche no próprio celular
* Os dados chegam organizados
* O envio à FNRH é automatizado
* A recepção não precisa digitar tudo novamente

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

Tabela principal: `checkins`

Principais campos:

* nome completo
* CPF
* data de nascimento
* telefone
* endereço completo
* cidade / estado
* país
* meio de transporte
* placa (opcional)
* status
* resposta da FNRH

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
