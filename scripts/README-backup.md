# Backup do SQLite

## Objetivo

Fazer copias versionadas do banco local `backend/database.sqlite` para uma pasta sincronizada do Google Drive, sem alterar o banco original.

## Como funciona

- O banco principal continua em `backend/database.sqlite`.
- O script cria copias com data e hora no nome, por exemplo: `database-2026-04-24_14-30-00.sqlite`.
- Os backups antigos com mais de 60 dias sao removidos somente se seguirem o padrao `database-*.sqlite`.

## Configuracao

Edite a variavel no topo de `scripts/backup-sqlite.bat`:

```bat
set "BACKUP_DIR=G:\Meu Drive\fnrh-integration-vivamar-backups"
```

Troque esse caminho pela pasta do Google Drive onde os backups devem ser guardados.
No estado operacional atual, o caminho recomendado e:

```bat
set "BACKUP_DIR=G:\Meu Drive\fnrh-integration-vivamar-backups"
```

## Teste manual

No PowerShell ou Prompt de Comando, a partir da raiz do projeto:

```bat
scripts\backup-sqlite.bat
```

Depois confira:

- se um arquivo `database-AAAA-MM-DD_HH-MM-SS.sqlite` foi criado na pasta configurada
- se o log foi atualizado em `scripts/backup-sqlite.log`

## Agendador de Tarefas do Windows

Recomendacao de agendamento:

- executar ao ligar o computador
- executar a cada 1 hora enquanto a maquina estiver ligada

Configuracao sugerida:

1. Abrir `Agendador de Tarefas`.
2. Criar uma nova tarefa.
3. Em `Acoes`, apontar para o arquivo `scripts\backup-sqlite.bat`.
4. Criar um gatilho `Ao fazer logon` ou `Na inicializacao`.
5. Adicionar repeticao a cada `1 hora` por `Indefinidamente` ou enquanto a maquina estiver ligada.

## Restauracao

1. Desligar o backend antes de qualquer restauracao.
2. Escolher o backup mais recente valido na pasta do Google Drive.
3. Copiar o arquivo `database-AAAA-MM-DD_HH-MM-SS.sqlite`.
4. Renomear a copia para `database.sqlite`.
5. Substituir o arquivo em `backend/database.sqlite`.
6. Ligar o backend novamente.

Nunca restaure com o backend em execucao.
