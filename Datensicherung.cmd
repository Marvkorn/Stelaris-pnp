@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
node scripts\backup.mjs
if errorlevel 1 (
  echo Keine vollstaendige Sicherung erstellt. Bitte Meldung oben beachten.
  pause
  exit /b 1
)
pause
