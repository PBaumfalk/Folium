# 15 — Konfiguration

[← Handbuch](README.md) · [Weiter: 16 — Anmeldung über authentik](16-anmeldung-oidc.md)

> Dieses Kapitel richtet sich an die IT bzw. an Administratoren des Servers.

Folium liest seine Konfiguration aus Umgebungsvariablen. Im Docker-Betrieb stehen sie in der Datei `.env` neben `docker-compose.yml`; Vorlage ist `.env.example`. Alles, was Admins in der Oberfläche einstellen (Impressum, Statistik, Papierkorb, Domains, Konten), steht in der Datenbank und wird in [Kapitel 11](11-einstellungen.md) beschrieben.

**Änderungen übernehmen:** nach jeder Änderung der `.env`

```bash
docker compose up -d
```

`docker compose restart` genügt **nicht**: Es startet den Container mit den alten Werten neu.

**Schreibweisen:**

- Ja/Nein-Werte: `1`, `true`, `yes`, `ja`, `on` gelten als „ja“ (Groß-/Kleinschreibung egal); alles andere als „nein“. Leer oder nicht gesetzt: Standardwert.
- Zahlen: Ungültige oder leere Angaben ergeben den Standardwert.
- Listen: durch Komma getrennt, Leerzeichen werden entfernt.
- Adressen: ein abschließender `/` wird entfernt.

## Adressen und Server

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `APP_URL` | Adresse der Verwaltung, genau so, wie sie im Browser aufgerufen wird. Dient der Herkunftsprüfung schreibender Anfragen, als Rücksprungadresse für authentik und bestimmt, ob das Sitzungscookie nur über HTTPS gesendet wird. | `http://localhost:8081` (Port aus `ADMIN_PORT`) |
| `PUBLIC_BASE_URL` | Standardadresse der Linkseiten, z. B. `https://links.example.com`. Ihr Hostname (mit Port) wird als Standardadresse erkannt; Teilen und QR-Codes verwenden sie. | `http://localhost:8080` (Port aus `PUBLIC_PORT`) |
| `TRUST_PROXY` | Adresse(n) oder Netz(e) des Reverse Proxy, deren `X-Forwarded-For` übernommen wird; `true` vertraut allen ([Kapitel 14](14-reverse-proxy.md#echte-absenderadresse-trust_proxy)) | aus |
| `SECURE_COOKIES` | Sitzungscookie nur über HTTPS senden | ja, wenn `APP_URL` mit `https://` beginnt, sonst nein |
| `SETUP_CODE` | eigener Einrichtungscode für das erste Admin-Konto | zufällig (Form `123-456-789`), steht im Log |
| `LOG_LEVEL` | Detailgrad der Logs: `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info` |
| `APP_TIMEZONE` | Zeitzone für Tagesgrenzen der Statistik und für „sichtbar ab/bis“ von Einträgen | `Europe/Berlin` |
| `DATA_DIR` | Datenverzeichnis (Datenbank, Dateien, Sicherungen) | `./data`; im Container `/data` |
| `HOST` | Adresse, auf der Folium lauscht | `0.0.0.0` |
| `PUBLIC_PORT` | öffentlicher Port im Container | `8080` |
| `ADMIN_PORT` | Verwaltungsport im Container | `8081` |

`DATA_DIR`, `HOST`, `PUBLIC_PORT` und `ADMIN_PORT` setzt das Docker-Image selbst. Im Docker-Betrieb nicht ändern; die Ports auf dem Host stellen Sie über die Compose-Variablen unten ein.

## KI für „Design aus Homepage“

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` (echte KI), `none` (aus) oder `fake` (simulierte Antworten, nur für Tests; in der Oberfläche als „Simuliert“ gekennzeichnet). Unbekannte Werte gelten als `none`. | `anthropic`, wenn `ANTHROPIC_API_KEY` gesetzt ist, sonst `none` |
| `ANTHROPIC_API_KEY` | API-Schlüssel von Anthropic. Bleibt auf dem Server und wird nie angezeigt. | – |
| `AI_MODEL` | Modell-ID | `claude-opus-5-5` |
| `AI_DAILY_LIMIT` | höchstens so viele KI-Aufrufe pro Tag (alle Personen zusammen, Tageswechsel nach UTC) | `30` |
| `AI_HOURLY_PER_USER` | höchstens so viele KI-Aufrufe je Person in 60 Minuten | `10` |
| `AI_MONTHLY_BUDGET_EUR` | Monatsbudget in Euro (geschätzte Kosten, Monatswechsel nach UTC) | `20` |
| `AI_TIMEOUT_MS` | Zeitlimit eines KI-Aufrufs in Millisekunden | `120000` |
| `AI_FAKE_MODE` | nur Tests, nur mit `AI_PROVIDER=fake`: Art der simulierten Antwort | `valid` |

`AI_MONTHLY_BUDGET_EUR=0` wird als „nicht gesetzt“ gelesen und ergibt 20 €. Um die KI abzuschalten, `AI_PROVIDER=none` setzen. Mehr in [Kapitel 19](19-ki-anbindung.md).

## Homepage-Analyse

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `BROWSER_WS_URL` | WebSocket-Adresse des Playwright-Servers für Bildschirmfotos. Leer setzen (`BROWSER_WS_URL=`), um ohne Bildschirmfotos nur über HTML und CSS zu analysieren. | in `docker-compose.yml`: `ws://folium-browser:3000/`; ohne Compose: leer |
| `ANALYSIS_ALLOW_HOSTS` | Ausnahmen von der Sperre interner Ziele: Hostnamen, IP-Adressen oder Netze. Nur für Tests oder eine Homepage im Intranet. | leer |
| `ANALYSIS_ALLOW_PRIVATE` | erlaubt der Analyse alle privaten Ziele. Nur für Tests. | nein |

Die beiden `ANALYSIS_*`-Variablen schwächen den Schutz vor Abrufen ins interne Netz ([Kapitel 20](20-sicherheit.md)). Im Betrieb leer lassen.

## Verbindungen zu Filum und Tessera

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `FILUM_URL` | Adresse der Filum-Verwaltung, z. B. `https://filum.intranet.example.com` | – |
| `FILUM_TOKEN` | API-Token aus Filum mit Schreibrecht | – |
| `TESSERA_URL` | Adresse von Tessera | – |
| `TESSERA_TOKEN` | API-Token aus Tessera | – |

Erst wenn Adresse **und** Token gesetzt sind, gilt die Verbindung als eingerichtet und erscheint im Bereich **Teilen** ([Kapitel 7](07-teilen.md)).

## Anmeldung über authentik (OIDC)

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `OIDC_ISSUER` | Aussteller-Adresse, z. B. `https://auth.example.com/application/o/folium/`. Nicht gesetzt: OIDC aus, alle anderen `OIDC_*` werden ignoriert. | aus |
| `OIDC_CLIENT_ID` | Client-ID aus authentik | – |
| `OIDC_CLIENT_SECRET` | Client-Secret aus authentik | – |
| `OIDC_ADMIN_GROUPS` | Gruppen, deren Mitglieder Admin werden (Liste) | leer |
| `OIDC_EDITOR_GROUPS` | Gruppen, deren Mitglieder Redaktion werden (Liste) | leer |
| `OIDC_DEFAULT_ROLE` | Rolle ohne passende Gruppe: `viewer` (Ansehen), `editor`, `admin` oder `none` (Anmeldung abweisen). Unbekannte Werte gelten als `viewer`. | `viewer` |
| `OIDC_BUTTON_LABEL` | Beschriftung des Knopfs auf der Anmeldeseite | `Mit authentik anmelden` |
| `DISABLE_LOCAL_LOGIN` | Anmeldung mit Passwort abschalten (nur noch OIDC) | nein |

Einrichtung in [Kapitel 16](16-anmeldung-oidc.md).

## Sicherungen

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `BACKUP_INTERVAL_HOURS` | Abstand automatischer Sicherungen in Stunden; `0` schaltet sie ab | `24` |
| `BACKUP_KEEP` | so viele automatische Sicherungen behalten (manuelle werden nie automatisch gelöscht) | `14` |

`BACKUP_KEEP` mindestens auf `1` setzen: Mit `0` löscht Folium jede automatische Sicherung direkt nach dem Anlegen. Mehr in [Kapitel 17](17-sicherung.md).

## Nur in docker-compose.yml

Diese Variablen wertet nicht Folium aus, sondern Docker Compose. Sie stehen ebenfalls in der `.env`, weil Compose die `.env` im Projektordner automatisch für Ersetzungen liest.

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `PUBLIC_BIND` | Host-Adresse für den öffentlichen Port | `127.0.0.1` |
| `PUBLIC_HOST_PORT` | Host-Port für den öffentlichen Port | `8080` |
| `ADMIN_BIND` | Host-Adresse für den Verwaltungsport | `127.0.0.1` |
| `ADMIN_HOST_PORT` | Host-Port für den Verwaltungsport | `8081` |
| `FOLIUM_IMAGE` | Name des Images für den Dienst `folium`, z. B. `ghcr.io/pbaumfalk/folium:latest` | `folium:latest` |
| `FOLIUM_BROWSER_IMAGE` | Name des Images für den Dienst `folium-browser`, z. B. `ghcr.io/pbaumfalk/folium-browser:latest` | `folium-browser:1.65.1` |
| `FOLIUM_ENV_FILE` | Datei mit den Variablen für den Container | `.env` |
| `TZ` | Zeitzone des Containers. Für Folium maßgeblich ist `APP_TIMEZONE`; die Zeitstempel im Log und in den Namen der Sicherungen sind immer UTC. | `Europe/Berlin` |

## Beispiel für den Betrieb

```ini
APP_URL=https://folium.intranet.example.com
PUBLIC_BASE_URL=https://links.example.com
TRUST_PROXY=172.18.0.0/16

ANTHROPIC_API_KEY=…
AI_MONTHLY_BUDGET_EUR=20

FILUM_URL=https://filum.intranet.example.com
FILUM_TOKEN=…

BACKUP_INTERVAL_HOURS=24
BACKUP_KEEP=14

PUBLIC_BIND=127.0.0.1
PUBLIC_HOST_PORT=8080
ADMIN_BIND=127.0.0.1
ADMIN_HOST_PORT=8081
```

---

[← Handbuch](README.md) · [Weiter: 16 — Anmeldung über authentik](16-anmeldung-oidc.md)
