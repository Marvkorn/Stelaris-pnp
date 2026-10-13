# Späterer Betrieb auf einem Linux-Server

Diese Dateien bereiten das Hosting vor. Es wurde kein Server bestellt, keine Domain registriert und kein öffentliches Deployment ausgeführt. Die Anwendung braucht weder Tailscale noch eine kostenpflichtige API.

## Voraussetzungen

- Ein Linux-Server mit ausreichend persistentem Speicher und einem aktuellen Docker mit Compose, alternativ Node.js 24 LTS und Caddy.
- Eine eigene Domain/Subdomain, deren DNS-Eintrag auf diesen Server zeigt.
- Eingehende TCP-Ports 80 und 443 für Caddy; SSH nur für die Administration. Port 3000 nicht öffentlich freigeben.
- Datensicherung außerhalb des Servers, Betriebssystem- und Laufzeitupdates.

Die SQLite-Architektur ist für eine private Gruppe und genau **eine laufende App-Instanz** vorgesehen. Keine mehreren Replikate, kein gemeinsames SQLite-Verzeichnis über ein Netzlaufwerk.

## Variante A: Docker Compose

Im Projektordner befinden sich `Dockerfile`, `compose.yaml` und `deploy/Caddyfile`. Die App hat keinen veröffentlichten Host-Port. Nur Caddy ist von außen erreichbar. Caddy übernimmt Zertifikate und HTTPS; die App akzeptiert Proxy-Header ausschließlich von der fest eingetragenen Caddy-IP `172.30.87.2`.

1. Projektdateien auf den Server kopieren. `.git`, `.qa`, echte `.env`-Dateien und Kampagnendaten gehören nicht in das Container-Image.
2. `.env.production.example` nach `.env` kopieren. `DOMAIN` und `PUBLIC_BASE_URL` durch die echte Domain ersetzen. `DOMAIN` enthält weder `https://` noch einen Pfad. Keine Beispiel-Domain unverändert verwenden.
3. Image erstellen:

   ```sh
   docker compose build
   ```

4. Bei einer **neuen Kampagne** einmalig den Spielleiter interaktiv anlegen:

   ```sh
   docker compose run --rm --no-deps app node scripts/setup.mjs
   ```

   Es gibt keine automatischen Konten und keine Standardpasswörter. Bei Übernahme der bestehenden Kampagne stattdessen die Daten wie unten beschrieben importieren; deren Konten bleiben erhalten.

5. Erst wenn Domain, Firewall und Daten eingerichtet sind, bewusst starten:

   ```sh
   docker compose up -d
   docker compose logs --tail=100 app caddy
   ```

6. Die echte HTTPS-Adresse von einem anderen Internetanschluss prüfen: Login als Spielleiter und als Spieler, ein privates Bild, Pop-up, Aktion und Antwort. Auch ein absichtlich unberechtigter Zugriff muss abgewiesen werden.

Die Volumes `campaign`, `backups`, `caddy_data` und `caddy_config` bleiben bei normalen Container-Neustarts und Updates erhalten. **Nicht `docker compose down --volumes` verwenden**, wenn die Daten erhalten bleiben sollen. Auch das Löschen von Docker-Volumes löscht deren Inhalte. Das Compose-Projekt heißt fest `sternarchiv`.

Falls das Netz `172.30.87.0/24` bereits auf dem Server verwendet wird, passe das Netz, Caddys feste IP und `TRUSTED_PROXIES` gemeinsam an. Vertraue nicht pauschal allen Proxys oder ganzen öffentlichen Netzen.

## Vorhandene Windows-Kampagne übernehmen

1. Auf Windows den bisherigen Server beenden und `Datensicherung.cmd` ausführen. Die neue Backup-Funktion verändert und migriert die Quelldatenbank nicht.
2. Einen leeren Ordner `import` neben `compose.yaml` auf dem Linux-Server anlegen. Die gesicherte Datei `sternarchiv.sqlite` und den vollständigen Ordner `images` dorthin übertragen. Den Ordner privat halten.
3. Vor dem allerersten Start das **leere** Datenvolume befüllen:

   ```sh
   docker compose run --rm --no-deps -v "$PWD/import:/import:ro" app node --input-type=module -e 'import fs from "node:fs"; if(fs.existsSync("/app/data/sternarchiv.sqlite"))throw Error("Zieldatenbank existiert bereits; Import abgebrochen"); fs.copyFileSync("/import/sternarchiv.sqlite","/app/data/sternarchiv.sqlite"); fs.cpSync("/import/images","/app/data/images",{recursive:true});'
   ```

4. Danach die App starten. Notwendige Migrationen laufen automatisch und erzeugen vorher eine zusätzliche Datenbankkopie im Datenverzeichnis. Alte Konten behalten ihre Passwörter, müssen sich aber neu anmelden.
5. Stichproben prüfen und erst dann den alten Windows-Betrieb ablösen. Nicht parallel mit zwei voneinander abweichenden Kampagnenständen spielen.

## Updates und Backups mit Docker

Vor einem Update eine Sicherung erstellen:

```sh
docker compose exec app node scripts/backup.mjs
```

Die Ausgabe nennt den neu erstellten Ordner unter `/app/backups`. Für eine Sicherung außerhalb des Servers kopierst du ihn z. B. mit `docker compose cp app:/app/backups ./export-backups` auf den Host und überträgst ihn auf einen getrennten Datenträger/Backup-Server. Das Backup-Volume allein schützt nicht vor Serververlust.

Dann App stoppen, neue Projektdateien einspielen und neu erstellen:

```sh
docker compose stop app
docker compose build app
docker compose up -d app
```

Für eine Wiederherstellung App stoppen und die gewünschte Datenbank samt Bildern in ein leeres Kampagnenverzeichnis/Volume zurückspielen. Alte SQLite-WAL-Dateien nicht mit einer zurückgespielten Hauptdatei vermischen. Der Programmstand muss zur Datenbankversion passen; ein Downgrade auf Version 1 erfordert auch eine passende Version-1-Sicherung.

## Variante B: Linux ohne Docker

1. Node.js 24 LTS und Caddy installieren. Einen eigenen Benutzer `sternarchiv` ohne interaktive Administratorrechte anlegen.
2. Code unter `/opt/sternarchiv` ablegen. Datenverzeichnis `/var/lib/sternarchiv/data` und Sicherungsverzeichnis `/var/lib/sternarchiv/backups` anlegen; nur `sternarchiv` erhält Schreibrechte darauf.
3. `/etc/sternarchiv.env` mit eingeschränkten Dateirechten anlegen:

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3000
   PUBLIC_BASE_URL=https://pnp.example.com
   DATA_DIR=/var/lib/sternarchiv/data
   BACKUP_DIR=/var/lib/sternarchiv/backups
   SECURE_COOKIE=1
   TRUSTED_PROXIES=127.0.0.1,::1
   ```

4. Für eine neue Kampagne als Benutzer `sternarchiv` mit `DATA_DIR=/var/lib/sternarchiv/data node /opt/sternarchiv/scripts/setup.mjs` einrichten, ansonsten eine Sicherung importieren.
5. `deploy/sternarchiv.service` nach `/etc/systemd/system/sternarchiv.service` kopieren. Den Node-Pfad prüfen und gegebenenfalls anpassen. Der Dienst lädt `/etc/sternarchiv.env`.
6. In Caddy die echte Domain verwenden und an `127.0.0.1:3000` weiterleiten:

   ```caddyfile
   pnp.example.com {
       request_body {
           max_size 36MB
       }
       reverse_proxy 127.0.0.1:3000 {
           header_up X-Forwarded-For {remote_host}
           header_up X-Forwarded-Proto {scheme}
       }
   }
   ```

7. Caddy-Konfiguration mit `caddy validate` prüfen, systemd neu laden und die Dienste bewusst aktivieren. Danach dieselben externen Funktionsprüfungen wie bei Docker durchführen.

## Konfiguration und Sicherheitsgrenzen

- `.env` ist optional und wird beim lokalen Start geladen. Bereits gesetzte Prozessumgebungsvariablen haben Vorrang. Echte `.env`-Dateien sind aus Git und dem Docker-Build ausgeschlossen.
- `PUBLIC_BASE_URL` ist der erlaubte Ursprung und Host. In Produktion sind HTTPS, ein passender Host und ein ausdrücklich vertrauenswürdiger Proxy verpflichtend. Falsche Ursprünge werden bei Schreibzugriffen zurückgewiesen.
- `TRUSTED_PROXIES` enthält einzelne IP-Adressen. Nur von ihnen wird ein einzelner, gültiger `X-Forwarded-For`-Wert für Login-Limits übernommen. Caddy überschreibt den Header. Andere Forwarded-Header ändern weder Hostfreigaben noch URLs.
- Es gibt keine CORS-Freigabe. Cookies sind `HttpOnly` und `SameSite=Strict`; in Produktion immer zusätzlich `Secure`. Sitzungen laufen nach zwölf Stunden ab.
- Loginbegrenzungen liegen in SQLite und überstehen einen Neustart. Schlüssel werden gehasht; nach acht Fehlversuchen pro Benutzername bzw. 40 pro Quell-IP gilt die Wartefrist.
- Es ist kein dauerhaftes Signiergeheimnis erforderlich: Die App nutzt zufällige Sitzungstoken mit serverseitiger Speicherung der Hashes. Passwörter werden nur als scrypt-Hashes gespeichert. Falls später API-Schlüssel hinzukommen, ausschließlich über private Umgebungsvariablen/Secret-Dateien einbinden.
- Datenbank, Bilder, Migrationkopien und Backups sind keine öffentlich ausgelieferten Verzeichnisse. Bilder laufen durch dieselbe Berechtigungsprüfung wie ihre Einträge.
- Der eingebaute Node-Server läuft ohne Debug-Modus und ohne automatische Demo-Zugänge. Caddy gehört davor; keine zusätzlichen öffentlichen App-Ports freigeben.

Diese Vorbereitung ersetzt keinen Test auf dem tatsächlichen Server. Insbesondere DNS, Zertifikatsausstellung, Firewall, Dateirechte und externe Wiederherstellung müssen dort geprüft werden.

Referenzen: [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Docker-Volumes](https://docs.docker.com/engine/storage/volumes/).
