# FNRH Integration — Pousada Viva Mar

## Objetivo

Desenvolver um sistema de **pré-check-in digital** em que o hóspede:

- preenche seus dados antes da chegada;
- tem os dados validados automaticamente;
- permite envio para a FNRH via API;
- reduz ou elimina o retrabalho manual na recepção.

---

## Vale a pena ter um repositório?

**Sim.** Mesmo sendo um projeto interno, um repositório privado vale a pena porque ajuda a:

- versionar backend, frontend e documentação;
- registrar decisões técnicas;
- separar ambiente de testes e produção;
- facilitar manutenção futura;
- transformar a solução em produto, se isso fizer sentido depois.

### Sugestão de nome do repo

`fnrh-integration-vivamar`

### Estrutura inicial sugerida

```text
fnrh-integration-vivamar/
  docs/
    architecture.md
    roadmap.md
    api-notes.md
  frontend/
  backend/
  database/
  scripts/
  .env.example
  README.md
```

---

## Visão geral do sistema

Fluxo principal:

```text
Hóspede → Formulário Web → Backend → Banco de Dados
                                     ├── FNRH API
                                     └── Cloudbeds (futuro / opcional)
```

A prioridade do projeto é a **integração com a FNRH**.  
A integração com o Cloudbeds fica como segunda camada, para não travar o MVP.

---

## Escopo do MVP

O MVP deve permitir:

1. gerar um link de pré-check-in;
2. o hóspede preencher os dados no celular;
3. validar os dados antes do envio;
4. armazenar os dados internamente;
5. enviar os dados para a FNRH em homologação;
6. exibir status de sucesso ou erro em um painel interno.

---

## Arquitetura sugerida

## 1. Frontend

Responsável por:

- exibir o formulário do hóspede;
- aplicar máscaras e validações básicas;
- oferecer experiência mobile-first;
- enviar os dados ao backend.

### Stack sugerida

- HTML
- CSS
- JavaScript puro

### Motivo

Para o MVP, manter o frontend simples acelera o desenvolvimento e reduz acoplamento.

---

## 2. Backend

Responsável por:

- receber os dados do formulário;
- validar regras de negócio;
- normalizar os dados;
- salvar no banco;
- integrar com a API da FNRH;
- registrar logs e respostas da API.

### Stack sugerida

- Node.js
- Express

### Motivo

É leve, simples de subir e ótimo para lidar com formulário + API externa.

---

## 3. Banco de dados

### Inicial

- SQLite

### Futuro

- PostgreSQL, se o projeto crescer ou virar multiestabelecimento.

### Motivo

SQLite resolve muito bem o começo e evita complexidade desnecessária.

---

## Modelo de dados inicial

Tabela sugerida: `checkins`

Campos principais:

- `id`
- `reservation_code`
- `full_name`
- `first_name`
- `last_name`
- `cpf`
- `birth_date`
- `gender`
- `email`
- `phone`
- `cep`
- `address`
- `number`
- `complement`
- `neighborhood`
- `city`
- `state`
- `country`
- `transport_type`
- `vehicle_plate`
- `companions_json`
- `status`
- `fnrh_response`
- `created_at`
- `updated_at`

---

## Status sugeridos

- `draft` — registro criado, ainda incompleto
- `validated` — dados válidos e prontos para envio
- `sent_to_fnrh` — enviado com sucesso
- `error` — houve erro de validação ou envio

---

## Regras de negócio iniciais

## Nome completo

Regra inicial simples:

- `first_name` = primeira palavra
- `last_name` = restante do nome

Observação: nomes brasileiros podem ser complexos, então essa regra pode evoluir depois.

---

## CPF

- obrigatório;
- armazenado sem máscara;
- validado antes do envio.

---

## CEP e endereço

- CEP com busca automática;
- cidade e estado preenchidos a partir do CEP quando possível;
- permitir edição manual se o retorno vier incompleto.

---

## Campos obrigatórios mínimos

- nome completo;
- CPF;
- data de nascimento;
- nacionalidade;
- telefone;
- endereço;
- cidade;
- estado.

---

## Integração com a FNRH

A integração com a FNRH será o núcleo oficial do sistema.

O backend deve ser preparado para:

- autenticação;
- montagem do payload;
- envio dos dados;
- armazenamento da resposta;
- tratamento de erros retornados pela API;
- reenvio manual quando necessário.

### Estratégia recomendada

1. começar em homologação;
2. validar payloads reais;
3. registrar todas as respostas da API;
4. só depois ir para produção.

---

## Painel interno

O sistema deve ter uma área simples para a equipe visualizar:

- nome do hóspede;
- código da reserva;
- status atual;
- data do envio;
- mensagem de erro, se houver;
- botão de reenviar.

Esse painel não precisa ser bonito no início.  
Ele precisa ser útil.

---

## Fluxo operacional desejado

1. reserva já existe;
2. equipe envia link de pré-check-in ao hóspede;
3. hóspede preenche o formulário;
4. sistema valida e salva;
5. sistema envia para a FNRH;
6. equipe consulta o status no painel;
7. se houver erro, corrige e reenvia.

---

## Roadmap

## Fase 1 — Base do projeto

- criar repo;
- organizar pastas;
- criar documentação inicial;
- subir backend básico;
- criar formulário inicial.

## Fase 2 — Validação e armazenamento

- validar CPF;
- validar campos obrigatórios;
- implementar CEP automático;
- salvar no banco.

## Fase 3 — Painel interno

- listar check-ins;
- mostrar status;
- permitir conferência manual.

## Fase 4 — Integração FNRH em homologação

- autenticação;
- envio;
- registro de resposta;
- tratamento de erros.

## Fase 5 — Produção

- ajustes finos;
- logs;
- segurança;
- entrada em ambiente real.

## Fase 6 — Cloudbeds

- estudar integração oficial;
- ou fluxo assistido;
- ou sincronização parcial.

---

## Riscos e atenção

- hóspede preencher dados errados;
- nomes e endereços fora do padrão;
- diferenças de enumeração exigidas pela FNRH;
- rejeições de payload;
- dependência de API externa;
- tentar integrar Cloudbeds cedo demais e atrasar o projeto.

---

## Diretriz técnica principal

O projeto deve ser construído com esta prioridade:

1. **modelo de dados interno bem definido**;
2. **fluxo confiável de pré-check-in**;
3. **integração oficial com a FNRH**;
4. **Cloudbeds como etapa posterior**.

---

## Objetivo final

Ter um sistema em que:

- o hóspede preenche sozinho;
- os dados já chegam organizados;
- a equipe não precisa redigitar tudo;
- a FNRH recebe os dados pelo fluxo oficial;
- a recepção ganha tempo e reduz erro operacional.
