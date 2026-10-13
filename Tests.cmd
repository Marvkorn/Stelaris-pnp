@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
node --test
if errorlevel 1 (
  echo Tests fehlgeschlagen. Bitte Meldungen oben beachten.
  pause
  exit /b 1
)
pause
