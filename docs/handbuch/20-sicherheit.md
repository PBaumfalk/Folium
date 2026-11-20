[← Handbuch](README.md) · [Weiter: 21 — Architektur](21-architektur.md)

# 20 — Sicherheitskonzept

> Dieses Kapitel richtet sich an die IT und an Entwickler. Alle Angaben sind im Code nachgeprüft; die Dateien stehen jeweils dabei.

## Angriffsflächen im Überblick

| Bedrohung | Schutz in Folium |
| --- | --- |
| Verwaltung über die öffentliche Domain erreichbar | Zwei getrennte Fastify-Instanzen. Port 8080 kennt keine `/api`-Routen und keine Entwürfe (`tests/separation.test.ts`, Container-Test). |
| Unbefugte Änderungen | Nur angemeldete Konten; drei Rollen, serverseitig je Route geprüft. Keine Registrierung, keine anonyme Schreibroute. |
| Standardzugangsdaten | Gibt es nicht. Das erste Konto braucht den einmaligen Einrichtungscode aus dem Serverprotokoll. |
| Passwort raten | Sperre 15 Minuten nach 5 Fehlversuchen je Konto; Rate-Limit 30 Anmeldungen pro Minute je Absender; gleiche Rechenzeit für unbekannte Konten. |
| Cross-Site-Anfragen (CSRF) | Cookie `SameSite=Strict` und Origin-Prüfung für jede schreibende API-Anfrage. |
| Schadcode auf öffentlichen Seiten (XSS) | Inhalte und Design sind Daten, kein HTML/CSS/JS; alle Texte maskiert; CSP mit genau einem Skript per Hash. |
| Schädliche Uploads | Typ per Dateisignatur, Bilder neu kodiert, SVG per Positivliste bereinigt, Dateiname = Inhalts-Hash, 5 MB. |
| SSRF über die Homepage-Analyse | Eigener DNS-Abruf, alle Adressen müssen öffentlich sein, Verbindung an die geprüfte IP, jede Weiterleitung neu geprüft, Limits. |
| Kompromittierter Browser | Browser-Dienst ohne Internet; jede Anfrage beantwortet Folium selbst über den geschützten Abruf. |
| Manipulation der KI | Website-Inhalt nur als Datenblock, keine Werkzeuge, Schema-Ausgabe, strenge Nachprüfung ([Kapitel 19](19-ki-anbindung.md)). |
| Manipulierte Import-Archive | Pfadprüfung gegen Zip-Slip, Größengrenzen, Inhalte neu geprüft. |
| Ausbruch aus dem Container | Schreibgeschützt, ohne Root, alle Capabilities entzogen, `no-new-privileges`, Speicher- und Prozessgrenzen. |

## Trennung der Ports

Ein Node-Prozess startet zwei Fastify-Instanzen (`src/server/app.ts`):

- **8080 öffentlich** (`src/server/public/server.ts`): veröffentlichte Seiten (`/`, `/:slug`), mitgelieferte Schriften (`/fonts/…`), hochgeladene Dateien (`/assets/…`), Klickzähler (`POST /c`), `/robots.txt`, `/healthz`. Request-Body höchstens 4 KB. Jede Antwort verliert einen eventuellen `Set-Cookie`-Header.
- **8081 Verwaltung** (`src/server/admin/server.ts`): React-Oberfläche und JSON-API unter `/api/v1/…`, Vorschau der Entwürfe, Body bis 2 MB (Import bis 100 MB).

Die Trennung entsteht durch den Aufbau, nicht durch Konfiguration: Die öffentliche Instanz registriert die Verwaltungsrouten gar nicht. Unbekannte Hostnamen bekommen auf Port 8080 eine neutrale 404-Seite. In `docker-compose.yml` sind beide Ports standardmäßig nur an `127.0.0.1` gebunden; der Reverse Proxy gibt 8080 für die öffentliche Domain frei, 8081 nur intern bzw. per VPN ([Kapitel 14](14-reverse-proxy.md)).

## Anmeldung, Sitzungen, Rollen

Quellen: `src/server/services/auth.ts`, `src/server/admin/routes/auth.ts`, `src/server/lib/crypto.ts`.

- **Ersteinrichtung:** Solange es kein Konto gibt, schreibt Folium einen Einrichtungscode (`123-456-789`, 9 Ziffern, oder `SETUP_CODE`) ins Protokoll. `POST /api/v1/setup` vergleicht ihn zeitkonstant, legt das erste Admin-Konto an und löscht den Code. Danach antwortet die Route mit 409.
- **Passwörter:** mindestens 12, höchstens 200 Zeichen; scrypt mit N = 32768, r = 8, p = 1, 16 Byte Salz, Unicode-normalisiert (NFKC). Ein Passwortwechsel beendet alle Sitzungen des Kontos.
- **Drosselung:** 5 Fehlversuche innerhalb von 15 Minuten sperren das Konto für 15 Minuten (Zähler im Arbeitsspeicher, je E-Mail-Adresse). Zusätzlich begrenzt ein Rate-Limit `/api/v1/login` auf 30 und `/api/v1/setup` auf 10 Anfragen pro Minute. Für unbekannte Konten rechnet Folium einen Schein-Hash, damit die Antwortzeit nichts verrät.
- **Sitzungen:** 256 Bit Zufall als Cookie `folium_session`; in der Datenbank steht nur der SHA-256-Hash. Cookie `HttpOnly`, `SameSite=Strict`, `Secure`, sobald `APP_URL` mit `https://` beginnt (oder `SECURE_COOKIES=true`). Laufzeit fest 14 Tage ab Anmeldung. Gesperrte Konten verlieren sofort alle Sitzungen; abgelaufene Sitzungen löscht eine stündliche Pflegeaufgabe.
- **Origin-Prüfung:** Jede Anfrage an `/api/…` mit einer anderen Methode als GET, HEAD oder OPTIONS braucht einen `Origin`-Header, der zu `APP_URL` oder zum eigenen `Host` passt; fehlt er, muss `Sec-Fetch-Site: same-origin` gesetzt sein. Sonst: `403 bad_origin`.
- **Rollen:** `viewer` (Ansehen) < `editor` (Redaktion) < `admin`. Jede Route ruft `need(req, rolle)` auf: ohne Anmeldung 401, zu geringe Rolle 403. In den Routen sind 17 Prüfungen auf Ansehen, 19 auf Redaktion und 13 auf Admin hinterlegt. Admin-only sind u. a. Konten, Einstellungen, Import, Sicherungen und die KI-Verbindungsprüfung. Das letzte aktive Admin-Konto kann nicht herabgestuft, gesperrt oder gelöscht werden.
- **OIDC** (optional, [Kapitel 16](16-anmeldung-oidc.md)): Authorization Code mit PKCE (S256), `state` und `nonce`; ein lokales Konto wird nur bei bestätigter E-Mail verknüpft.
- **Antwort-Header der Verwaltung:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN`. Eine eigene CSP für die Verwaltungsoberfläche gibt es noch nicht ([Kapitel 23](23-einschraenkungen.md)).

## Öffentliche Seiten

Quellen: `src/server/public/pages.ts`, `src/server/render/*`, `src/shared/content.ts`, `src/shared/theme.ts`.

- **Inhalt und Design sind Daten.** Seiteninhalte werden mit zod geprüft (z. B. höchstens 100 Einträge, Ziele nur `http`, `https`, `tel`, `mailto`, Steuerzeichen werden entfernt). Das Design besteht nur aus `#RRGGBB`-Farben, Schrift-IDs aus einer festen Liste und Aufzählungswerten. Daraus erzeugt der Renderer CSS-Variablen in festen Vorlagen; eigenes CSS, HTML oder JavaScript ist nicht vorgesehen.
- **Escaping:** Jeder Text und jedes Attribut läuft durch `esc()` (`& < > " '`). Getestet in `tests/render.test.ts`.
- **CSP:**

  ```
  default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'unsafe-inline';
  script-src 'sha256-…'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  ```

  Das einzige Skript (Klickmeldung per `sendBeacon` und die mitlaufende Hauptaktion) ist im Code fest hinterlegt; sein Hash wird beim Start berechnet. Inline-Styles sind erlaubt, weil das CSS der Seite eingebettet ist; es enthält nur geprüfte Werte.
- **Weitere Header:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ohne Kamera, Mikrofon, Standort. HSTS setzt der Reverse Proxy.
- **Keine Cookies, keine externen Ressourcen.** Schriften und Bilder kommen vom eigenen Host. Links sind normale `<a href>` zum Ziel und funktionieren ohne JavaScript.
- **Klickzähler** `POST /c`: höchstens 1 KB, 120 Meldungen pro Minute je Absender, antwortet immer `204`. Gezählt wird nur, wenn Seite und Eintrag veröffentlicht existieren. IP-Adressen werden nicht gespeichert ([Kapitel 12](12-datenschutz.md)).
- **Entwürfe:** Der öffentliche Server liest ausschließlich `page_versions` über `published_version_id`. Die Vorschau der Entwürfe gibt es nur auf Port 8081, nach Anmeldung, mit Banner, `noindex` und eigener CSP.

## Uploads

Quellen: `src/server/services/assets.ts`, `src/server/services/svg.ts`, `src/server/admin/routes/assets.ts`.

- Ab Redaktion; eine Datei je Anfrage, höchstens **5 MB**.
- **Typ nur anhand der ersten Bytes:** PNG, JPEG, WebP, AVIF, GIF, SVG, WOFF2, TTF, OTF. Dateiname und angegebener Typ zählen nicht. Dateien unter 12 Byte werden abgelehnt.
- **Rasterbilder** werden mit sharp dekodiert (höchstens 40 Mio. Pixel, nur das erste Bild bei Animationen), nach EXIF gedreht und als WebP in den Breiten 400/800/1200/1600 und Originalbreite (höchstens 2400 px) neu kodiert. Metadaten gehen dabei verloren; das Original wird nicht gespeichert.
- **SVG** durchläuft eine Positivliste von Elementen und Attributen: keine Skripte, keine Ereignisattribute, kein `foreignObject`, Verweise nur auf interne `#id`, kein `javascript:`/`data:` in Werten. SVG wird nur als `<img>` eingebunden und mit `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` ausgeliefert.
- **Schriften** werden nach Signaturprüfung unverändert gespeichert.
- **Dateiname** = erste 32 Hex-Zeichen des SHA-256 des Inhalts. `/assets/…` akzeptiert nur Namen nach festem Muster, die in der Datenbank stehen.

## Homepage-Analyse und SSRF-Schutz

Die Analyse ruft im Auftrag einer angemeldeten Person fremde Adressen ab. Ohne Schutz ließen sich so interne Dienste oder Cloud-Metadaten abfragen. Quellen: `src/server/lib/safefetch.ts` (aus Filum übernommen und angepasst), `src/server/analysis/*`.

**Jeder einzelne Abruf** (Seite, Stylesheet, jede Anfrage des Browsers, jede Weiterleitung):

1. Nur `http:` und `https:`, keine Zugangsdaten in der Adresse, nur **Ports 80 und 443**.
2. **Eigene Namensauflösung** mit allen Ergebnissen (`dns.lookup(…, { all: true })`). **Jede** zurückgegebene Adresse muss erlaubt sein, sonst wird abgebrochen. So hilft es nicht, eine öffentliche und eine interne Adresse zu mischen.
3. Die Verbindung geht **genau an die geprüfte IP**; undici fragt das DNS nicht erneut (kein DNS-Rebinding).
4. Weiterleitungen werden einzeln verfolgt und jede Station neu geprüft, höchstens **5**.
5. Limits: 10 s je Abruf; HTML 2 MB, Stylesheets 1 MB, im Browser Skripte und Schriften 1 MB, sonstiges 5 MB. Größere Antworten werden abgebrochen.

**Gesperrte Netze** (`classifyAddress`):

| Immer gesperrt | Privat (gesperrt, außer ausdrücklich freigegeben) |
| --- | --- |
| IPv4: `0.0.0.0/8`, `127.0.0.0/8` (Loopback), `169.254.0.0/16` (Link-Local, Cloud-Metadaten `169.254.169.254`), `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4` | IPv4: `10.0.0.0/8`, `100.64.0.0/10` (CGNAT), `172.16.0.0/12`, `192.168.0.0/16` |
| IPv6: `::`, `::1`, `::/96`, `100::/64`, `2001::/32` (Teredo), `2001:db8::/32`, `2002::/16` (6to4), `fe80::/10`, `fec0::/10`, `64:ff9b:1::/48`, `ff00::/8` | IPv6: `fc00::/7` |

IPv4-mapped (`::ffff:a.b.c.d`) und NAT64-Adressen (`64:ff9b::/96`) werden auf die eingebettete IPv4-Adresse zurückgeführt und danach bewertet. Schreibweisen wie Hex- oder Dezimal-IP normalisiert der URL-Parser vor der Prüfung (getestet in `tests/safefetch.test.ts`, 12 Tests).

**Ausnahmen** nur für Tests oder das Intranet: `ANALYSIS_ALLOW_HOSTS` (Hostnamen, `*.domain`, IPs oder Netze in CIDR-Schreibweise) und `ANALYSIS_ALLOW_PRIVATE=true` (private Netze erlauben; die „immer gesperrten“ bleiben gesperrt). Für Einträge in `ANALYSIS_ALLOW_HOSTS` gelten weder Netz- noch Portsperre. Im Betrieb beide leer lassen.

**Budget je Analyse:** höchstens 15 Abrufe in 30 s für HTML und bis zu 10 Stylesheets; der Browser hat ein eigenes Budget von 120 Abrufen in 45 s und lädt höchstens 40 Unterressourcen je Bildschirmfoto.

### Browser-Dienst ohne Internet

Bildschirmfotos macht ein Chromium im Dienst `folium-browser` (offizielles Playwright-Image, `playwright-core run-server`, höchstens 2 Verbindungen). Er hängt nur am Docker-Netz `folium-intern` mit `internal: true` und hat damit keinen Weg ins Internet und in kein anderes Netz.

Folium verbindet sich per WebSocket (`BROWSER_WS_URL`) und legt eine **Abfangschicht** über jeden Browser-Kontext (`src/server/analysis/browser.ts`):

- `context.route('**/*')`: Jede Anfrage wird abgefangen. Nur `GET` auf `http`/`https`; alles andere wird verworfen. Folium holt die Antwort selbst über den geschützten Abruf und reicht nur Status, Inhaltstyp und Inhalt an den Browser zurück (`route.fulfill`).
- WebSockets werden sofort geschlossen, Service Worker blockiert, Downloads und Berechtigungen abgeschaltet.
- JavaScript der Seite läuft (für eine realistische Darstellung), aber nur in diesem abgeschotteten Kontext.

Selbst ein durch die untersuchte Seite übernommener Browser erreicht damit nur Folium, und Folium ruft für ihn nur ab, was auch der geschützte Abruf erlaubt. Umgekehrt lehnt die Analyse den Browser-Dienst selbst als internes Ziel ab (Container-Test: `http://folium-browser:3000/` → 422). Der Chromium läuft im Container ohne eigene Sandbox; die Abschottung leisten Netz und Abfangschicht.

Ohne Browser-Dienst (`BROWSER_WS_URL=` leer) analysiert Folium nur HTML und CSS.

## KI

Website-Inhalte gehen nur als markierter Datenblock an die KI, die KI hat keine Werkzeuge, die Ausgabe ist an ein JSON-Schema gebunden und wird danach streng geprüft. Ein Vorschlag ändert nur den Entwurf und erst auf ausdrücklichen Klick. Der API-Schlüssel bleibt auf dem Server; eine Kostenbremse begrenzt Aufrufe je Person, Tag und Monat. Einzelheiten in [Kapitel 19](19-ki-anbindung.md).

## Import

`POST /api/v1/import` (nur Admin, `src/server/services/io.ts`):

- Archiv höchstens 100 MB, entpackt zusammen höchstens 100 MB (geprüft vor und während des Lesens).
- **Zip-Slip:** Einträge mit `..`, absolutem Pfad, Backslash oder Laufwerksbuchstaben brechen den Import ab. Das Archiv wird nur im Speicher gelesen, nie ins Dateisystem entpackt.
- Beschädigte Archive führen zu `422`, nicht zum Absturz (`tests/review-fixes.test.ts`).
- Dateien laufen erneut durch die Upload-Prüfung; Inhalte und Designs durch die normalen Schemata. Importierte Seiten werden immer als **neue Entwürfe** angelegt, nichts wird überschrieben.

## Container-Härtung

Aus `Dockerfile` und `docker-compose.yml`:

| Maßnahme | `folium` | `folium-browser` |
| --- | --- | --- |
| Benutzer | `node` (kein root) | `pwuser` (kein root) |
| Root-Dateisystem | schreibgeschützt; `/tmp` als tmpfs 64 MB, Daten nur im Volume `/data` | schreibgeschützt; tmpfs für `/tmp` (256 MB) und `/home/pwuser` (64 MB) |
| Capabilities | `cap_drop: ALL` | `cap_drop: ALL` |
| `no-new-privileges` | ja | ja |
| Speicher / Prozesse | 768 MB / 200 | 1 GB / 300 |
| Netze | `default` und `folium-intern` | nur `folium-intern` (ohne Internet) |
| Sonstiges | `init: true`, Healthcheck `folium health`, npm/npx/corepack im Image entfernt, Logrotation | `init: true`, Logrotation |

## Protokoll

Verwaltungsaktionen landen in `audit_log` (wer, wann, was), darunter Anmeldung, Einrichtung, Veröffentlichen, Export und Import, Sicherungen, Teilen über Filum/Tessera, Homepage-Analysen und KI-Vorschläge mit Modell und Kosten.

## Grenzen

- Die Verwaltung hat noch keine eigene CSP; sie sollte ohnehin nur intern erreichbar sein.
- Die Drosselung der Anmeldung liegt im Arbeitsspeicher und beginnt nach einem Neustart von vorn.
- Ein Admin-Konto darf alles. Schützen Sie es gut, idealerweise über OIDC mit zweitem Faktor im Identity Provider.
- Schutz vor volumetrischen Angriffen ist Aufgabe des Reverse Proxy.
- Weitere offene Punkte in [Kapitel 23](23-einschraenkungen.md).

---

[← Handbuch](README.md) · [Weiter: 21 — Architektur](21-architektur.md)
