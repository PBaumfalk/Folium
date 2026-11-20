[← Handbuch](README.md) · [Weiter: 22 — Tests](22-tests.md)

# 21 — Architektur

> Dieses Kapitel richtet sich an die IT und an Entwickler.

## Überblick

```
                      Internet / Intranet
                              │
                     ┌────────┴────────┐
                     │  Reverse Proxy  │  TLS, Hostnamen (Caddy)
                     └──┬───────────┬──┘
   links.example.…      │           │      folium.intranet.…
                        ▼           ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Container „folium“ (Node 24, ein Prozess)               │
   │                                                         │
   │  :8080 öffentlich              :8081 Verwaltung         │
   │  ─ veröffentlichte Seiten      ─ JSON-API /api/v1       │
   │  ─ /assets, /fonts             ─ React-Oberfläche       │
   │  ─ Klickzähler POST /c         ─ Vorschau der Entwürfe  │
   │          │                     ─ Analyse, KI, Teilen    │
   │          └──────── Dienste ─────────┘     │             │
   │   Pages · Assets · Stats · Auth · Audit · │             │
   │   Settings · Backups · Renderer           │             │
   │                 │                         │ WebSocket   │
   │   SQLite (WAL) /data/folium.db            │             │
   │   Dateien     /data/assets                │             │
   │   Sicherungen /data/backups               │             │
   └───────────────────────────────────────────┼─────────────┘
                                               │ Netz „folium-intern“
                                               │ (internal: true, ohne Internet)
                               ┌───────────────┴───────────────┐
                               │ Container „folium-browser“     │
                               │ Chromium, playwright run-server│
                               └────────────────────────────────┘
   Ausgehend aus „folium“: Homepage-Abruf (SSRF-geschützt), Anthropic-API, optional Filum/Tessera
```

## Bausteine

| Baustein | Umsetzung | Datei(en) |
| --- | --- | --- |
| Prozess und Start | Lädt Konfiguration, öffnet die Datenbank (Migrationen), baut beide Server, startet Pflegeaufgaben | `src/server/main.ts`, `src/server/app.ts` |
| Öffentlicher Server | Fastify 5, Port 8080, Body ≤ 4 KB, keine Cookies | `src/server/public/*` |
| Verwaltungsserver | Fastify 5, Port 8081, Sitzung, Origin-Prüfung, Rate-Limits, liefert die gebaute Oberfläche aus `dist/web` | `src/server/admin/*` |
| Dienste | Klassen im gemeinsamen Kontext `Ctx` (Pages, Assets, Stats, Auth, Audit, SettingsStore, Backups, KI-Anbieter) | `src/server/services/*`, `src/server/context.ts` |
| Datenbank | better-sqlite3, WAL, `synchronous=NORMAL`, Fremdschlüssel an, `quick_check` beim Start | `src/server/db/*` |
| Renderer | erzeugt die komplette HTML-Seite mit eingebettetem CSS aus Inhalt und Design; derselbe Code für öffentliche Seite und Vorschau | `src/server/render/*` |
| Gemeinsame Schemata | Inhalt (`content.ts`) und Design (`theme.ts`) mit zod; Server und Oberfläche nutzen dieselben Dateien | `src/shared/*` |
| Oberfläche | React 19, React Router, TanStack Query, dnd-kit, Lucide; eigenes CSS ohne Komponentenbibliothek | `src/web/*` |
| Homepage-Analyse | SSRF-geschützter Abruf, Merkmalsextraktion aus HTML/CSS, Bildschirmfotos über den Browser-Dienst | `src/server/lib/safefetch.ts`, `src/server/analysis/*` |
| KI | austauschbarer Anbieter, Prompt, Schema, Abbildung, Kostenbremse | `src/server/ai/*` ([Kapitel 19](19-ki-anbindung.md)) |
| Kommandozeile | `folium health`, `version`, `konten`, `passwort`, `sicherung` im Container | `src/server/cli.ts`, `docker/folium` |

## Verzeichnisstruktur

```
src/
  server/
    main.ts, app.ts, config.ts, context.ts, cli.ts
    admin/        server.ts, http.ts (need, parse, Fehler), routes/
                  auth, oidc, pages, preview, assets, stats, design, share, settings
    public/       server.ts, pages.ts, assets.ts, click.ts
    services/     pages, assets, svg, stats, auth, audit, settings, backup, io, templates
    render/       page.ts (HTML), css.ts (CSS aus dem Design), escape.ts, icons.gen.ts
    analysis/     index.ts (Ablauf), extract.ts (Merkmale), browser.ts (Bildschirmfotos)
    ai/           provider.ts, anthropic.ts, fake.ts, prompt.ts, schema.ts, map.ts, budget.ts
    db/           db.ts, migrations.ts
    lib/          safefetch, crypto, schedule, slug, time, ua, log, errors
  shared/         content.ts, theme.ts
  web/            App.tsx, pages/, components/, lib/api.ts, styles/app.css
fonts/            10 mitgelieferte Schriften (SIL OFL 1.1)
tests/            vitest (Server)          e2e/   Playwright (Browser)
scripts/          demo.ts, e2e-local.sh, docker-lifecycle-test.sh, screenshots.mjs, …
docker/           browser.Dockerfile, folium (CLI-Wrapper)
Dockerfile, docker-compose.yml
```

## Datenmodell

Migrationen stehen in `src/server/db/migrations.ts`. Jede läuft genau einmal in einer Transaktion; die Schemaversion steht in `PRAGMA user_version`. Bestehende Migrationen werden nie geändert, nur neue angehängt. Vor einer Migration bestehender Daten legt Folium `backups/vor-migration-v<alt>-<zeit>.db` per `VACUUM INTO` an. Ist die Datenbank neuer als der Code, bricht der Start ab (kein Downgrade).

| Version | Name | Tabellen |
| --- | --- | --- |
| 1 | `grundschema` | `meta`, `settings`, `users`, `sessions`, `audit_log` |
| 2 | `seiten` | `domains`, `pages`, `page_versions`, `theme_history` |
| 3 | `dateien` | `assets` |
| 4 | `statistik` | `stats_daily` |
| 5 | `ki` | `ai_runs` |

| Tabelle | Inhalt |
| --- | --- |
| `meta` | Schlüssel/Wert, u. a. der Einrichtungscode bis zur Ersteinrichtung |
| `settings` | Einstellungen aus der Oberfläche (Impressum, Datenschutz, Homepage, Standarddesign, Statistik an/aus, Aufbewahrung, Papierkorbfrist) |
| `users` | E-Mail, Name, Rolle (`admin`/`editor`/`viewer`), scrypt-Hash, OIDC-Kennung, gesperrt |
| `sessions` | SHA-256 des Sitzungstokens, Ablauf, zuletzt gesehen |
| `audit_log` | Zeit, Person, Aktion, Ziel, Details (JSON) |
| `domains` | eigener Hostname und die Seite, die unter `/` erscheint |
| `pages` | Adresse (`slug`), Name, **Entwurf** (`draft_content`, `draft_theme` als JSON), `draft_rev`, Zeiger `published_version_id`, `deleted_at` (Papierkorb) |
| `page_versions` | unveränderliche Schnappschüsse: Nummer, Inhalt, Design, Notiz, Zeit, Person |
| `theme_history` | frühere Entwurfsdesigns je Seite mit Quelle (`manual`, `preset`, `ai`, `history`), höchstens 50 je Seite |
| `assets` | Uploads: Hash-ID, Art, Endung, Maße, erzeugte Breiten, Größe |
| `stats_daily` | Tagessummen je Seite, Eintrag, Tag, Quelle, Art (`view`/`click`), Bot ja/nein |
| `ai_runs` | je KI-Aufruf: Zeit, Person, Adresse, Modell, Status, Token, geschätzte Kosten, Dauer, Fehlercode, simuliert |

## Entwurf, Version, Schnappschuss

Jede Seite hat genau einen **Entwurf** in der Zeile von `pages`. Bearbeiten ändert nur ihn.

- **Speichern** sendet die Revision `rev` mit. Stimmt sie nicht mit `draft_rev` überein, antwortet der Server `409 stale` (zwei Personen bearbeiten gleichzeitig). Das Update ist zusätzlich an `draft_rev = ?` gebunden, jede Änderung erhöht `draft_rev`.
- **Veröffentlichen** prüft Impressum- und Datenschutz-Link, kopiert den Entwurf als neue Zeile nach `page_versions` (Nummer + 1) und setzt `published_version_id` darauf, beides in einer Transaktion. Danach wird der Seiten-Cache des öffentlichen Servers für diese Seite geleert.
- **Wiederherstellen** veröffentlicht eine alte Version erneut als **neue** Versionsnummer, oder lädt sie nur in den Entwurf. Versionen werden nie überschrieben.
- **Änderungen verwerfen** kopiert die veröffentlichte Version zurück in den Entwurf.
- Der öffentliche Server liest ausschließlich `page_versions`. Ein Entwurf kann dadurch nicht versehentlich öffentlich werden, auch nicht durch einen Fehler in der Oberfläche.
- **Papierkorb:** Löschen setzt `deleted_at`; die stündliche Pflege löscht nach `trashDays` (Standard 30) endgültig.

## Design als Daten

Ein Design (`Theme`, `src/shared/theme.ts`) ist ein streng geprüftes Objekt: Voreinstellung, sieben Farben als `#RRGGBB`, zwei Schrift-IDs (mitgeliefert oder `upload:<hash>`), Knopfform und -stil, Kartenstil und Rundung 0–28 px, Dichte, Kopflayout und Logogröße, Link-Darstellung, Hauptaktion, Abschnittsband. Unbekannte Felder werden abgelehnt.

`themeCss()` (`src/server/render/css.ts`) setzt daraus CSS-Variablen (`--bg`, `--accent`, `--r-btn` …) in feste Vorlagen ein. Es gibt keinen Weg, eigenes CSS, HTML oder JavaScript einzuschleusen. Deshalb kann auch ein KI-Vorschlag nur gültige Werte enthalten.

Drei Voreinstellungen (`editorial`, `boutique`, `signature`) sind ebenfalls nur Theme-Objekte. Kontrast wird nach WCAG berechnet (`contrastRatio`, `checkTheme`); der Editor zeigt Werte unter 4,5 : 1 mit Korrekturvorschlag, beim Veröffentlichen erscheint eine Warnung.

## Renderer und Auslieferung

`renderPage()` erzeugt eine vollständige HTML-Seite: Text maskiert, CSS eingebettet, Schriften lokal per `@font-face`, Bilder als WebP in passender Breite, ein kleines Skript per CSP-Hash. Zeitgesteuerte Einträge (sichtbar ab/bis, Europe/Berlin) werden beim Rendern ausgewertet.

Der öffentliche Server hält gerenderte Seiten im Arbeitsspeicher je Seite, Version und Hostname. Ein Eintrag gilt bis zur nächsten Zeitplanänderung, höchstens 10 Minuten, und wird beim Veröffentlichen sofort verworfen. Antworten tragen `ETag` und `Cache-Control: public, max-age=60, must-revalidate`.

Die Vorschau (`/api/v1/pages/:id/preview`, `/api/v1/preview` für ungespeicherte Änderungen, Versionsvorschau) nutzt denselben Renderer im Modus „Vorschau“ mit Banner und `noindex`.

## Statistik-Fluss

```
Seite ausliefern ─┐                                      ┌─ Tagessumme +n
                  ├─► Stats.add() ─► Map im Speicher ─► alle 3 s eine Transaktion
POST /c (Beacon) ─┘    (Seite, Eintrag, Tag, Quelle,      (UPSERT in stats_daily)
                        Art, Bot ja/nein)
```

- Aufrufe zählt der Server beim Ausliefern, Klicks meldet das Seitenskript per `navigator.sendBeacon` an `POST /c`.
- Der Schlüssel enthält nur Seite, Eintrag, Tag (Europe/Berlin), Quelle (`?src=`, `[a-z0-9-]{1,32}`, sonst `direkt`), Art und Bot-Kennzeichen. User-Agent und IP-Adresse werden nur zur Einordnung bzw. Drosselung benutzt und nicht gespeichert.
- Geschrieben wird alle 3 Sekunden, bei mehr als 5 000 offenen Schlüsseln sofort und beim Beenden. Schreibfehler werden protokolliert und verworfen; sie blockieren weder Auslieferung noch Klick.
- Die stündliche Pflege löscht Summen älter als `statsRetentionDays` (Standard 730 Tage).

## Sicherungen

`Backups.create()` schreibt die Datenbank per `VACUUM INTO` (konsistent im laufenden Betrieb) und die hochgeladenen Dateien nach `/data/backups/folium-<datum>-<zeit>-<label>/`. Automatisch alle `BACKUP_INTERVAL_HOURS` (Standard 24), `BACKUP_KEEP` (14) bleiben. Eine Wiederherstellung wird nur vorgemerkt und beim nächsten Start ausgeführt; der vorherige Stand wird vorher als `…-vor-wiederherst` beiseitegelegt ([Kapitel 17](17-sicherung.md)).

## Entscheidungen

| Frage | Entscheidung | Begründung |
| --- | --- | --- |
| Eigenständig oder Modul? | Eigene Anwendung im Aufbau von Filum | Filum bleibt unverändert; gleicher Betrieb (Image, SQLite, Sicherungen, CLI), SSRF-Schutz übertragbar. Statische Seiten über Caddy wurden verworfen, weil Zeitsteuerung, Zählung und Analyse trotzdem einen Server brauchen. |
| Trennung | Zwei Fastify-Instanzen auf zwei Ports | Der öffentliche Dienst enthält keinen Verwaltungscode. Trennung durch Aufbau, nicht durch Konfiguration. |
| Laufzeit | Node.js 24, TypeScript, Fastify 5 | Gleicher Stack wie Filum und Tessera; eine Sprache für Server und Oberfläche. |
| Datenbank | SQLite (better-sqlite3) im WAL-Modus | Keine zweite Komponente, keine Zugangsdaten, Sicherung = Datei. Für einige Seiten und Tausende Aufrufe am Tag mehr als genug. |
| Veröffentlichen | Unveränderliche Schnappschüsse + Zeiger | Entwürfe können nie öffentlich werden; jede Version bleibt wiederherstellbar. |
| Design | Validierte Daten statt CSS | Kein Einfallstor für Schadcode, KI-Vorschläge bleiben im erlaubten Rahmen, einfache Bedienung. |
| Öffentliche Seiten | Serverseitig gerendert, ein Skript, keine Cookies, keine externen Ressourcen | Schnell auf dem Smartphone (≈ 23 KB HTML inkl. CSS laut [Prüfbericht](../pruefbericht.md)), datenschutzfreundlich, Links funktionieren ohne JavaScript. |
| Statistik | Tagessummen, gebündelt geschrieben | Keine personenbezogenen Daten; die Auslieferung wartet nie auf die Datenbank. |
| Bildschirmfotos | Eigener Browser-Container ohne Internet, Anfragen über Folium | Das Haupt-Image bleibt schlank und streng; ein kompromittierter Browser erreicht nichts außer Folium. |
| KI | Anthropic Claude über das offizielle SDK hinter der Schnittstelle `DesignAiProvider` | Bildauswertung und strukturierte Ausgabe; Anbieter austauschbar; ohne KI bleibt alles nutzbar. |
| Analysen und KI-Ergebnisse | nur im Arbeitsspeicher (2 h bzw. 24 h) | Bildschirmfotos fremder Seiten landen nicht in Datenbank und Sicherungen. |
| Auslieferung | Ein Image, mehrstufiger Build, `node:24-bookworm-slim`, amd64/arm64 | Einfach zu betreiben; Laufzeit-Image ohne npm. |

---

[← Handbuch](README.md) · [Weiter: 22 — Tests](22-tests.md)
