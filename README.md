<img src="src/web/public/favicon.svg" width="72" alt="Folium">

# Folium

[![Tests, Image & Release](https://github.com/PBaumfalk/Folium/actions/workflows/ci.yml/badge.svg)](https://github.com/PBaumfalk/Folium/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
[![Docker-Image](https://img.shields.io/badge/ghcr.io-pbaumfalk%2Ffolium-blue?logo=docker)](https://github.com/PBaumfalk/Folium/pkgs/container/folium)

**Linkseiten auf der eigenen Domain, mit Entwurf, Versionen und einem Design, das zur Homepage passt.**
Folium ist eine selbst gehostete Alternative zu Linktree und ähnlichen Diensten,
gedacht für Kanzleien, Praxen, Unternehmen, Vereine und Verwaltungen. Eine
Adresse wie `links.example.com/team` gehört in die Instagram-Bio, auf die
Visitenkarte, in die E-Mail-Signatur oder auf den Flyer. Wer sie öffnet, kann
mit einem Tipp anrufen, einen Termin anfragen, den Weg zum Standort finden oder
die passende Seite der Homepage aufrufen. Für die Organisation, jede Person,
jeden Standort und jede Kampagne gibt es eine eigene Seite.

Folium braucht kein Abo und kein Konto bei einem Anbieter. Besucher bekommen
keine Cookies, und gespeichert werden nur Tagessummen, keine IP-Adressen.
Entwürfe bleiben unsichtbar, bis jemand auf **Veröffentlichen** klickt.

*Folium* ist lateinisch für **Blatt**. Folium gehört zur Familie von
[Filum](https://github.com/PBaumfalk/Filum) (Kurzlinks, „Faden“) und
[Tessera](https://github.com/PBaumfalk/Tessera) (QR-Codes, „Mosaiksteinchen“).

> **English abstract:** Self-hosted link-in-bio pages for firms, practices, companies and associations. It offers
> multiple pages with drafts, published versions, restore, duplicate and trash,
> plus prominent actions (call, appointment, contact) and scheduled visibility.
> There are three design directions as presets, with a data-only theme editor and
> WCAG contrast enforcement. *Adopt design from homepage* analyses a website's
> HTML, CSS and screenshots taken in an isolated browser without internet access.
> All requests are SSRF-checked. Claude then proposes three themes as validated
> structured output, with a cost budget. Statistics are aggregate-only, with no
> cookies and no IPs. Pages can be shared via QR, Filum or Tessera. Other features
> are export/import, backups, OIDC and two strictly separated ports. It ships as
> Docker Compose (app + browser sidecar). The UI and docs are in German.

![Editor mit Eintragsliste, Inspektor und Live-Vorschau](docs/screenshots/editor.png)

## 📖 Handbuch

Die vollständige Anleitung steht im **[Handbuch](docs/handbuch/README.md)**: 23
Kapitel mit Bildschirmfotos. Die Kapitel für alle, die Seiten pflegen, kommen
ohne IT-Kenntnisse aus; dazu gibt es eigene Teile für Admins und die IT.
- **Für alle:** [Was ist Folium?](docs/handbuch/01-was-ist-folium.md),
  [die erste Seite in fünf Minuten](docs/handbuch/02-erste-schritte.md),
  [Design](docs/handbuch/05-design.md) und
  [Design aus Homepage übernehmen](docs/handbuch/06-design-aus-homepage.md)
- **Für die IT:** [Installation](docs/handbuch/13-installation.md),
  [Reverse Proxy](docs/handbuch/14-reverse-proxy.md),
  [KI-Anbindung](docs/handbuch/19-ki-anbindung.md) und
  [Sicherheitskonzept](docs/handbuch/20-sicherheit.md)

Was tatsächlich geprüft ist und was nur vorbereitet, steht ehrlich in
[Kapitel 22](docs/handbuch/22-tests.md) und
[Kapitel 23](docs/handbuch/23-einschraenkungen.md).

## Installation

Folium ist eine Server-Anwendung aus zwei Containern:
- `folium` liefert die öffentlichen Seiten und die Verwaltung aus.
- `folium-browser` macht die Bildschirmfotos für die Homepage-Analyse. Er hängt
  in einem internen Netz **ohne Internetzugang**.

<details>
<summary><strong>🧪 Ausprobieren auf dem eigenen Rechner</strong> (Docker Desktop, fünf Minuten)</summary>

```bash
git clone https://github.com/PBaumfalk/Folium.git && cd Folium
cp .env.example .env
# in .env: APP_URL=http://localhost:8081 und PUBLIC_BASE_URL=http://localhost:8080
docker compose up -d --build
docker compose logs folium | grep Einrichtungscode
```

Dann <http://localhost:8081> öffnen, den Einrichtungscode eingeben und das
Admin-Konto anlegen. Unter **Einstellungen** Impressum und Datenschutzerklärung
eintragen, dann entsteht unter **Neue Seite** mit der Vorlage „Organisation“ in
einer Minute eine vollständige Beispielseite. Veröffentlichte Seiten erscheinen
unter `http://localhost:8080/<adresse>`. Wieder entfernen:
`docker compose down -v`.
</details>

<details>
<summary><strong>🖥️ Auf einem Server</strong> (für die IT: Docker Compose hinter Caddy)</summary>

```bash
git clone https://github.com/PBaumfalk/Folium.git && cd Folium
cp .env.example .env          # APP_URL, PUBLIC_BASE_URL, optional ANTHROPIC_API_KEY
docker compose up -d --build  # Docker Compose 2.24 oder neuer
docker compose logs folium    # Einrichtungscode ablesen
```

Fertige Images statt selbst zu bauen: in `.env`
`FOLIUM_IMAGE=ghcr.io/pbaumfalk/folium:latest` und
`FOLIUM_BROWSER_IMAGE=ghcr.io/pbaumfalk/folium-browser:latest` setzen, dann
`docker compose pull && docker compose up -d`. Die CI baut beide Images für amd64
und arm64.

Folium trennt Besucher und Verwaltung auf zwei Ports:

| Port | Inhalt | Im Reverse Proxy für |
| --- | --- | --- |
| 8080 | nur veröffentlichte Linkseiten, keine API | die öffentliche Domain, z. B. `links.example.com` |
| 8081 | Verwaltung und API | eine interne Adresse, nur über Intranet oder VPN |

Caddy- und nginx-Beispiele, HTTPS, Updates und Sicherung stehen in
[Kapitel 13–18](docs/handbuch/13-installation.md).
</details>

## Funktionen im Überblick

| Editorial | Modern Boutique | Signature |
| --- | --- | --- |
| ![Editorial auf dem Smartphone](docs/screenshots/oeffentlich-muster-smartphone.png) | ![Boutique auf dem Smartphone](docs/screenshots/oeffentlich-boutique-smartphone.png) | ![Signature auf dem Smartphone](docs/screenshots/oeffentlich-signature-smartphone.png) |

- **Mehrere Linkseiten:** für die Organisation, einzelne Personen, Standorte und
  Kampagnen. Jede Seite
  hat eine eigene Adresse, auf Wunsch auch eine eigene Domain
  ([Kapitel 3](docs/handbuch/03-seiten-bearbeiten.md),
  [9](docs/handbuch/09-domains.md)).
- **Hauptaktionen zuerst:** Anrufen, Termin, E-Mail und Kontakt als große
  Knöpfe. Dazu Links mit Symbol oder Bild, Überschriften, Standorte mit
  Routenlink, Sprechzeiten und Social Media.
- **Bedienung:** Einträge per Maus oder Tastatur sortieren. Einträge lassen sich
  zeitgesteuert ein- und ausblenden, und Gelöschtes lässt sich zurückholen
  ([Kapitel 3](docs/handbuch/03-seiten-bearbeiten.md)).
- **Entwurf und Versionen:** Folium speichert automatisch. Vor dem
  Veröffentlichen zeigt es die Änderungen und prüft Impressum, Datenschutz und
  Kontrast. Jede Version lässt sich wiederherstellen, dazu gibt es Duplizieren
  und einen Papierkorb
  ([Kapitel 4](docs/handbuch/04-veroeffentlichen-und-versionen.md)).
- **Drei Designrichtungen als Startpunkt**, danach frei anpassbar: Farben mit
  Kontrastprüfung, zehn mitgelieferte Schriften oder eigene, Knopfform,
  Kopflayout, Liste, Karten oder Bildkacheln. Eigenes CSS ist bewusst nicht
  möglich ([Kapitel 5](docs/handbuch/05-design.md)).
- **Design aus Homepage übernehmen:** Folium liest Farben, Schriften und Knöpfe
  der Homepage aus und macht Bildschirmfotos. Vor dem Senden zeigt es, was an
  Claude geht und was es kostet. Claude schlägt drei Varianten mit Ihren eigenen
  Inhalten vor; die Übernahme ändert nur den Entwurf
  ([Kapitel 6](docs/handbuch/06-design-aus-homepage.md)).
- **Teilen:** Folium erzeugt einen QR-Code als PNG oder SVG, einen Kurzlink über
  Filum oder eine Übergabe an Tessera. Quellen lassen sich mit `?src=` messen
  ([Kapitel 7](docs/handbuch/07-teilen.md)).
- **Ehrliche Statistik:** Folium zählt Aufrufe und Klicks als Tagessummen. Bots
  und Link-Vorschauen werden getrennt gezählt, die Daten lassen sich als CSV
  exportieren. Eine ausgefallene Zählung blockiert nie einen Link
  ([Kapitel 8](docs/handbuch/08-statistik.md)).
- **Für den Betrieb gebaut:** Folium sichert sich automatisch, und jede
  Sicherung lässt sich per Klick wiederherstellen. Seiten lassen sich als ZIP
  exportieren und importieren. Dazu kommen Rollen, die Anmeldung über authentik
  (OIDC) und ein Änderungsprotokoll, abrufbar über die API
  ([Kapitel 10](docs/handbuch/10-konten-und-rollen.md),
  [17](docs/handbuch/17-sicherung.md)).

| Design aus Homepage: drei Varianten | Statistik |
| --- | --- |
| ![Drei Designvarianten aus der Homepage-Analyse](docs/screenshots/analyse-varianten.png) | ![Statistik mit Tageswerten und Links](docs/screenshots/statistik.png) |

## Datenschutz und Sicherheit

- **Öffentliche Seiten:**
  - keine Cookies, keine externen Schriften oder Skripte
  - eine strenge Content Security Policy mit genau einem Skript per Hash
  - rund 23 KB HTML mit CSS
- **Besuchsdaten:** nur Tagessummen je Seite, Eintrag und Quelle, keine
  IP-Adressen und keine Gerätekennungen. Einen Textbaustein für die
  Datenschutzerklärung enthält
  [Kapitel 12](docs/handbuch/12-datenschutz.md).
- **Homepage-Analyse gegen SSRF geschützt:**
  - nur Port 80 und 443
  - eigene DNS-Prüfung, jede aufgelöste Adresse muss öffentlich sein
  - Verbindung an die geprüfte IP gebunden
  - jede Weiterleitung wird neu geprüft
  - der Browser selbst hat kein Netz, Folium beantwortet jede seiner Anfragen
- **KI:**
  - Website-Inhalte gelten als Daten, nie als Anweisung
  - die Antwort muss einem festen JSON-Schema entsprechen und wird danach
    streng geprüft
  - Werte, die als „erkannt“ ausgegeben werden, brauchen einen Beleg aus der
    Analyse
  - Kostenbremse je Stunde, Tag und Monat
- **Uploads:** Folium erkennt Dateien an ihrer Signatur und kodiert Bilder neu.
  SVG-Dateien werden über eine Positivliste bereinigt.

Details: [Kapitel 20 – Sicherheitskonzept](docs/handbuch/20-sicherheit.md).

## Für Entwickler

TypeScript durchgehend, ein Node-24-Prozess:
- zwei getrennte Fastify-5-Instanzen, 8080 öffentlich und 8081 Verwaltung
- SQLite im WAL-Modus über better-sqlite3
- Oberfläche in React 19 mit Vite und eigenem CSS
- Seiten serverseitig gerendert, das Design als validierte Daten (zod)
- `playwright-core` gegen einen Browser-Dienst ohne Internet
- `@anthropic-ai/sdk`, austauschbar über die Schnittstelle `DesignAiProvider`

Warum so: [Kapitel 21 – Architektur](docs/handbuch/21-architektur.md).

```bash
npm install
npm run build:web
npx tsx scripts/demo.ts             # Demo „Muster & Partner“: http://localhost:18081
                                    # admin@example.test / demo-passwort-123
AI_PROVIDER=fake DEMO_BROWSER=1 npx tsx scripts/demo.ts   # mit simulierter KI und Bildschirmfotos
npm test                            # 137 Server-Tests (vitest), davon 1 nur mit KI-Schlüssel
npm run typecheck
scripts/e2e-local.sh                # 33 Browser-Tests, Desktop und Smartphone, mit axe-core
scripts/docker-lifecycle-test.sh    # Container: Neustart, Persistenz, Abschottung, Sicherung
npm run docs:check                  # Links und Anker in README und Handbuch prüfen
```

Alle Testebenen laufen bei jedem Push in GitHub Actions, die Server-Tests in drei
Zeitzonen. Ein Image entsteht nur, wenn alle grün sind
([Kapitel 22](docs/handbuch/22-tests.md)). Änderungen stehen im [Änderungsprotokoll](CHANGELOG.md).

## Lizenz

[MIT](LICENSE), © 2026 Patrick Baumfalk.

Mitgeliefert werden:
- zehn Schriften unter der SIL Open Font License 1.1, unter anderem Newsreader,
  Hanken Grotesk, Aleo, Bricolage Grotesque und Instrument Sans (`fonts/`)
- Symbole aus [Lucide](https://lucide.dev) (ISC)

Alle Beispieldaten (Muster & Partner, Musterstadt, Beispielhausen) sind erfunden.

## Hinweis

Folium ist ein Werkzeug; wer es betreibt, ist für die verarbeiteten Daten
verantwortlich. Bitte den Textbaustein für die Datenschutzerklärung in
[Kapitel 12](docs/handbuch/12-datenschutz.md) vor der Veröffentlichung prüfen
oder prüfen lassen. Die Designvorschläge der KI sind Vorschläge; veröffentlicht
wird erst, was ein Mensch freigibt. Die Software wird ohne Gewähr bereitgestellt
(siehe [LICENSE](LICENSE)).
