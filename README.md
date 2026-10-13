# Sternarchiv · Version 3

## Erweiterungen in Version 3

**Ressourcen:** Im Reich unter **Vorräte & Einkommen** jederzeit Vorräte setzen oder positive/negative Änderungen buchen. Die Vorschau zeigt den bisherigen Wert, die Änderung und den neuen Wert; eine optionale Begründung wird zusammen mit Zeitpunkt, Urheber und Reich protokolliert. Das manuelle Basiseinkommen steht getrennt von Gebäudeproduktion und Unterhalt. Unter **Ressourcentypen** zusätzliche Typen mit Beschreibung und Symbol anlegen und einzelnen Reichen zuweisen. **Archivieren** entfernt keine Vorräte oder Buchungen und stoppt keine bestehenden Gebäudeeffekte; es verhindert weitere manuelle Zuweisungen. Die fünf ursprünglichen Basisressourcen bleiben erhalten. Spieler können keine Ressourcen ändern.

**Gebäude:** Unter **Gebäude** Vorlagen mit eigener Produktion, Unterhalt, Standardbauzeit und optionalem Bild anlegen. Kraftwerk, Mine, Landwirtschaft, Legierungswerk und Forschungslabor sind mögliche Namen, keine vorgegebene Spielbalance. Auf einem Planeten mehrere Gebäude derselben Vorlage hinzufügen, auch direkt aus dessen Detailansicht. Jede Instanz speichert eigene Werte: Eine spätere Vorlagenänderung verändert bestehende Gebäude nicht. Es gibt keine automatische nachträgliche Übernahme neuer Vorlagenwerte.

**Bauzeiten:** Beim Anlegen eine nicht negative ganze Zahl von Spielrunden wählen. Das Formular zeigt Fertigstellungsrunde und erste Auszahlung. Unter **Bauzeit / Status** Bauaufträge abbrechen, verbleibende Runden ändern oder sofort fertigstellen. Fertige Gebäude aktivieren, stilllegen oder dauerhaft abreißen. Keine automatischen Baukosten oder Rückerstattungen. Planeten mit Gebäudehistorie können nicht gelöscht werden; sie können weiterhin bearbeitet oder verborgen werden.

**Rundenabrechnung:** Zuerst werden manuelle Basis + bisher aktive Produktion − bisher aktiver Unterhalt verbucht. Danach steigt die Rundennummer, und fällige Gebäude werden aktiv. Ein in Runde 5 begonnener Bau mit zwei Runden Bauzeit ist in Runde 6 noch im Bau, wird beim Wechsel zu Runde 7 aktiv und zahlt beim Wechsel zu Runde 8 erstmals aus. Die Vorschau zeigt Buchungen, Fertigstellungen und das Einkommen der neuen Runde. Bestätigung und Fertigstellungen laufen in einer gemeinsamen Transaktion; wiederholte Bestätigung bucht nichts doppelt. Ressourcenbuchungen schalten keine Bauzeit weiter. Besitzerwechsel übertragen zukünftige Gebäudeeffekte an das neue Reich.

Forschung bleibt Projektleistung statt Ressourcenvorrat: Forschungsgebäude ergänzen die manuelle Forschungsleistung, abgeschlossene Projekte erhalten weiterhin keine zusätzlichen Punkte. Gesamtleistung unter null wird auf null begrenzt. Einfluss bleibt als bestehende Ressource erhalten.

**Forschung & Entdeckungen:** Fünf feste Bereiche: **Spezielle Ressourcen entdeckt**, **Rassen entdeckt**, **Planeten entdeckt**, **Erforschte Dinge**, **Sonstiges**. Die Spielleitung legt Einträge mit Titel, Text, Entdeckungsrunde, optional bis zu fünf Bildern und der bestehenden Sichtbarkeit an. Unter „Erforschte Dinge“ bleiben Forschungsprojekte samt Fortschritt eingebunden. Verknüpfungen referenzieren bestehende Ressourcen, Planeten, Reichsspezies und Forschungsprojekte; geheime verknüpfte Daten werden nicht mit ausgeliefert. Es gibt keinen zusätzlichen eigenständigen Rassen- oder Technologiekatalog. Ein Projektlink verweist auf das aktuelle Forschungsprojekt des Reichs; dauerhaft erforschtes Wissen als eigenen Entdeckungstext festhalten.

**Gesetzbücher:** Im Reich und im Tab **Gesetzbücher** steht die Verfassung zuerst, anschließend die Gesetze in Nummernreihenfolge. Das eigene Gesetzbuch bleibt unabhängig von der Profilfreigabe zugänglich. Spieler reichen neue Gesetze oder Änderungen als Entwurf oder zur Genehmigung ein. Nur der Einreichende und die Spielleitung sehen Vorschläge. Die Spielleitung kann im Eingang genehmigen, ablehnen oder mit Kommentar zurückgeben. Entscheidungen erzeugen einen persönlichen Hinweis und einen Navigationszähler. Genehmigte Änderungen behalten ihre Nummer und erzeugen eine neue veröffentlichte Version. Bis dahin gilt die alte Fassung. Aufgehobene Gesetze behalten Nummer und Historie.

Nummern werden erst bei Genehmigung und getrennt pro Reich vergeben. Ablehnungen verbrauchen keine Nummer. Gleichzeitige Genehmigungen werden serialisiert; erneutes Genehmigen veröffentlicht denselben Vorschlag nicht doppelt. Eine zwischenzeitlich geänderte Gesetzesfassung muss erneut geprüft werden.

**Fremde Gesetzbücher:** Die Spielleitung aktiviert **Veröffentlichung** am Gesetzbuch und verwaltet unter **Reichsentdeckung verwalten** die gerichtete Beziehung „A kennt B“. A sieht das veröffentlichte Gesetzbuch von B; die Gegenrichtung gilt nicht automatisch. Ressourcen, Flotten, Geheimnisse und private Vorschläge werden dadurch nicht freigegeben.

**Karte:** Mehrere benannte Kartenbilder hochladen und jeweils nur der Spielleitung, allen Spielern oder ausgewählten Reichen freigeben. **Karte öffnen** bietet Zoom, Verschieben per Maus/Finger und Scrollleisten. Für eine geheime Gesamtkarte „Nur Spielleitung“ wählen und für Spieler separate Teilkarten hochladen. Alle Bildzugriffe werden serverseitig geprüft; kein öffentlich erreichbarer Originaldateipfad. PNG/JPEG/WebP mit maximal 5 MB und 24 Megapixel pro Bild.

**Nicht umgesetzt:** Interaktive Aufdeckung einzelner Gebiete derselben Gesamtkarte, serverseitig maskierte Ausschnitte und Spielermarker/-notizen. Die vollständige einfache Kartenansicht ist unabhängig davon nutzbar. Bereits berechtigt heruntergeladene Bilder lassen sich durch einen späteren Rechteentzug nicht zurückholen.

## Von Version 2 auf Version 3 aktualisieren

1. Alten Server beenden und **Datensicherung.cmd** ausführen.
2. **Start.cmd** starten (Node.js 24; kein `npm install` nötig).
3. **http://localhost:3000** mit **Strg+F5** neu laden.

Beim Start wird die Datenbank automatisch auf Schema 3 erweitert. Zuvor entsteht unter `data/migration-backups` eine vollständige SQLite-Kopie `before-v3-….sqlite`. Konten, Sitzungen, Spielstände, Freigaben, Events, Bestätigungen, Aktionen und Antworten aus Version 2 bleiben bestehen. Keine erneute Einrichtung und kein Zurücksetzen. Die normale Sicherung enthält zusätzlich sämtliche Bilder. Ein direkter Umstieg von Version 1 führt die Migrationen 2 und 3 nacheinander aus; dabei gelten zusätzlich die nachfolgenden Hinweise zu Version 1.

Prüfergebnisse und verbleibende Betriebsgrenzen stehen in **[PRUEFBERICHT.md](PRUEFBERICHT.md)**.

Private deutschsprachige PnP-Webapp mit Node.js 24, SQLite und lokalen Bildern. Die bestehende Anwendung wurde erweitert, nicht ersetzt. Es gibt keinen verpflichtenden Cloudhost, keine kostenpflichtige API und keinen Build-Schritt. Tailscale ist optional.

## Ältere Installation von Version 1 aktualisieren

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
