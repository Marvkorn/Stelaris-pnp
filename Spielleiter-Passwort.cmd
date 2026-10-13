@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
node scripts\setup.mjs --reset
if errorlevel 1 (
  echo Passwort nicht geaendert. Bitte Meldung oben beachten.
  pause
  exit /b 1
)
pause
