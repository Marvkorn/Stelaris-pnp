@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Node.js 24 LTS von https://nodejs.org/ installieren.
  echo Danach dieses Fenster schliessen und Einrichtung.cmd erneut starten.
  pause
  exit /b 1
)
node scripts\setup.mjs
if errorlevel 1 (
  echo Einrichtung nicht abgeschlossen. Bitte Meldung oben beachten.
  pause
  exit /b 1
)
pause
