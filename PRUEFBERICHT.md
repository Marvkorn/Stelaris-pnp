# Prüfbericht · Version 2 · 13. Oktober 2026

Bestehende Node.js-/SQLite-Anwendung erweitert. Kein kostenpflichtiger Dienst bestellt und kein öffentliches Deployment ausgeführt.

## Automatisierte Tests

`node --test`: **17 Tests bestanden**, Windows und Node.js 24.21.0. Temporäre Datenbanken, zufällige Testpasswörter, keine Änderungen echter Spielkonten.

Die neuen Tests in `test/extensions.test.mjs` prüfen:

1. A und B sehen denselben Eintrag, C nicht – Listen, Details und Bilder.
2. Nur-Spielleitungs-Einträge, sichere neue Standardwerte und geheime Notizen.
3. Besitzer C bei Freigabe A+B; Besitzerwechsel verändert keine Freigabe.
4. Direkte API-/Bildaufrufe, abgemeldete Zugriffe, Entwürfe, fremde Bild-IDs und entfernte Bilder.
5. Bestätigungen je Spieler und Ankündigung, einschließlich zweier Spieler desselben Reichs.
6. Abgemeldeter Spieler erhält nach Veröffentlichung und Login die ausstehende Ankündigung.
7. Erneute Ankündigung erzeugt neue Bestätigungen; Textänderung keine Wiederholung.
8. Entzug sperrt Listen, Details, Ankündigungen, Bestätigung und Bilder.
9. Aktionen/Antworten sind für andere Spieler auch desselben Reichs unsichtbar.
10. Gefälschte Absender-, Reichs-, Runden- und Statusfelder werden bei Einreichung ignoriert.
11. Migration anhand eines unabhängigen Version-1-Schemas: Freigaben, Eigentum, Bilder, Passwörter, Ressourcen, Rundenzähler und Protokoll bleiben erhalten. Wiederholtes Öffnen migriert nicht erneut.

Zusätzlich: getrennte Wirtschafts-/Forschungsfreigaben, leere Auswahl, Event-Warteschlange, neu berechtigte Spieler, Bildlimits/-format, Sicherung mit Eventbildern, private Antwort-Hinweise, getrennte Lesemarkierung/Bearbeitung, keine Spielwertänderung durch Nachrichten sowie Produktionskonfiguration und begrenztes Proxy-Vertrauen.

Die bisherigen Funktionstests bestehen weiterhin: Login/CSRF, Passwortwechsel/Sitzungswiderruf, Ressourcen-Audit, negative Vorräte, Rollback bei absichtlich ausgelöstem Datenbankfehler, parallele idempotente Rundenbestätigung, Besitzwechsel, Persistenz, Sicherung und lokale Einrichtung/Passwortrettung. Testdaten verwenden nun ausdrückliche Reichsauswahlen entsprechend der neuen Rechtevergabe.

## Edge-Browserdurchlauf

`node scripts/browser-check.mjs`: **Bestanden**.

- Bisherige Anmeldung und Spielverwaltung einschließlich Rundenbuchung.
- Neue geheime Standardwerte und Verwendung der Reichsauswahl.
- Bericht zu Event bearbeitet, Zielreich ausgewählt, veröffentlicht und Pop-up aktiviert.
- Bildvorschau, Entfernen vor Speichern, erneutes Hinzufügen und Vergrößerung.
- Pop-up bei Spielerlogin; Bestätigung übersteht Neuladen.
- Spieleraktion und Antwort durch getrennte GM-Sitzung; Hinweis ohne Neuladen.
- Erneute Ankündigung während Spieler online bleibt, anschließend Rechteentzug: Pop-up schließt beim nächsten Poll.
- Mobile Ansicht mit 390 Pixeln ohne horizontalen Seitenüberlauf; Passwortwechsel.
- Keine erfassten JavaScript-Laufzeitfehler.

Screenshots unter `.qa`, unter anderem `event-popup-desktop.png`. Alle Browserdaten sind temporär.

## Grenzen

Docker/Caddy sind hier nicht installiert. Container-Build, Compose-Laufzeit, systemd, Linux-Betrieb, echte Domain, Zertifikatsausstellung, Firewall und öffentlicher externer Zugriff wurden nicht getestet. Eine lokale HTTP-Simulation prüft die Proxy-/HTTPS-Headerregeln, ersetzt aber keinen Test auf dem späteren Server. Die Bereitstellung und Wiederherstellung dort müssen noch geprüft werden.

Der vorhandene lokale Serverprozess wird nicht automatisch beendet. Nach Sicherung muss er mit der neuen Version neu gestartet werden. Dann läuft die Migration, und Benutzer melden sich mit unveränderten Passwörtern erneut an. Das Migrationstest-Schema deckt den bisherigen Programmstand ab, nicht beliebige manuelle Datenbankänderungen.

Keine Zusicherung vollständiger Sicherheit; die beschriebenen Rechte- und Betriebsrisiken wurden gezielt getestet.
