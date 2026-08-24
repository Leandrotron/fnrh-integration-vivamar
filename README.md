# Sistema de Pré-check-in FNRH — Pousada Viva Mar

Sistema operacional para criar reservas locais, registrar a hospedagem na FNRH, distribuir o link oficial de pré-check-in e acompanhar hóspedes, check-in e checkout.

## Interface principal

A recepção opera por `frontend/reservas.html`, organizada em:

1. **Reserva** — identificação, período, quantidade de hóspedes e contato;
2. **Pré-check-in FNRH** — envio, link oficial, WhatsApp, QR Code e progresso;
3. **Hóspedes / Hospedagem** — hóspedes conhecidos e próximas ações de check-in/checkout;
4. **Resolver pendências** — hóspedes oficiais ausentes do painel e fichas sem vínculo;
5. **Mais opções** — atualização manual, diagnóstico e lista interna.

`frontend/stays.html` permanece como interface legada.

## Fluxo operacional

1. criar e salvar a reserva;
2. criar o pré-check-in na FNRH;
3. compartilhar o mesmo link oficial com os hóspedes da reserva;
4. cada hóspede preenche sua própria ficha;
5. consultar hóspedes oficiais e trazer ao painel quando necessário;
6. realizar check-in e checkout individualmente quando as regras atuais permitirem.

## Regras importantes

- Todos os adultos da reserva podem usar o mesmo link oficial.
- Cada adulto preenche sua própria ficha.
- Quantidades de adultos e menores representam a ocupação esperada, mas não garantem vínculo estruturado de cada pessoa.
- Check-in e checkout dependem de `fnrh_hospede_id` e da situação oficial compatível.
- Importar um hóspede oficial para o painel e vincular uma ficha avulsa são operações diferentes.
- Fichas não vinculadas exigem conferência explícita da recepção.

## Stack

- Frontend: HTML, CSS e JavaScript puro.
- Backend: Node.js e Express.
- Banco local: SQLite.
- Integração externa: API FNRH.

## Execução local

Windows:

- abrir `scripts/start-local.bat`;
- acessar `http://localhost:3000/reservas.html`.

Mac/Linux:

```text
cd backend
node server.js
```

Depois, acessar `http://localhost:3000/reservas.html`.

## Backup

- script: `scripts/backup-sqlite.bat`;
- origem: `backend/database.sqlite`;
- destino: Google Drive configurado localmente;
- execução automática configurável pelo Agendador do Windows.

## Documentação

- Auditoria de UX e fichas não vinculadas: `docs/RESERVAS_UX_AND_UNLINKED_FNRH_AUDIT.md`.
- Diagnóstico de hóspedes oficiais: `docs/FNRH_RESERVATION_GUESTS_DIAGNOSTIC.md`.
- Diagnóstico de atualização da API: `docs/FNRH_API_UPDATE_DIAGNOSTIC.md`.
- Notas de integração: `docs/FNRH Integration Notes.md`.
- Arquitetura e decisões: `docs/architecture.md`.
- Histórico operacional: `DEV_LOG.md` e `docs/DEV_LOG.md`.

## Estado da evolução de UX

- Auditoria concluída em 24/08/2026.
- Fase 1 de reorganização visual implementada sem alteração de backend, banco, endpoints ou regras FNRH.
- Próxima etapa: revisão visual e operacional na pousada antes de novas simplificações.
- Busca futura por CPF/passaporte depende de teste real controlado do GET de fichas não vinculadas; não está implementada.

## Observações

- O sistema orquestra o fluxo, mas não replica as regras da FNRH.
- Alguns controles auxiliares usam `localStorage` ou `sessionStorage`.
- `backend/.env`, credenciais, `node_modules` e `backend/database.sqlite` são locais e não devem ser versionados.
