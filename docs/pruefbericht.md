# Prüfbericht Folium 0.1.0

Stand 20.11.2026. Alle Prüfungen sind wiederholbar (Befehle jeweils angegeben).

## Ergebnis auf einen Blick

| Prüfung | Befehl | Ergebnis |
| --- | --- | --- |
| Server-Tests (Unit/Integration) | `npm test` | **136 bestanden**, 1 übersprungen (Live-KI ohne Schlüssel), 137 Tests in 18 Dateien |
| Typprüfung Server und Oberfläche | `npm run typecheck` | ohne Fehler |
| Browser-Tests (Chromium Desktop 1440 px und Pixel 7) | `scripts/e2e-local.sh` | **33 bestanden** |
| Barrierefreiheit (axe-core) | in den Browser-Tests | 0 Verstöße auf 3 öffentlichen Seiten und 8 Verwaltungsansichten |
| Container-Lebenszyklus | `scripts/docker-lifecycle-test.sh` | **alle Prüfungen bestanden** (Ausgabe unten) |
| Sichtprüfung | `node scripts/screenshots.mjs` | 23 Ansichten in `docs/screenshots/`, geprüft und korrigiert |

## Unabhängige Gesamtprüfung

Ein frischer Prüfagent hat den gesamten Code gelesen: **0 kritische, 4 wichtige Befunde**, alle behoben und mit Regressionstests belegt (`tests/review-fixes.test.ts`): Endlosschleife bei langen Adressen beim Duplizieren/Import, Absturz bei beschädigtem ZIP, fehlende Bildschirmfotos bei Seiten mit vielen Bildern, Veröffentlichen ohne Revisionsprüfung. Zusätzlich behoben: Prototyp-Schlüssel als Schrift, drei IPv6-Bereiche in der SSRF-Sperre, Fehler bei Kleinstdateien, Seiten-Cache je Domain, Positivliste für festgehaltene Werte. Bewusst offen (gering, eingedämmt): siehe Abschnitt „Bekannte kleinere Punkte“.

Beim Schreiben des Handbuchs fielen weitere Fehler auf, die vor 0.1.0 behoben und mit Regressionstests belegt sind (`tests/release-fixes.test.ts`, dazu zwei Browser-Tests in `e2e/flows.spec.ts`): Standard-Designrichtung wirkt, Papierkorbfrist und Zeitzone in der Oberfläche aus den Einstellungen, Einträge ohne Ziel im Entwurf (Veröffentlichen mit `target_missing` abgelehnt), `?src=` bei Klicks unabhängig von der Schreibweise, Fehlermeldung der OIDC-Anmeldung auf der Anmeldeseite, OIDC behält von Hand gesetzte Rollen ohne passende Gruppe, Serverfehler im Protokoll, `AI_MONTHLY_BUDGET_EUR=0` und `BACKUP_KEEP=0` wörtlich genommen, keine Kollision bei Sicherungen in derselben Sekunde, Kommandozeile wendet keine vorgemerkte Wiederherstellung an, kanonische Adresse auf weiteren Domains.

## Bekannte kleinere Punkte

- SVG-Bereinigung dekodiert numerische Entitäten nicht vor der Prüfung (eingedämmt durch CSP und Einbindung als `<img>`).
- Import liest Bilder vor der Prüfung der Seiten ein (bei fehlerhaftem Archiv bleiben Dateien ohne Verwendung zurück).
- Ein gesperrtes letztes Admin-Konto lässt sich nicht löschen.
- Manuelle Sicherungen werden nicht automatisch ausgedünnt.
- KI-Tageslimit wechselt um Mitternacht UTC.
- Umbenennen und Entwurfsspeichern sind nicht atomar.
- Die Verwaltungsoberfläche hat keine eigene CSP.

## Abgedeckte Abläufe

- **Seiten erstellen, bearbeiten, veröffentlichen, wiederherstellen:** `tests/pages.test.ts`, `e2e/flows.spec.ts` (anlegen → Link hinzufügen → per Tastatur sortieren → Vorschau Smartphone/Desktop → veröffentlichen → Entwurf ändern → öffentlich unverändert → veröffentlichen → Version 1 wiederherstellen).
- **Entwürfe öffentlich unsichtbar:** `tests/public.test.ts`, `tests/pages.test.ts`, `e2e/flows.spec.ts`, Container-Test.
- **Inhalte nach Neustart erhalten:** Container-Test (`docker compose restart`, Seite und Entwurf und Anmeldung erhalten).
- **Unbefugte ohne Verwaltungsrechte:** `tests/auth.test.ts` (fremde Origin 403, ohne Anmeldung 401, Rolle „Ansehen“ 403), `tests/separation.test.ts` (Port 8080 ohne API), `e2e/flows.spec.ts` (Ansehen-Rolle).
- **Fehlerhafte KI-Antworten sicher abgefangen:** `tests/ai.test.ts`, `tests/design-routes.test.ts` (ungültiges JSON, erfundene „erkannte“ Farben, Schadcode in Farbwerten, unbekannte Schriften, Ablehnung, Zeitüberschreitung, festgehaltene Werte, Kontrast).
- **Interne Netzwerkziele blockiert:** `tests/safefetch.test.ts` (Loopback, private Netze, 169.254.169.254, IPv6-Varianten, Hex-/Dezimal-IP, DNS mit privater Antwort, gemischte DNS-Antworten, DNS-Rebinding, Weiterleitung auf intern, Ports, Größen-, Zeit- und Abruflimits), `tests/analysis.test.ts` (interne Unterressourcen im Browser blockiert), `e2e/design.spec.ts`, Container-Test (Metadaten-Adresse und internes Docker-Ziel `folium-browser` abgelehnt).
- **Manuelle Gestaltung ohne KI:** `e2e/design.spec.ts` (Farbe und Knopfform ändern → Vorschau → erst nach Veröffentlichen öffentlich).
- **Smartphone und Desktop:** `e2e/public.spec.ts` und `e2e/mobile.spec.ts` (alle drei Designs, 320/375/390 px ohne Querscrollen, Telefonlink, Pflichtlinks, keine Cookies, Tastaturbedienung).
- **Statistik blockiert nie:** `tests/stats.test.ts` (Speicherfehler → trotzdem 204), `e2e/public.spec.ts` (Zählung blockiert → Link öffnet trotzdem).

## Container-Lebenszyklus (Ausgabe)

```
OK   Container läuft, beide Ports antworten
OK   Healthcheck im Container
OK   Erstes Admin-Konto angelegt
OK   Seite öffentlich
OK   Öffentlicher Port kennt keine Verwaltungs-API
OK   Verwaltung ohne Anmeldung gesperrt
OK   Entwurf gespeichert
OK   Entwurf öffentlich unsichtbar
OK   Veröffentlichte Seite nach Neustart da
OK   Entwurf und Anmeldung nach Neustart erhalten
OK   Browser-Container hat kein Internet
OK   Folium erreicht den Browser im internen Netz
OK   Analyse blockiert Metadaten-Adresse
OK   Analyse blockiert internes Docker-Ziel
OK   Echte Analyse mit Bildschirmfotos über den abgeschotteten Browser
OK   Sicherung über die Kommandozeile
Alle Prüfungen bestanden.
```

## Was tatsächlich, was simuliert, was nicht getestet ist

| Integration | Status |
| --- | --- |
| Homepage-Analyse gegen eine **echte öffentliche Homepage** (echtes Internet, HTML/CSS, Bildschirmfotos über den abgeschotteten Browser im Container) | **tatsächlich getestet** |
| KI-Ablauf in Oberfläche und Server mit **simuliertem Anbieter** (`AI_PROVIDER=fake`, überall als „Simuliert“ gekennzeichnet) | **simuliert** |
| **Echter Aufruf der Anthropic-API** (Claude `claude-opus-5-5`) | **nicht getestet** – kein Schlüssel verfügbar (`.env` ist für die Entwicklung gesperrt). Test vorbereitet: `node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.live.test.ts`; Ergebnis landet in `docs/pruefbericht-ki.json`. |
| **Filum**-Kurzlink und **Tessera**-QR | nur gegen lokalen **Testserver simuliert** (Bearer-Token, Antwortformat aus dem Filum-/Tessera-Quellcode übernommen); nicht gegen laufende Instanzen |
| **authentik/OIDC** | implementiert nach Filum-Muster, **nicht getestet** |
| Reverse Proxy (Caddy), TLS, DNS, öffentliche Domain | **nicht eingerichtet** (Vorlage im Handbuch) |
| Safari/WebKit, Firefox, echte Smartphones | **nicht getestet** (nur Chromium mit Smartphone-Emulation) |
| Lighthouse | nicht ausgeführt; gemessen: öffentliche Seite ≈ 23 KB HTML inkl. CSS, Schriften lokal, ein Skript < 1 KB, keine externen Anfragen |

## Vor dem Produktivbetrieb selbst prüfen

1. Den echten KI-Test einmal mit eigenem Schlüssel ausführen (Befehl oben, Homepage über `AI_LIVE_URL`) und das Ergebnis ansehen.
2. Filum- und Tessera-Anbindung gegen die eigenen Instanzen ausprobieren (Bereich „Teilen“).
3. Anmeldung über OIDC mit einem Testkonto prüfen ([Kapitel 16](handbuch/16-anmeldung-oidc.md)).
4. Veröffentlichte Seiten auf echten Geräten (iPhone mit Safari, Android) ansehen; QR-Code ausdrucken und scannen.
5. Eine Wiederherstellung aus der Sicherung einmal durchspielen ([Kapitel 17](handbuch/17-sicherung.md)).
