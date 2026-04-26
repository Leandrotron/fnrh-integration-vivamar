# Sistema de Pré Check-in FNRH

## O que é
Sistema simples para gestão de reservas e envio de pré-check-in para FNRH.

## Fluxo
1. Criar reserva
2. Salvar
3. Enviar para FNRH
4. Mostrar QR ou enviar link
5. Hóspedes preenchem

## Regras importantes
- Todos os adultos usam o MESMO link
- Cada adulto preenche sua própria ficha
- Menores são dependentes

## Execução local

Windows:

- abrir `scripts/start-local.bat`
- acessar `http://localhost:3000`

Mac/Linux:

- `cd backend`
- `node server.js`
- acessar `http://localhost:3000`

## Backup

- script: `scripts/backup-sqlite.bat`
- destino: Google Drive (configurado localmente)
- execução automática via Agendador do Windows

## Observações

- Sistema não replica lógica da FNRH
- Apenas orquestra envio e link
- Alguns controles são internos (`localStorage`)
