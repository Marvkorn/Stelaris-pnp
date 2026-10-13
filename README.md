# Sternarchiv · Version 2

Private deutschsprachige PnP-Webapp mit Node.js 24, SQLite und lokalen Bildern. Die bestehende Anwendung wurde erweitert, nicht ersetzt. Es gibt keinen verpflichtenden Cloudhost, keine kostenpflichtige API und keinen Build-Schritt. Tailscale ist optional.

## Bestehende Installation aktualisieren

1. Bisheriges Serverfenster mit **Strg+C** beenden. Nicht mit der alten Serverversion weiterarbeiten.
2. **Datensicherung.cmd** doppelklicken. Die Sicherung verändert oder migriert die Quelldatenbank nicht.
3. **Start.cmd** starten. Die Datenbank wird automatisch auf Version 2 erweitert; vorher entsteht zusätzlich eine Datenbankkopie unter `data/migration-backups`.
4. **http://localhost:3000** öffnen, mit **Strg+F5** neu laden und mit deinen bisherigen Zugangsdaten anmelden.

**Keine neue Einrichtung und kein Zurücksetzen erforderlich.** Konten, Passwörter, Reiche, Bilder, Vorräte, Rundenzähler und Protokoll bleiben erhalten. Bestehende Sitzungen werden einmalig beendet.

Alte reichsspezifische Freigaben werden zur Auswahl mit genau dem bisherigen Reich. Öffentliche/geheime Freigaben bleiben erhalten. Einträge ohne zugeordnetes Reich bleiben bei reichsspezifischer Freigabe für Spieler unsichtbar. Alte Berichte bleiben veröffentlicht, erzeugen aber keine unerwarteten Pop-ups. Ihre Bilder werden übernommen.

## Neue Installation und täglicher Start

1. Falls noch nicht vorhanden: **Node.js 24 LTS** von [nodejs.org](https://nodejs.org/) installieren.
2. **Einrichtung.cmd** doppelklicken, eigenen Benutzernamen und Passwort mit mindestens zwölf Zeichen festlegen. Die Passworteingabe bleibt unsichtbar.
3. **Start.cmd** starten und das Fenster offen lassen.
4. **http://localhost:3000** öffnen und anmelden.

Zum Beenden im Serverfenster **Strg+C** drücken. Erfolgreiche Änderungen sind sofort gespeichert. Beim nächsten Mal genügt `Start.cmd`. Kein `npm install`, Python oder Docker nötig. Keine Standardpasswörter, offene Registrierung oder automatischen Demo-Zugänge.

## Sichtbarkeit und Eigentum

Unter **Bearbeiten → Sichtbarkeit** gibt es:

| Einstellung | Zugriff |
|---|---|
| Nur Spielleitung | Nur die Spielleitung |
| Alle Spieler | Alle angemeldeten Spieler |
| Ausgewählte Reiche | Spieler, die aktuell einem der angekreuzten Reiche zugeordnet sind |

Mehrere Reiche sind möglich. **Eine leere Auswahl ist niemals öffentlich. Neue Einträge beginnen geheim.** Der Besitzer eines Planeten/einer Flotte erhält kein automatisches Zugriffsrecht. Besitz und Sichtbarkeit sind unabhängig.

Reichsprofil, Wirtschaft und Forschung haben eigene Freigaben. Wirtschaft/Forschung sind zusätzlich an die Sichtbarkeit des Reichsprofils gebunden. Ein neu erstelltes Reich muss zunächst gespeichert werden, bevor es selbst in einer Reichsauswahl angekreuzt werden kann.

Planeten, Flotten und Events haben eigene Freigaben. Gehört ein sichtbarer Eintrag zu einem geheimen Reich, wird dessen Zuordnung Spielern nicht mitgeliefert. Das Feld **Geheime Spielleiternotizen** wird Spielern unabhängig von der Eintragssichtbarkeit niemals ausgeliefert. Geheimnisse deshalb nicht in öffentliche Beschreibungstexte schreiben.

Listen und damit die Browsersuche werden serverseitig gefiltert. Details, Bilder und Benachrichtigungen prüfen aktuelle Rechte erneut. Bereits gelesene oder heruntergeladene Informationen können durch späteren Rechteentzug nicht zurückgerufen werden.

## Events und Spieler-Pop-ups

Die bisherigen Berichte liegen im gemeinsamen Tab **Events & Berichte**.

1. **Event anlegen**: Titel und Beschreibung eintragen. Absätze bleiben erhalten.
2. Sichtbarkeit und Zielreiche auswählen. Das thematische Reich oben ist keine Freigabe.
3. Optional bis zu **fünf Bilder mit je maximal 5 MB** hinzufügen. PNG, JPEG und WebP bis 24 Megapixel sind erlaubt. Vorschauen zeigen die Auswahl; **Entfernen** nimmt ein Bild vor dem Speichern heraus. Der Server prüft Dateisignatur, Formatstruktur und Abmessungen. SVG und ausführbare Dateien sind nicht erlaubt.
4. Als **Entwurf** speichern. Entwürfe sieht ausschließlich die Spielleitung, auch bei öffentlicher Zielgruppe.
5. Bewusst veröffentlichen: bearbeiten, **Status → Veröffentlicht** wählen und speichern. **Bei Veröffentlichung als Pop-up anzeigen** bei Bedarf aktivieren.

Online-Spieler erhalten ausstehende Pop-ups normalerweise innerhalb von drei Sekunden, wenn die Seite aktiv und kein Bearbeitungsfenster geöffnet ist. Offline-Spieler erhalten sie bei der nächsten Anmeldung. Mehrere Events werden nacheinander angezeigt. Bilder im Pop-up und Verlauf lassen sich anklicken und vergrößern.

**Gelesen / Schließen** bestätigt nur die aktuelle Ankündigung für diesen Spieler. Die Bestätigung bleibt nach Neuladen/Login erhalten. Das Event bleibt im Verlauf sichtbar, solange veröffentlicht und freigegeben.

Text-/Bildänderungen erzeugen keine neue Ankündigung. **Details öffnen → Erneut ankündigen** erzeugt gezielt eine neue Ankündigung mit eigenen Bestätigungen. Dafür müssen Veröffentlichung und Pop-up-Option aktiv sein. Zugestellt wird jeweils die neueste Ankündigung eines Events; alte Bestätigungen bleiben für die Spielleitung erhalten.

Neu berechtigte Spieler erhalten die aktuelle, noch unbestätigte Ankündigung. Entzug der Freigabe, Rücknahme der Veröffentlichung und Deaktivieren der Pop-up-Option verhindern weitere Zustellung. Ein bereits geöffnetes, nicht mehr berechtigtes Pop-up schließt beim nächsten Poll; Hintergrundtabs prüfen beim Zurückwechseln.

Unter **Details öffnen → Ankündigungen und Bestätigungen** sieht die Spielleitung pro Ankündigung die aktuell berechtigten Spieler mit **bestätigt / noch nicht bestätigt**. Das ist kein Nachweis dafür, dass jemand den Text gelesen hat.

## Private Aktionen

**Spieler:** **Aktionen → Aktion senden**, Betreff und Beschreibung eingeben. Der Server erfasst Spieler, Reich, Zeitpunkt und Runde automatisch. Nur dieser Spieler und die Spielleitung sehen die Nachricht – auch Mitspieler desselben Reichs nicht. Nach dem Senden sind Bearbeiten/Löschen durch Spieler nicht möglich.

**Spielleitung:** **Aktionen** enthält alle Nachrichten mit Filtern nach Spieler, Reich und Status. Der Zähler im Tab zeigt neue ungelesene Aktionen. Öffnen markiert sie als **von der Spielleitung gelesen**, erledigt sie aber nicht. **Offen**, **In Bearbeitung** und **Erledigt** werden separat eingestellt. Im Detailfenster kannst du privat antworten; Antworten werden als Verlauf angehängt.

Der Spieler erhält einen **Neue Antwort**-Hinweis und einen Zähler. Beim Öffnen werden die angezeigten Antworten bestätigt. Das bei Einreichung erfasste Reich bleibt an der Nachricht erhalten, selbst wenn der Spieler später wechselt; der Zugriff bleibt an sein persönliches Konto gebunden.

Aktionen sind Nachrichten. Sie buchen keine Ressourcen, bewegen keine Flotten und lösen keine Runde aus.

## Bestehende Spielverwaltung

- **Reiche:** Name, Spezies, Beschreibung, Wappen/Bild, Ressourcen, Forschung und geheime Notizen. Spieler unter **Spielerzugänge** zuordnen.
- **Ressourcen:** Energie, Mineralien, Legierungen, Nahrung/Versorgung und Einfluss. Vorräte setzen oder Zu-/Abgänge buchen; Netto-Rundeneinkommen direkt bearbeiten. Zeitpunkt, Urheber, alte/neue Werte und optionaler Grund erscheinen im Protokoll.
- **Forschung:** Leistung und ein aktives Projekt je Reich. Laufende Projekte erhalten die volle Leistung; überschüssige Punkte bleiben sichtbar. Abgeschlossene Projekte erhalten keine weiteren Punkte. Neue Projekte und Anfangsfortschritt legt die Spielleitung fest.
- **Planeten:** Name, Karten-ID, Typ, Besitzer, Beschreibung und Bild.
- **Flotten:** Position, Typ, Besitzer, Beschreibung und Schiffe mit Name, Typ und frei formulierbarem Zustand. Freigaben gelten für die ganze Flotte.

**Kommandozentrale → Nächste Runde** zeigt zuerst alle Veränderungen. Erst die Bestätigung bucht die gesamte Runde in einer Transaktion. Negative Vorräte bleiben bestehen, ohne automatische Strafen. Doppelklicks/wiederholte Bestätigungen buchen nicht doppelt. Vorschauen gelten 15 Minuten; Änderungen an Spieldaten machen ältere Vorschauen ungültig.

Spielwerte sind ganze Zahlen zwischen −1 Milliarde und +1 Milliarde; Forschungswerte nicht negativ, Forschungsziele mindestens 1. Versionsprüfungen verhindern unbemerktes Überschreiben gleichzeitiger Änderungen. Bei einem Konflikt Formular schließen, aktualisieren und erneut bearbeiten. Nachrichten/Bestätigungen verändern keine Spielwerte oder Spielrevision.

## Konten

**Spielerzugänge → Spieler anlegen** erzeugt Spieler ohne Verwaltungsrechte. Sie können freigegebene Inhalte lesen, eigene Aktionen senden und ihr Passwort über **Konto** ändern. Passwortreset oder Reichsneuzuordnung beendet alte Sitzungen dieses Spielers.

Spielleiterpasswort vergessen: **Spielleiter-Passwort.cmd** auf dem Server-PC starten. Unter Linux: `node scripts/setup.mjs --reset` mit dem richtigen `DATA_DIR`. Niemand benötigt dein Spielleiterpasswort, um als Spieler teilzunehmen.

## Datensicherung

**Datensicherung.cmd** erzeugt unter `backups` einen neuen Ordner mit SQLite-Datenbank und sämtlichen Bildern. Events, Ankündigungen, Bestätigungen, Aktionen und Antworten sind darin enthalten. Die SQLite-Backup-Funktion kann auch bei laufender App verwendet werden. Sicherung zusätzlich auf einen getrennten Datenträger kopieren.

Alle dauerhaften Daten liegen standardmäßig unter `data`. Ersetzte/entfernte Bilddateien bleiben zunächst unreferenziert auf der Festplatte, sind aber nicht über die früheren Bildrouten erreichbar. Frühere Datenbanksicherungen können diese Dateien weiterhin verwenden.

Wiederherstellung: Server beenden, bisherigen `data`-Ordner sicher umbenennen, neuen `data`-Ordner mit gesicherter `sternarchiv.sqlite` und vollständigem `images`-Ordner anlegen, Server starten und Daten prüfen. Nicht die Hauptdatei einer laufenden SQLite-Datenbank allein kopieren; `-wal` kann noch Daten enthalten. Beim Wiederherstellen keine alten `-wal`-/`-shm`-Dateien vermischen. Ein Downgrade auf Version 1 erfordert auch eine passende Sicherung.

## Hosting und optionale Tailscale-Nutzung

**[HOSTING.md](HOSTING.md)** beschreibt Linux, Docker Compose mit dauerhaften Volumes, Caddy mit HTTPS, alternativ systemd, Datenübernahme, Konfiguration und Backups. Es wurde nichts bestellt oder öffentlich deployt. Für später fehlen noch echter Server, Domain, DNS/Firewall und externe Betriebstests. Tailscale ist keine Voraussetzung für Anmeldung oder Nutzung.

Für bisherigen privaten Tailscale-Betrieb kann **Tailscale-Freigabe.cmd** weiterverwendet werden. Beide Seiten brauchen Tailscale, der Spieler eine Gerätefreigabe und zusätzlich seinen Sternarchiv-Zugang. Eine bereits im Hintergrund eingerichtete Freigabe bleibt aktiv; mit `"C:\Program Files\Tailscale\tailscale.exe" serve --https=443 off` lässt sie sich beenden. Das Stoppen des Website-Servers beendet in jedem Fall die Auslieferung der Website.

## Projekt und Tests

`server.mjs` enthält HTTP/API und Anmeldung. `lib/database.mjs` und `lib/migrations.mjs` verwalten SQLite und Migrationen; `lib/auth.mjs` die zentrale Rechteprüfung. Spielregeln liegen in `lib/game.mjs`, Nachrichten/Events in `lib/communication.mjs`, Bildprüfung in `lib/images.mjs`, Betriebskonfiguration in `lib/config.mjs`. Die bestehende Oberfläche liegt unter `public`, Einrichtung/Backup unter `scripts`, Deployment-Vorlagen unter `deploy`.

**Tests.cmd** oder `npm test` prüft mit temporären Datenbanken. `node scripts/browser-check.mjs` testet die Oberfläche unter Windows mit installiertem Edge in einem unsichtbaren separaten Profil. Keine echten Spielkonten werden verwendet. Screenshots liegen unter `.qa`.

Ergebnisse und Grenzen: **[PRUEFBERICHT.md](PRUEFBERICHT.md)**.
