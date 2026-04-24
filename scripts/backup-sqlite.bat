@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Configure here the Google Drive destination folder for versioned backups.
set "BACKUP_DIR=G:\Meu Drive\fnrh-integration-vivamar-backups"

set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"

set "SOURCE_DB=%PROJECT_DIR%\backend\database.sqlite"
set "LOG_FILE=%SCRIPT_DIR%backup-sqlite.log"

call :timestamp
set "STAMP=%TIMESTAMP%"

if not exist "%SOURCE_DB%" (
  call :log "ERRO" "Arquivo de origem nao encontrado: %SOURCE_DB%"
  exit /b 1
)

if not exist "%BACKUP_DIR%" (
  mkdir "%BACKUP_DIR%" 2>nul
  if errorlevel 1 (
    call :log "ERRO" "Nao foi possivel criar a pasta de destino: %BACKUP_DIR%"
    exit /b 1
  )
)

set "BACKUP_FILE=%BACKUP_DIR%\database-%STAMP%.sqlite"

copy /Y "%SOURCE_DB%" "%BACKUP_FILE%" >nul
if errorlevel 1 (
  call :log "ERRO" "Falha ao copiar %SOURCE_DB% para %BACKUP_FILE%"
  exit /b 1
)

call :log "SUCESSO" "Backup criado de %SOURCE_DB% para %BACKUP_FILE%"

forfiles /P "%BACKUP_DIR%" /M "database-*.sqlite" /D -60 /C "cmd /c del /q @path" >nul 2>nul
if errorlevel 1 (
  call :log "AVISO" "Limpeza de backups antigos nao executada ou sem arquivos elegiveis em %BACKUP_DIR%"
) else (
  call :log "SUCESSO" "Limpeza de backups antigos concluida em %BACKUP_DIR% para arquivos database-*.sqlite com mais de 60 dias"
)

exit /b 0

:timestamp
for /f %%I in ('powershell -NoProfile -Command "[DateTime]::Now.ToString(\"yyyy-MM-dd_HH-mm-ss\")"') do set "TIMESTAMP=%%I"
exit /b 0

:log
set "LEVEL=%~1"
set "MESSAGE=%~2"
for /f "delims=" %%I in ('powershell -NoProfile -Command "[DateTime]::Now.ToString(\"yyyy-MM-dd HH:mm:ss\")"') do set "LOG_TS=%%I"
>>"%LOG_FILE%" echo [%LOG_TS%] [%LEVEL%] %MESSAGE%
exit /b 0
