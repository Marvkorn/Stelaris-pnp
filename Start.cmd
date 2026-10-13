@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Einrichtung.cmd ausfuehren und Node.js 24 LTS installieren.
  pause
  exit /b 1
)
title Sternarchiv - Server - Beenden mit Strg+C
node server.mjs
if errorlevel 1 (
  echo Der Server konnte nicht gestartet werden. Bitte Meldung oben beachten.
  pause
  exit /b 1
)
