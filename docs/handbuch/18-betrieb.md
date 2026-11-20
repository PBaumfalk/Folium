# 18 — Betrieb und Updates

[← Handbuch](README.md) · [Weiter: 19 — KI-Anbindung](19-ki-anbindung.md)

> Dieses Kapitel richtet sich an die IT bzw. an Administratoren des Servers. Alle Befehle im Projektordner ausführen, z. B. `/opt/folium`.

## Täglicher Betrieb

| Aufgabe | Befehl |
| --- | --- |
| Status | `docker compose ps` (Spalte STATUS bei `folium`: `healthy`) |
| Logs | `docker compose logs -f folium` |
| Neustart | `docker compose restart folium` |
| Geänderte `.env` übernehmen | `docker compose up -d` |
| Stoppen / Starten | `docker compose down` / `docker compose up -d` (Daten bleiben im Volume) |
| Gesundheit beider Ports | `docker compose exec folium folium health` |
| Sicherung jetzt | `docker compose exec folium folium sicherung` |

> **Niemals `docker compose down -v`.** Die Option `-v` löscht das Volume `folium-data` und damit Datenbank, Bilder **und** alle Sicherungen darin. `docker compose down` ohne `-v` ist unbedenklich. Ebenso `docker volume prune` und `docker system prune --volumes` nur, wenn Sie genau wissen, welche Volumes betroffen sind.

## Wartung, die Folium selbst erledigt

- **Stündlich** (und beim Start): Seiten nach Ablauf der Papierkorbfrist endgültig löschen, Statistik nach Ablauf der Aufbewahrung löschen, abgelaufene Sitzungen entfernen.
- **Alle `BACKUP_INTERVAL_HOURS` Stunden:** automatische Sicherung, ältere automatische Sicherungen über `BACKUP_KEEP` hinaus löschen ([Kapitel 17](17-sicherung.md)).
- **Alle 3 Sekunden:** gesammelte Aufrufe und Klicks in die Datenbank schreiben. Beim geordneten Beenden (`docker compose stop`/`restart`) schreibt Folium den Rest noch weg.

Nicht automatisch gelöscht werden Protokoll, Liste der KI-Aufrufe, manuelle Sicherungen und Sicherungen vor Migrationen oder Wiederherstellungen.

## Update auf eine neue Version

```bash
cd /opt/folium
docker compose exec folium folium sicherung      # zusätzliche Sicherung von Hand
docker tag folium:latest folium:vorher           # bisheriges Image für den Rückweg aufheben
git pull
docker compose up -d --build
docker compose ps                                # nach kurzer Zeit: healthy
docker compose logs folium | grep -i migration   # zeigt ausgeführte Migrationen
docker compose exec folium folium version
```

Was dabei passiert:

- Datenbankmigrationen laufen beim Start automatisch, jede in einer Transaktion. Schlägt eine fehl, bleibt der alte Stand erhalten und Folium startet nicht.
- Vor der ersten Migration einer bestehenden Datenbank legt Folium `/data/backups/vor-migration-v<n>-<zeitstempel>.db` an (Log: „Sicherung vor Datenbankmigration angelegt“). `<n>` ist die bisherige Schemaversion.
- Ein **Downgrade** auf eine ältere Version mit neuerer Datenbank verweigert Folium: „Die Datenbank hat Schemaversion …, diese Folium-Version kennt nur bis … Ein Downgrade ist nicht möglich …“. Der Rückweg führt über die Sicherung (nächster Abschnitt).
- Das Browser-Image `folium-browser` hat eine feste Version (derzeit `1.65.1`). Ändert ein Update sie, baut `--build` auch dieses Image neu.

### Zurück zur vorherigen Version (Rollback)

```bash
cd /opt/folium
docker compose stop folium
docker tag folium:vorher folium:latest

# Nur falls beim Update eine Migration lief (Log oder Liste zeigt vor-migration-…):
docker compose run --rm --no-deps folium ls -l /data/backups
docker compose run --rm --no-deps folium sh -c \
  'mkdir -p /data/backups/verworfen && mv /data/folium.db* /data/backups/verworfen/ \
   && cp /data/backups/vor-migration-v5-1763650000000.db /data/folium.db'

docker compose up -d          # ohne --build, sonst entsteht wieder die neue Version
```

Den Dateinamen der `vor-migration-…`-Datei aus der Liste übernehmen. Die alte Datenbank landet zur Sicherheit in `/data/backups/verworfen/`. Danach mit `git checkout` auch die Programmdateien auf den alten Stand bringen, damit ein späteres `--build` nicht wieder die neue Version baut.

Gut zu wissen:

- Die Wiederherstellung aus `vor-migration-…` setzt alle Änderungen seit dem Update zurück (Seiten, Konten, Statistik). Bilder und Schriften bleiben unverändert.
- Dieser Rückweg ist von Hand beschrieben und nicht automatisiert getestet. Vorher eine Server-Sicherung des Volumes anlegen ([Kapitel 17](17-sicherung.md#sicherungen-vom-server-wegkopieren)).
- Lief keine Migration, genügt der Wechsel des Images.

## Logs

Folium schreibt strukturierte JSON-Logs auf die Standardausgabe, eine Zeile je Ereignis. Docker hält davon höchstens 5 Dateien zu je 10 MB (`folium`) bzw. 3 zu je 5 MB (`folium-browser`).

```bash
docker compose logs -f folium                 # laufend mitlesen
docker compose logs --since 1h folium         # letzte Stunde
docker compose logs folium | grep '"level":50' # nur Fehler
```

| `level` | Bedeutung |
| --- | --- |
| 30 | Information, z. B. „Folium gestartet“ (mit Ports und Version), Migrationen |
| 40 | Warnung, z. B. Einrichtungscode, „OIDC-Anmeldung fehlgeschlagen“, „Statistik konnte nicht gespeichert werden“ |
| 50 | Fehler, z. B. „Automatische Sicherung fehlgeschlagen“, „Pflegeaufgabe fehlgeschlagen“ |
| 60 | Folium konnte nicht starten |

Zeitstempel sind in UTC. Mehr Details mit `LOG_LEVEL=debug` in der `.env` und `docker compose up -d`. Folium protokolliert keine einzelnen Anfragen, keine IP-Adressen, keine Passwörter und keine Tokens.

### Wenn Folium nicht startet

`docker compose ps` zeigt `Restarting` oder `unhealthy`. Die Ursache steht in der letzten Logzeile mit `"level":60`:

```bash
docker compose logs --tail 30 folium
```

| Meldung (Anfang) | Ursache und Abhilfe |
| --- | --- |
| „Das Datenverzeichnis /data ist nicht beschreibbar …“ | Rechte im Volume falsch. Die Meldung nennt den passenden `chown`-Befehl (Benutzer-ID 1000). |
| „Die Datenbank … ist beschädigt (quick_check: …)“ | Sicherung zurückspielen. Da die Oberfläche nicht erreichbar ist, die Vormerkung von Hand anlegen (siehe unten). |
| „Die Datenbank hat Schemaversion …“ | Ältere Folium-Version auf neuerer Datenbank: neuere Version starten oder Rollback wie oben. |

**Sicherung ohne Oberfläche vormerken** (z. B. bei beschädigter Datenbank): Folium spielt eine vorgemerkte Sicherung beim Start ein, noch bevor es die Datenbank prüft.

```bash
docker compose run --rm --no-deps folium ls /data/backups
docker compose run --rm --no-deps folium sh -c \
  'echo "{\"name\":\"folium-20261119-023000-auto\"}" > /data/wiederherstellen.json'
docker compose up -d
```

Den Namen eines Sicherungsordners aus der Liste einsetzen. Der beschädigte Stand landet wie bei jeder Wiederherstellung in `folium-…-vor-wiederherst` ([Kapitel 17](17-sicherung.md#was-beim-neustart-passiert)).

## Gesundheitsprüfung

Beide Ports beantworten `GET /healthz`:

| Adresse | Antwort | Prüft |
| --- | --- | --- |
| öffentlich, z. B. `https://links.example.com/healthz` | `{"ok":true}` | öffentlicher Server läuft |
| Verwaltung, z. B. `https://folium.intranet.example.com/healthz` | `{"ok":true,"version":"0.1.0"}` | Verwaltung läuft, Datenbank antwortet |

Das Docker-Image prüft beide alle 30 Sekunden selbst (`folium health`, Zeitlimit 5 s, 3 Versuche, 20 s Anlaufzeit). Für eine externe Überwachung (z. B. Uptime Kuma) eignet sich die öffentliche Adresse; sie prüft dabei auch Proxy und Zertifikat. Für den Dienst `folium-browser` gibt es keine eigene Gesundheitsprüfung; ob Bildschirmfotos funktionieren, zeigt eine Homepage-Analyse.

## Kommandozeile

```bash
docker compose exec folium folium <befehl>
```

| Befehl | Wirkung |
| --- | --- |
| `health` | prüft beide Ports; Ausgabe `öffentlich: ok, Verwaltung: ok`, Rückgabewert 0 bzw. 1 |
| `version` | zeigt die Version, z. B. `Folium 0.1.0` |
| `konten` | listet alle Konten: Nummer, Rolle (`admin`, `editor`, `viewer`), `aktiv`/`gesperrt`, E-Mail |
| `passwort <e-mail>` | setzt ein neues zufälliges Passwort, zeigt es einmalig an und beendet alle Sitzungen des Kontos |
| `sicherung` | legt sofort eine Sicherung `folium-…-manuell` an |

Ohne Befehl zeigt `folium` die Liste der Befehle. Die Befehle `konten`, `passwort` und `sicherung` öffnen die Datenbank in einem zweiten Prozess neben dem laufenden Folium. Führen Sie sie **nicht** aus, solange eine Wiederherstellung vorgemerkt ist: Der zweite Prozess würde sie sonst sofort anwenden, während Folium noch läuft.

## Ressourcen

| Dienst | Grenzen laut `docker-compose.yml` |
| --- | --- |
| `folium` | 768 MB RAM, 200 Prozesse, `/tmp` 64 MB im Arbeitsspeicher |
| `folium-browser` | 1 GB RAM, 300 Prozesse, gemeinsamer Speicher 256 MB, höchstens 2 gleichzeitige Browser-Sitzungen |

Die Datenbank bleibt klein (Tagessummen statt Einzelereignisse). Den meisten Platz belegen Bilder und Sicherungen: Jede Sicherung enthält eine vollständige Kopie von Datenbank und Bildern. Den Verbrauch zeigt:

```bash
docker compose exec folium du -sh /data /data/backups
```

Folium ist für eine Instanz ausgelegt (SQLite). Mehrere Container mit demselben Volume sind nicht vorgesehen.

## Betrieb ohne Browser-Dienst oder ohne KI

**Ohne Browser-Dienst** (z. B. weil der Server wenig Speicher hat):

```ini
BROWSER_WS_URL=
```

```bash
docker compose up -d folium            # nur den Dienst folium (neu) starten
docker compose stop folium-browser     # falls der Browser schon läuft
```

Die Homepage-Analyse liest dann nur HTML und CSS; Bildschirmfotos fehlen, und an die KI gehen keine Bilder. **Einstellungen → KI und Verbindungen** zeigt „Bildschirmfotos: nicht eingerichtet“. Ein späteres `docker compose up -d` ohne Dienstnamen startet den Browser wieder mit. Ist `BROWSER_WS_URL` gesetzt, der Browser aber nicht erreichbar, analysiert Folium ebenfalls ohne Bildschirmfotos und vermerkt das im Ergebnis.

**Ohne KI:** `ANTHROPIC_API_KEY` weglassen oder `AI_PROVIDER=none` setzen. Die Analyse der Homepage funktioniert weiter, nur der Schritt **An Claude senden** entfällt. Der manuelle Design-Editor ist voll nutzbar.

**Ohne Internetzugang des Servers:** Linkseiten, Verwaltung und Statistik laufen weiter; Homepage-Analysen fremder Seiten und KI-Aufrufe scheitern mit einer Meldung. Filum, Tessera und authentik funktionieren, wenn sie im internen Netz erreichbar sind. Zum Bauen braucht der Server Internet. Alternativ auf einem anderen Rechner bauen und übertragen:

```bash
# auf dem Build-Rechner (Plattform des Servers angeben)
docker buildx build --platform linux/amd64 -t folium:latest --load .
docker buildx build --platform linux/amd64 -t folium-browser:1.65.1 --load -f docker/browser.Dockerfile docker
docker save folium:latest folium-browser:1.65.1 | gzip > folium-images.tar.gz

# auf dem Server
docker load < folium-images.tar.gz
docker compose up -d                   # ohne --build
```

---

[← Handbuch](README.md) · [Weiter: 19 — KI-Anbindung](19-ki-anbindung.md)
