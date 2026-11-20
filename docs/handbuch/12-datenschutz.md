# 12 — Datenschutz

[← Handbuch](README.md) · [Weiter: 13 — Installation](13-installation.md)

> Dieses Kapitel richtet sich an Admins und an die Person, die die Datenschutzerklärung Ihrer Organisation pflegt. Es beschreibt das technische Verhalten von Folium 0.1.0. Es ist keine rechtliche Bewertung; diese sollte Ihre Organisation selbst vornehmen bzw. prüfen lassen.

Folium ist so gebaut, dass öffentliche Linkseiten **ohne personenbezogene Daten der Besucher** auskommen. Die Statistik besteht nur aus Tagessummen.

## Besucher der öffentlichen Seiten

| Angabe | Wofür Folium sie verwendet | Gespeichert? |
| --- | --- | --- |
| IP-Adresse | Begrenzung des Klickzählers (höchstens 120 Meldungen pro Minute und Absender) | **Nein.** Nur kurzzeitig im Arbeitsspeicher. Folium schreibt keine Zugriffsprotokolle. |
| Browserkennung (User-Agent) | Bots und Link-Vorschauen erkennen, damit sie getrennt gezählt werden | **Nein.** Gespeichert wird nur, ob ein Aufruf als Bot gezählt wurde. |
| Quelle `?src=…` | Herkunft auswerten (z. B. `?src=instagram`, QR-Codes: `?src=qr`) | Nur als Teil der Tagessumme (höchstens 32 Zeichen, Kleinbuchstaben, Ziffern, Bindestrich; sonst „direkt“) |
| Aufruf einer Seite, Klick auf einen Eintrag | Statistik | Nur als **Tagessumme** je Seite, Eintrag, Quelle und Bot-Kennzeichen |
| Cookies | – | Folium setzt auf öffentlichen Seiten **keine** Cookies (technisch erzwungen: der öffentliche Server entfernt jeden Cookie-Kopf). |
| Herkunftsseite (Referrer), Sprache, Gerät | – | werden nicht ausgewertet |

Weitere Eigenschaften der öffentlichen Seiten:

- Keine externen Ressourcen: Schriften, Bilder und das kleine Zählskript kommen vom eigenen Server. Eine strenge Content-Security-Policy verhindert das Nachladen fremder Inhalte.
- Keine Einzelereignisse in der Datenbank. Folium zählt Aufrufe, keine Personen; eine Person, die eine Seite dreimal öffnet, ergibt drei Aufrufe.
- Ein Klick auf einen Eintrag ist ein gewöhnlicher Link. Die Zählung läuft nebenher; fällt sie aus, funktioniert der Link trotzdem.
- Die Zählung lässt sich ganz abschalten (**Einstellungen → Allgemein**, [Kapitel 11](11-einstellungen.md#statistik-und-aufbewahrung)).

**Was außerhalb von Folium anfällt:** Der Reverse Proxy (z. B. Caddy) verarbeitet bei jedem Aufruf die IP-Adresse und schreibt je nach Konfiguration Zugriffsprotokolle. Art und Dauer dieser Protokolle legt die IT fest ([Kapitel 14](14-reverse-proxy.md)); sie gehören in die Datenschutzerklärung. Gleiches gilt für die Ziele der Links (Homepage, Buchungssystem, soziale Netzwerke), die eigene Datenschutzregeln haben.

## Aufbewahrung und Löschen

| Daten | Aufbewahrung |
| --- | --- |
| Statistik (Tagessummen) | Standard 730 Tage, einstellbar 30–3650 Tage; danach automatisch gelöscht |
| Seiten im Papierkorb | Standard 30 Tage, einstellbar 1–365; danach endgültig gelöscht |
| Statistik gelöschter Seiten | bleibt bis zum Ablauf der Aufbewahrung, in der Auswertung als „Gelöschte Seite“ |
| Sitzungen der Mitarbeitenden | 14 Tage, danach automatisch entfernt |
| Protokoll der Verwaltungsaktionen | unbegrenzt (keine automatische Löschung) |
| Liste der KI-Aufrufe | unbegrenzt (keine automatische Löschung) |
| Sicherungen | automatische: die letzten 14 (`BACKUP_KEEP`); manuelle und Sicherungen vor einer Wiederherstellung: bis jemand sie löscht ([Kapitel 17](17-sicherung.md)) |

Sicherungen enthalten alle Daten zum Zeitpunkt der Sicherung, also auch Statistik und Konten, die inzwischen gelöscht wurden.

## Konten der Mitarbeitenden

Gespeichert werden je Konto: E-Mail-Adresse, Name, Rolle, Passwort-Prüfsumme (scrypt, nie das Passwort selbst), bei authentik-Konten Aussteller und Kennung (`sub`), Zeitpunkt der Anlage und der letzten Anmeldung. Sitzungen liegen nur als SHA-256-Prüfsummen vor. Das Protokoll hält fest, wer wann welche Verwaltungsaktion ausgeführt hat ([Kapitel 10](10-konten-und-rollen.md#protokoll)); dort steht die E-Mail-Adresse auch nach dem Löschen eines Kontos. Bei der Anmeldung über authentik speichert Folium keine Tokens des Anbieters. Die Serverprotokolle von Folium enthalten keine IP-Adressen, Passwörter oder Tokens.

## Analyse fremder Homepages

Beim Ablauf **Design aus Homepage übernehmen** ([Kapitel 6](06-design-aus-homepage.md)) ruft der Folium-Server die eingegebene Homepage auf, liest HTML und CSS und lässt im abgeschotteten Browser-Dienst zwei Bildschirmfotos anfertigen.

- Der Betreiber der untersuchten Website sieht dabei die IP-Adresse des Servers und die Browserkennung `Mozilla/5.0 (compatible; Folium-Designanalyse/1.0)`. Daten von Besuchern oder Mitarbeitenden werden nicht übertragen.
- Ergebnis der Analyse und Bildschirmfotos liegen nur im Arbeitsspeicher, höchstens 2 Stunden; KI-Vorschläge höchstens 24 Stunden. Ein Neustart verwirft beides.
- Dauerhaft gespeichert werden nur, wenn die KI aufgerufen wurde, Zeitpunkt, Konto, untersuchte Adresse, Modell, Tokenzahl, geschätzte Kosten und Ergebnis (Liste der KI-Aufrufe, [Kapitel 11](11-einstellungen.md#ki-für-design-aus-homepage)), sowie ein Protokolleintrag.

Analysieren Sie nur öffentlich zugängliche Websites, in der Regel die eigene Homepage.

## Übertragung an Anthropic (KI)

Daten gehen erst an die KI, wenn eine Person im Schritt **Übertragung prüfen** ausdrücklich **An Claude senden** wählt. Folium zeigt vorher an, was übertragen wird. Übertragen werden:

- die Adresse der untersuchten Homepage und die daraus gelesenen Merkmale (Farben, Schriften, Knöpfe, Logo-Adressen, Angaben zu Bildern, Rundungen, Schatten, Titel und Beschreibung),
- ein Textauszug der Homepage (höchstens 4 000 Zeichen),
- zwei Bildschirmfotos der Homepage (Desktop und Smartphone), sofern der Browser-Dienst eingerichtet ist,
- von der Linkseite: Name und Kurzbeschreibung aus dem Kopf, die **Art** der Einträge (z. B. „link, action, location“) und ob ein Titelbild vorhanden ist, dazu festgehaltene Designwerte.

Nicht übertragen werden Inhalte der Einträge (Titel, Telefonnummern, Adressen), Statistik, Konten oder sonstige Daten aus Folium. Personenbezogene Daten Ihrer Besucher verarbeitet Folium dafür ohnehin nicht. Die Übertragung geht über die Schnittstelle von Anthropic (USA). Ob ein Vertrag zur Auftragsverarbeitung nötig und abgeschlossen ist und welche Speicherfristen Anthropic für API-Daten anwendet, sollte Ihre Organisation vor dem ersten echten Einsatz prüfen. Ohne API-Schlüssel findet keine Übertragung statt ([Kapitel 19](19-ki-anbindung.md)).

## Weitere Verbindungen

- **Filum** (Kurzlink anlegen): übertragen werden die öffentliche Adresse der Seite und der Titel „Linkseite: <Name der Seite>“.
- **Tessera** (QR-Code gestalten): übertragen werden Name der Seite, die Adresse mit `?src=qr` und ein Hinweis „Erstellt aus Folium für /<adresse>“.
- **authentik** (Anmeldung): Folium erhält E-Mail-Adresse, Name und Gruppen der angemeldeten Person.

Alle drei Dienste betreiben Sie in der Regel selbst. Folium sendet keine Telemetrie und prüft nicht auf Updates.

## Rechtsgrundlage

Für die kurzzeitige technische Verarbeitung der IP-Adresse beim Ausliefern der Seiten kommt nach unserem Verständnis Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und funktionsfähigen Betrieb) in Betracht. Da Folium auf öffentlichen Seiten keine Cookies setzt und nichts im Endgerät speichert oder ausliest, ist für Folium selbst nach unserem Verständnis keine Einwilligung nach § 25 TDDDG erforderlich. Beides ist keine Rechtsberatung und sollte im Einzelfall geprüft werden, insbesondere zusammen mit den Protokollen des Reverse Proxy.

## Textbaustein für die Datenschutzerklärung

Vorschlag zum Einfügen in die Datenschutzerklärung Ihrer Homepage. **Bitte vor der Verwendung prüfen lassen** und die Platzhalter ergänzen:

> Beim Aufruf unserer Linkseiten unter [Adresse der Linkseiten, z. B. links.example.com] zählen wir Aufrufe und Klicks ausschließlich als anonyme Tagessummen. Es werden keine Cookies gesetzt und keine IP-Adressen oder Gerätekennungen gespeichert. Der Webserver verarbeitet die IP-Adresse kurzzeitig technisch zur Auslieferung (Art. 6 Abs. 1 lit. f DSGVO); [Aufbewahrung der Serverprotokolle ergänzen].

Werden weitere Domains genutzt ([Kapitel 9](09-domains.md)), gehören sie ebenfalls in den Text. Ist die Zählung abgeschaltet, entfällt der erste Satz.

---

[← Handbuch](README.md) · [Weiter: 13 — Installation](13-installation.md)
