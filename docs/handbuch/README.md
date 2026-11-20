# Folium — Handbuch

Willkommen im Handbuch von **Folium**, den selbst gehosteten Linkseiten für
Organisationen, etwa Kanzleien, Praxen, Unternehmen, Vereine oder Verwaltungen.
Teil A richtet sich an alle, die Seiten anlegen, gestalten und teilen,
und setzt keine technischen Vorkenntnisse voraus. Teil B ist für Admins, Teil C
für die IT, die Folium installiert und betreibt.

Stand: Version 0.1.0.

## Inhalt

**Teil A — Arbeiten mit Folium**

| Kapitel | Inhalt |
| --- | --- |
| [1 — Was ist Folium?](01-was-ist-folium.md) | Wofür, Grundbegriffe, Ablauf, Rollen, Datenschutz-Prinzip |
| [2 — Erste Schritte](02-erste-schritte.md) | Anmelden, Ersteinrichtung, die Oberfläche, die erste Seite |
| [3 — Seiten bearbeiten](03-seiten-bearbeiten.md) | Neue Seite, Kopf, alle Eintragsarten, Sortieren, Zeitplan, Bilder, Speichern |
| [4 — Veröffentlichen und Versionen](04-veroeffentlichen-und-versionen.md) | Vorschau, Veröffentlichen, Versionen, Wiederherstellen, Duplizieren, Papierkorb |
| [5 — Design](05-design.md) | Die drei Designrichtungen, Farben und Kontrast, Schriften, Layout, Festhalten |
| [6 — Design aus Homepage übernehmen](06-design-aus-homepage.md) | Analyse, Übertragung prüfen, drei Varianten, was bei Fehlern passiert |
| [7 — Teilen](07-teilen.md) | Adresse, QR-Code, Kurzlink über Filum, Tessera, Quellen messen |
| [8 — Statistik](08-statistik.md) | Was gezählt wird, Diagramme, Export, Grenzen der Zahlen |

**Teil B — Administration**

| Kapitel | Inhalt |
| --- | --- |
| [9 — Domains](09-domains.md) | Standardadresse, eigene Domains, Seite auf der Domain-Wurzel |
| [10 — Konten und Rollen](10-konten-und-rollen.md) | Rollen, Konten, Passwörter, Anmeldesperre, Protokoll |
| [11 — Einstellungen](11-einstellungen.md) | Alle Bereiche der Einstellungsseite, KI-Status und Verbrauch |
| [12 — Datenschutz](12-datenschutz.md) | Was gespeichert wird und was nicht, Textbaustein für die Datenschutzerklärung |

**Teil C — Installation und Betrieb (IT)**

| Kapitel | Inhalt |
| --- | --- |
| [13 — Installation](13-installation.md) | Vom Server mit Docker bis zum ersten Login |
| [14 — Reverse Proxy](14-reverse-proxy.md) | Caddy und nginx, HTTPS, Trennung von Verwaltung und öffentlichen Seiten |
| [15 — Konfiguration](15-konfiguration.md) | Alle Umgebungsvariablen |
| [16 — Anmeldung über OIDC](16-anmeldung-oidc.md) | authentik einrichten, Gruppen auf Rollen abbilden |
| [17 — Sicherung und Wiederherstellung](17-sicherung.md) | Automatisch, von Hand, Export und Import, Umzug |
| [18 — Betrieb und Updates](18-betrieb.md) | Updates, Migrationen, Logs, Kommandozeile |
| [19 — KI-Anbindung](19-ki-anbindung.md) | Anthropic-Schlüssel, Modell, Kosten und Kostenbremse, Live-Test |
| [20 — Sicherheitskonzept](20-sicherheit.md) | Angriffsflächen und Schutz, SSRF, Prompt-Injection, Uploads |
| [21 — Architektur](21-architektur.md) | Aufbau, Datenmodell, Entscheidungen |
| [22 — Tests](22-tests.md) | Server-, Browser- und Container-Tests, CI |
| [23 — Bekannte Einschränkungen](23-einschraenkungen.md) | Grenzen und offene Punkte |

Was tatsächlich geprüft, was simuliert und was noch nicht getestet ist, steht im
[Prüfbericht](../pruefbericht.md).

## Schnelleinstieg in 5 Minuten

1. Folium im Browser öffnen und anmelden ([Kapitel 2](02-erste-schritte.md)).
2. **Neue Seite** wählen und Folgendes festlegen:
   - einen Namen
   - eine Adresse, z. B. `muster`
   - die Vorlage „Organisation“
   - eine Designrichtung

   Dann **Seite anlegen** ([Kapitel 3](03-seiten-bearbeiten.md)).
3. Einträge prüfen und anpassen; rechts zeigt die Vorschau die Seite als
   Smartphone oder Desktop.
4. **Veröffentlichen**: Folium zeigt die Änderungen und prüft Impressum,
   Datenschutz und Kontrast
   ([Kapitel 4](04-veroeffentlichen-und-versionen.md)).
5. Im Bereich **Teilen** die Adresse kopieren oder den QR-Code herunterladen
   ([Kapitel 7](07-teilen.md)).

Passt das Design noch nicht zur Homepage, hilft
[Design aus Homepage übernehmen](06-design-aus-homepage.md). Ein paar Tage später
zeigt die **Statistik**, wie oft die Seite aufgerufen und welche Links geklickt
wurden ([Kapitel 8](08-statistik.md)).

## Für die IT in einem Satz

Die Schritte:
1. `git clone`
2. `.env` aus `.env.example` anlegen und `APP_URL` und `PUBLIC_BASE_URL` setzen
3. `docker compose up -d --build`
4. den Einrichtungscode aus `docker compose logs folium` ablesen

Port 8080 bekommt die öffentliche Domain, Port 8081 nur das Intranet
([Kapitel 13](13-installation.md)).
