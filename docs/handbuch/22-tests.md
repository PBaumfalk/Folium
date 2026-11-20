[← Handbuch](README.md) · [Weiter: 23 — Bekannte Einschränkungen](23-einschraenkungen.md)

# 22 — Tests und Qualitätssicherung

> Dieses Kapitel richtet sich an die IT und an Entwickler.

Folium wird auf drei Ebenen geprüft:

| Ebene | Werkzeug | Befehl | Umfang (Stand 20.11.2026) |
| --- | --- | --- | --- |
| Server | vitest | `npm test` | 18 Testdateien, 137 Tests: 136 bestanden, 1 übersprungen (Live-KI ohne Schlüssel), Laufzeit rund 6 s |
| Oberfläche | Playwright (Chromium) mit axe-core | `scripts/e2e-local.sh` | 33 Testläufe: 25 auf Desktop (1440 × 900), 8 auf Pixel 7 |
| Container | Shell + Docker Compose | `scripts/docker-lifecycle-test.sh` | 16 Prüfschritte im echten Image |

Dazu kommen `npm run typecheck` (TypeScript für Server und Oberfläche, je eigene `tsconfig`) und der vorbereitete Live-Test der KI. Die Ergebnisse des letzten vollständigen Laufs stehen im [Prüfbericht](../pruefbericht.md).

## Server-Tests (`tests/`)

`makeApp()` in `tests/helpers.ts` startet über `createApp()` beide Fastify-Instanzen mit eigener SQLite-Datenbank in einem Temp-Verzeichnis, festem Einrichtungscode und `AI_PROVIDER=none`. Die Tests sprechen die Server mit `inject()` an, also ohne Netzwerk und ohne Attrappen der Datenschicht. Nach jedem Test werden Instanz und Verzeichnis entfernt.

| Datei | Tests | Schwerpunkt |
| --- | --- | --- |
| `pages.test.ts` | 11 | Anlegen aus Vorlage, Entwurf vs. Version, `409` bei veralteter Revision, Pflichtlinks, Wiederherstellen, Verwerfen, Duplizieren, Papierkorb, Adressregeln, Designverlauf, Rolle Ansehen |
| `public.test.ts` | 7 | 404 für Unbekanntes, strenge Header ohne Cookie, Entwürfe unsichtbar, unbekannter Host, Schriften und Pfadtraversal, `robots.txt` |
| `render.test.ts` | 11 | Escaping, Zeitplan inkl. Sommerzeitwechsel, Links als normale Anker, Hauptaktion, Pflichtlinks, Landmarken und Sprunglink, CSS nur aus geprüften Werten, Vorschau mit `noindex` |
| `preview.test.ts` | 4 | Vorschau nur angemeldet, Live-Vorschau ohne Speichern, ungültiges Design, Versionsvorschau |
| `schema.test.ts` | 12 | Inhaltsschema (`javascript:`-Adressen, 100 Einträge, Zeitplan), Designschema (CSS-Injektion in Farben, unbekannte Schrift), Kontrastberechnung |
| `auth.test.ts` | 6 | Einrichtungscode, Cookie `HttpOnly`/`SameSite=Strict`, Sperre nach 5 Fehlversuchen, fremde Origin 403, 401/403 nach Rolle, Abmelden |
| `separation.test.ts` | 2 | Port 8080 hat keine `/api`-Routen |
| `assets.test.ts` | 8 | Neukodierung zu WebP ohne Metadaten, falsche Signatur, > 5 MB, Rolle, Schriften, SVG-Bereinigung |
| `stats.test.ts` | 7 | Zählung je Tag mit Bot-Trennung, `204` trotz Schreibfehler, keine IP und kein Cookie, Tagesgrenze Europe/Berlin, CSV, abschaltbar |
| `share-io.test.ts` | 9 | QR mit `?src=qr`, Filum/Tessera gegen lokalen Testserver, Export/Import, Zip-Slip, Sicherung und Wiederherstellung, Einstellungen, eigene Domain |
| `safefetch.test.ts` | 12 | SSRF: Loopback, Metadaten, private Netze, Hex-/Dezimal-IP, Schemata, Ports, DNS mit privater oder gemischter Antwort, feste IP, Weiterleitung nach intern, 5 Weiterleitungen, Größe, Zeit, Abrufbudget |
| `extract.test.ts` | 8 | Merkmalsanalyse ohne Browser: Farben mit Quelle, Schrift Aleo, Logo, Knöpfe, Textauszug |
| `analysis.test.ts` | 3 | Analyse über lokalen Testserver, Ablehnung interner Ziele, Bildschirmfotos mit blockierten internen Unterressourcen |
| `ai.test.ts` | 13 | Abbildung der KI-Antwort, erfundene Farben, Farb- und Schriftnormalisierung, festgehaltene Werte, Kontrast, Prompt-Aufbau, JSON-Schema, Kosten und Limits |
| `design-routes.test.ts` | 7 | Ablauf über die API: Analyse ohne KI-Aufruf, `ai_not_configured`, simulierte Varianten ändern nichts, Injektion, ungültiges JSON, Rolle, Schlüssel nie ausgegeben |
| `review-fixes.test.ts` | 7 | Regressionstests zu den Befunden der Gesamtprüfung |
| `release-fixes.test.ts` | 9 | Regressionstests zu Fehlern, die beim Schreiben des Handbuchs aufgefallen sind: Protokoll bei Serverfehlern, `AI_MONTHLY_BUDGET_EUR=0`, `BACKUP_KEEP=0` und Sicherungen in derselben Sekunde, Kommandozeile ohne vorgezogene Wiederherstellung, Standard-Designrichtung, OIDC-Rolle ohne passende Gruppe, kanonische Adresse auf weiteren Domains, `?src=` in beliebiger Schreibweise, Einträge ohne Ziel |
| `ai.live.test.ts` | 1 | echter KI-Aufruf, nur mit Schlüssel (siehe unten) |

Regel: Jeder behobene Fehler bekommt einen Test, der ohne die Korrektur fehlschlägt (`review-fixes.test.ts`, `release-fixes.test.ts`).

Hinweise:

- Der Bildschirmfoto-Test in `analysis.test.ts` startet einen lokalen Chromium; ohne installierten Chromium meldet vitest ihn als **übersprungen**. Der Test in `review-fixes.test.ts` zu Seiten mit mehr als 40 Unterressourcen braucht den Chromium dagegen zwingend. Einmalig: `npx playwright install chromium`.
- In der CI laufen die Server-Tests in drei Zeitzonen (Europe/Berlin, UTC, Pacific/Auckland), weil Zeitpläne unabhängig von der Serverzeitzone in Europe/Berlin rechnen.

## Browser-Tests (`e2e/`)

```bash
npx playwright install chromium   # einmalig
scripts/e2e-local.sh              # baut die Oberfläche und startet Playwright
```

`playwright.config.ts` startet für jeden Lauf eine frische Instanz mit Beispieldaten (`scripts/demo.ts data-e2e`) auf den Ports 18280 (öffentlich) und 18281 (Verwaltung), mit `AI_PROVIDER=fake`, ohne Browser-Dienst und mit `ANALYSIS_ALLOW_HOSTS=localhost,127.0.0.1,::1`. Ein Worker, Zeitlimit 60 s je Test, Sprache `de-DE`, Zeitzone Europe/Berlin. Bei Fehlern bleiben Trace und HTML-Bericht (`playwright-report/`).

| Datei | Desktop | Pixel 7 | Inhalt |
| --- | --- | --- | --- |
| `flows.spec.ts` | 6 | – | anlegen → Link hinzufügen → per Tastatur sortieren → Vorschau → veröffentlichen → Entwurf ändern (öffentlich unverändert) → wiederherstellen; Löschen mit Rückgängig und Papierkorb; Konflikt bei zwei Tabs; Rolle Ansehen; neuer Link ohne Ziel wird gespeichert und zeigt den Hinweis *Noch kein Ziel*; Fehlermeldung der OIDC-Anmeldung auf der Anmeldeseite |
| `design.spec.ts` | 3 | – | manuelles Design wirkt erst nach Veröffentlichen; Analyse blockiert interne Ziele mit Grund; Varianten der simulierten KI ändern nur den Entwurf |
| `public.spec.ts` | 5 | 5 | alle drei Designs: Inhalt, Pflichtlinks, axe-core, kein Querscrollen; Klickzählung und Link ohne Zählung; Sprunglink und sichtbarer Fokus |
| `mobile.spec.ts` | 3 | 3 | kein horizontales Scrollen bei 320, 375 und 390 px |
| `a11y.spec.ts` | 8 | – | axe-core auf acht Verwaltungsansichten |

**Barrierefreiheit:** axe-core prüft drei öffentliche Seiten (auf beiden Geräten) und acht Verwaltungsansichten; erwartet werden 0 Verstöße.

Anmeldedaten der Demo: `admin@example.test` / `demo-passwort-123` (außerdem `redaktion@…` und `ansicht@…` mit demselben Passwort).

## Container-Test

```bash
scripts/docker-lifecycle-test.sh
```

Das Skript baut beide Images über `docker-compose.yml` (genau wie auf dem Server), startet sie als eigenes Compose-Projekt `folium-lifecycle` auf den Ports 18180/18181 mit eigener temporärer Umgebungsdatei (die `.env` wird nicht gelesen, `AI_PROVIDER=none`) und räumt am Ende alles einschließlich Volumes ab. Geprüft werden: beide Ports und Healthcheck, Ersteinrichtung, Veröffentlichen, öffentlicher Port ohne API, Verwaltung ohne Anmeldung gesperrt, Entwurf privat, Daten und Anmeldung nach `docker compose restart`, **Browser-Container ohne Internet**, Folium erreicht den Browser, Analyse lehnt `169.254.169.254` und `folium-browser` ab, echte Analyse von `https://example.com/` mit Bildschirmfotos, Sicherung über die Kommandozeile.

Vier Schritte (Metadaten-Adresse, internes Docker-Ziel, echte Analyse, Sicherung) brechen bei Abweichung nicht ab, sondern geben `HINWEIS …` aus; die Schlusszeile „Alle Prüfungen bestanden.“ erscheint dann trotzdem. Die Ausgabe deshalb auf `HINWEIS` durchsehen. Die echte Analyse braucht Internet auf dem Testrechner.

## Lokale Demo

```bash
npx tsx scripts/demo.ts                 # Daten in data-demo/
```

Startet Folium mit drei Konten und der erfundenen Beispielseite „Muster & Partner“ in allen drei Designs (`/muster`, `/boutique`, `/signature`) auf den Ports 18080 (öffentlich) und 18081 (Verwaltung), dazu eine erfundene Beispiel-Homepage auf `http://localhost:18090/`. Anmeldung `admin@example.test` / `demo-passwort-123`. Ohne weitere Variablen ist keine KI eingerichtet; mit `AI_PROVIDER=fake` läuft der Ablauf mit simulierten Antworten. `DEMO_BROWSER=1` startet einen lokalen Chromium für Bildschirmfotos. Die Bildschirmfotos des Handbuchs erzeugt `node scripts/screenshots.mjs`.

## Live-Test der KI

```bash
node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.live.test.ts
```

Läuft nur mit `ANTHROPIC_API_KEY`, kostet etwa 0,10–0,30 € und schreibt das Ergebnis nach `docs/pruefbericht-ki.json`. **Noch nicht ausgeführt**, weil kein Schlüssel vorlag. Einzelheiten in [Kapitel 19](19-ki-anbindung.md).

## Kontinuierliche Integration

Der Workflow `.github/workflows/ci.yml` (Name „Tests, Image & Release“) wird gerade eingerichtet. Er läuft bei Push und Pull Request auf `main`, bei Tags `v*` und von Hand:

| Job | Schritte |
| --- | --- |
| `tests` | `npm ci`, `npm run typecheck`, `npm test`; je einmal in Europe/Berlin, UTC und Pacific/Auckland |
| `e2e` | `npm ci`, Handbuch-Linkprüfung `npm run docs:check`, `npx playwright install --with-deps chromium`, `scripts/e2e-local.sh`; bei Fehlschlag Bericht und Traces als Artefakt (14 Tage) |
| `image` | nach `tests` und `e2e`: Versionsprüfung (Tag muss zu `package.json` passen), Container-Test `scripts/docker-lifecycle-test.sh`, bei Push: Images `folium` und `folium-browser` für amd64 und arm64 bauen und nach ghcr.io pushen |
| `release` | nur bei Tags: Abschnitt der Version aus `CHANGELOG.md` als GitHub-Release |

---

[← Handbuch](README.md) · [Weiter: 23 — Bekannte Einschränkungen](23-einschraenkungen.md)
