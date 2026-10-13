@echo off
chcp 65001 >nul
setlocal
set "TAILSCALE_EXE=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TAILSCALE_EXE%" (
  echo Tailscale wurde nicht unter %ProgramFiles%\Tailscale gefunden.
  echo Bitte Tailscale von https://tailscale.com/download/windows installieren.
  pause
  exit /b 1
)
title Sternarchiv - Tailscale-Freigabe - Beenden mit Strg+C
echo Zuerst Start.cmd starten und Tailscale verbinden.
echo Die angezeigte https-Adresse an deine Spieler weitergeben.
echo Bei einer Aufforderung HTTPS in der Tailscale-Verwaltung aktivieren.
echo Dieses Fenster offen lassen. Strg+C beendet die Freigabe.
echo.
"%TAILSCALE_EXE%" serve http://127.0.0.1:3000
if errorlevel 1 (
  echo Bitte die Meldung oben beachten. Falls noetig per Rechtsklick als Administrator starten.
  pause
  exit /b 1
)
