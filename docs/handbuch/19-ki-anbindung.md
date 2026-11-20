[← Handbuch](README.md) · [Weiter: 20 — Sicherheitskonzept](20-sicherheit.md)

# 19 — KI-Anbindung

> Dieses Kapitel richtet sich an die IT und an Entwickler. Die Bedienung der Funktion „Design aus Homepage übernehmen“ beschreibt [Kapitel 6](06-design-aus-homepage.md).

Folium nutzt die KI an genau einer Stelle: Aus einer bereits abgesichert untersuchten Homepage schlägt Claude (Anthropic) drei Gestaltungsvarianten für eine Linkseite vor. Alles andere, auch der komplette Design-Editor, funktioniert ohne KI.

**Stand der Prüfung:** Der echte Aufruf der Anthropic-API ist vollständig implementiert und ein Live-Test ist vorbereitet, wurde aber **noch nicht mit einem echten Schlüssel ausgeführt** (siehe [Prüfbericht](../pruefbericht.md)). Geprüft sind der gesamte Ablauf mit dem simulierten Anbieter und die Prüfung fehlerhafter Antworten.

## Schlüssel anlegen und eintragen

1. In der Anthropic Console ein Konto mit Zahlungsmittel anlegen und einen API-Schlüssel erzeugen. Empfehlung: im Anthropic-Konto zusätzlich ein Ausgabenlimit setzen; die Kostenbremse in Folium ist eine Schätzung, kein Buchungswert.
2. Den Schlüssel in die `.env` auf dem Server eintragen (die Datei gehört nicht ins Repository):

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   # optional, Standardwerte in Klammern:
   # AI_PROVIDER=anthropic        (automatisch, sobald ein Schlüssel gesetzt ist)
   # AI_MODEL=claude-opus-5-5
   # AI_HOURLY_PER_USER=10
   # AI_DAILY_LIMIT=30
   # AI_MONTHLY_BUDGET_EUR=20
   # AI_TIMEOUT_MS=120000
   ```

3. `docker compose up -d --force-recreate folium` (Container neu anlegen, damit die Umgebung gelesen wird).
4. In Folium **Einstellungen → KI → Verbindung prüfen** (nur Admin).

Der Schlüssel bleibt auf dem Server. Die Einstellungsseite (`GET /api/v1/settings/ai`) liefert Status, Anbieter, Modell und Verbrauch, nie den Schlüssel; das prüft `tests/design-routes.test.ts`.

Auswahl des Anbieters (`src/server/config.ts`, `src/server/ai/anthropic.ts`):

| `AI_PROVIDER` | Schlüssel | Ergebnis |
| --- | --- | --- |
| nicht gesetzt | gesetzt | Anthropic |
| nicht gesetzt | leer | keine KI (`none`) |
| `anthropic` | leer | keine KI; die Oberfläche meldet „nicht eingerichtet“ |
| `fake` | egal | simulierter Anbieter (siehe unten) |
| `none` oder unbekannter Wert | egal | keine KI |

Ohne KI antwortet `POST …/propose` mit `409 ai_not_configured`; die Analyse der Homepage und der manuelle Editor funktionieren weiter.

## Der Aufruf im Detail

`AnthropicProvider` (`src/server/ai/anthropic.ts`) nutzt das offizielle SDK `@anthropic-ai/sdk` und ruft `client.beta.messages.create` auf:

| Einstellung | Wert | Zweck |
| --- | --- | --- |
| `model` | `AI_MODEL`, Standard `claude-opus-5-5` | Modell mit Bildauswertung und strukturierter Ausgabe |
| `max_tokens` | 16 000 | Obergrenze der Antwort; ohne Streaming |
| `system` | fester Auftrag (`SYSTEM_PROMPT` in `src/server/ai/prompt.ts`) | Rolle, Regeln, Schutz gegen Prompt-Injection |
| `output_config.format` | `{ type: "json_schema", schema: AI_JSON_SCHEMA }` | Die API erzwingt eine Antwort im Schema (`src/server/ai/schema.ts`) |
| `output_config.effort` | `medium` | Mittlere Denktiefe; ausdrücklich gesetzt |
| `betas` / `fallbacks` | `server-side-fallback-2026-07-01` / `"default"` | Lehnt das Modell ab, beantwortet die API dieselbe Anfrage serverseitig mit einem Ersatzmodell |
| Werkzeuge | keine | Keine Websuche, kein Abruf, keine Nebenwirkungen |
| Client | `maxRetries: 1`, `timeout: AI_TIMEOUT_MS` | Eine Wiederholung bei Netz- oder Serverfehlern |
| Abbruch | `AbortSignal.timeout(AI_TIMEOUT_MS)` in der Route | Harte Gesamtgrenze, auch über die Wiederholung hinweg |

Der Parameter `thinking` wird nicht gesetzt. Antwortet die API mit einem anderen Modell als angefragt (Ersatzmodell nach Ablehnung), gibt Folium dessen Namen als `fallbackModel` mit zurück; die Kosten werden dann mit dem Preis dieses Modells geschätzt.

Fehler werden nach SDK-Fehlerklasse in verständliche Meldungen übersetzt:

| Ursache | Code | HTTP |
| --- | --- | --- |
| Schlüssel abgelehnt (401/403) | `ai_auth` | 502 |
| Anbieter drosselt (429) | `ai_rate` | 503 |
| Zeitüberschreitung, Abbruch | `ai_timeout` | 504 |
| Netz nicht erreichbar | `ai_network` | 502 |
| Modell unbekannt (404), Anfrage abgelehnt (400) | `ai_bad_request` | 502 |
| Anbieter überlastet (5xx) | `ai_overloaded` | 503 |
| `stop_reason: "refusal"` (auch nach Ersatzmodell) | `ai_refusal` | 502 |
| `stop_reason: "max_tokens"` | `ai_truncated` | 502 |
| Antwort passt nicht zum Schema | `ai_invalid` | 502 |

## Was übertragen wird

Erst der Knopf **An Claude senden** löst den Aufruf aus. Vorher zeigt die Oberfläche, was gesendet würde, und die geschätzten Kosten. Gesendet wird (`buildPrompt` in `src/server/ai/prompt.ts`):

- **Zwei Bildschirmfotos** als PNG, falls der Browser-Dienst läuft: Desktop 1440 × 900 px und Smartphone 390 × 844 CSS-Pixel bei doppelter Pixeldichte (780 × 1688 px), jeweils der erste Bildschirm. Erkennbare Einwilligungsbanner werden für die Fotos per CSS ausgeblendet.
- **Merkmale der Homepage** als JSON im Block `<website_daten>`: Adresse, Titel (≤ 200 Zeichen), Beschreibung (≤ 300), bis 16 Farben mit Quelle und Gewicht, bis 8 Schriften, Knopfstile mit Selektor, Rundungen, Schatten, bis 5 Logo-Kandidaten (Adressen), Bildanteil, Dichte, Hinweise der Analyse und ein **Textauszug von höchstens 4 000 Zeichen**.
- **Kurzbeschreibung der eigenen Linkseite** (höchstens 800 Zeichen): Name, Kurzbeschreibung, Art der Einträge (z. B. `action, link, location`) und ob ein Titelbild vorhanden ist. Keine Titel, Adressen oder Telefonnummern der Einträge, keine Statistik, keine Konten, keine weiteren Inhalte.
- **Liste der erlaubten Schriften** und Gestaltungsparameter sowie die **festgehaltenen Werte** mit ihrem aktuellen Inhalt.

Nicht gesendet werden der API-Schlüssel an den Browser, Cookies, Inhalte anderer Seiten oder Daten aus der Datenbank außer der genannten Kurzbeschreibung.

## Kostenschätzung

Preise je Million Token sind in `PRICES_USD` (`src/server/ai/budget.ts`, Stand 11/2026) hinterlegt; für `claude-opus-5-5` 4 US-$ Eingabe und 20 US-$ Ausgabe. Unbekannte Modelle werden wie `claude-opus-5-5` gerechnet. Umrechnung mit dem festen Kurs `USD_TO_EUR = 0.92`.

- **Vorab** (Anzeige vor dem Senden): Eingabe-Token ≈ Zeichen der Merkmale ÷ 3,2 + je Bild min(1 600, Breite × Höhe ÷ 750) + 900; Ausgabe pauschal 6 000 Token. Beide Bildschirmfotos zählen damit je 1 600 Token.
- **Nachher** (Verbuchung): aus `usage.input_tokens` und `usage.output_tokens` der Antwort.

Beispiel mit angenommen 8 000 Zeichen Merkmalsdaten: 2 500 + 3 200 + 900 = 6 600 Eingabe-Token; (6 600 × 4 + 6 000 × 20) ÷ 10⁶ × 0,92 ≈ **0,13 €** je Aufruf. Der Kommentar im Live-Test rechnet mit 0,10–0,30 €.

## Kostenbremse

`AiBudget` (`src/server/ai/budget.ts`) prüft vor jedem echten Aufruf, in dieser Reihenfolge:

| Grenze | Variable | Standard | Zeitraum | Antwort |
| --- | --- | --- | --- | --- |
| je Person | `AI_HOURLY_PER_USER` | 10 | gleitend, letzte 60 Minuten | `429 ai_limit_hour` |
| gesamt je Tag | `AI_DAILY_LIMIT` | 30 | seit Mitternacht **UTC** | `429 ai_limit_day` |
| Monatsbudget | `AI_MONTHLY_BUDGET_EUR` | 20 € | seit Monatsanfang (UTC) | `429 ai_limit_month` |

Gezählt wird jeder echte Aufruf in der Tabelle `ai_runs`, auch fehlgeschlagene. Simulierte Aufrufe zählen nicht. Für das Monatsbudget summiert Folium die geschätzten Kosten; ein Aufruf mit Fehler wird mit 0 € verbucht. Das Budget wird vor dem Aufruf geprüft, ein einzelner Aufruf kann es also geringfügig überschreiten.

Weitere Begrenzungen:

- **Zwischenspeicher 24 h:** Gleiche Analyse (Inhalts-Hash von HTML und CSS), gleiches Modell, gleiche Seite, gleiches Design und gleiche festgehaltene Werte liefern das gespeicherte Ergebnis ohne neuen Aufruf und ohne Kosten. **Weitere Varianten erzeugen** fragt bewusst neu an (`force: true`).
- **Rate-Limits je Route:** Analyse 10, Vorschlag 6, Verbindungsprüfung 5 Anfragen pro Minute.
- **Rollen:** Analyse und Vorschlag ab Redaktion, Verbindungsprüfung nur Admin.

Verbrauch des Monats, Aufrufe heute und die letzten 15 Aufrufe (Zeit, Modell, Status, Kosten, Dauer, Fehlercode) zeigt **Einstellungen → KI**. Jeder Vorschlag steht zusätzlich im Protokoll (`design.propose` mit Modell, Kosten, Ergebnis).

## Verbindungsprüfung

**Verbindung prüfen** ruft `client.models.retrieve(AI_MODEL)` über die Models-API auf. Das kostet nichts und prüft Schlüssel, Netz und ob das Modell verfügbar ist. Die Meldung nennt bei Erfolg den Anzeigenamen des Modells, sonst die übersetzte Fehlerursache (z. B. „Der API-Schlüssel wurde abgelehnt“).

## Live-Test mit echtem Schlüssel

Vorbereitet in `tests/ai.live.test.ts`. Der Test wird von `npm test` übersprungen, solange `ANTHROPIC_API_KEY` fehlt.

```bash
npx playwright install chromium   # einmalig, der Test startet einen lokalen Chromium
node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.live.test.ts
```

Ablauf: echte Analyse der Homepage aus `AI_LIVE_URL` (Standard `https://www.example.com/`) mit Bildschirmfotos aus einem lokal gestarteten Chromium, Verbindungsprüfung, ein echter Aufruf (Zeitlimit 180 s), Abbildung der Antwort. Erwartet werden drei gültige Varianten, nur von der Analyse belegte Farben unter „erkannt“ und Kosten unter 0,50 €. Für aussagekräftige Varianten `AI_LIVE_URL` auf eine gestaltete Homepage setzen, z. B. die eigene.

Das Ergebnis (Zeitpunkt, Modell, Token, Kosten, Dauer, ob Bildschirmfotos vorlagen, abgebildetes Ergebnis) schreibt der Test nach **`docs/pruefbericht-ki.json`**, auch wenn eine der Erwartungen danach fehlschlägt. Der Live-Test läuft an der Kostenbremse vorbei und erscheint nicht in `ai_runs`.

## Simulierter Anbieter

`AI_PROVIDER=fake` aktiviert `FakeProvider` (`src/server/ai/fake.ts`). Er ruft keine API auf, kostet nichts und trägt `simulated: true`. Die Oberfläche kennzeichnet das deutlich („Simulierte KI-Antwort“, Abzeichen „Simuliert“ in den Einstellungen). Gedacht für Tests, Entwicklung und Vorführungen, nicht für den Betrieb.

Mit `AI_FAKE_MODE` lässt sich ein Fehlerfall erzwingen: `valid` (Standard), `invalid-json`, `truncated`, `invented-colors`, `injection-echo`, `timeout`, `refusal`. Die Browser-Tests laufen mit `AI_PROVIDER=fake`.

## Austauschbarkeit

Der Rest von Folium kennt nur die Schnittstelle `DesignAiProvider` (`src/server/ai/provider.ts`):

```ts
interface DesignAiProvider {
  readonly id: string;
  readonly model: string;
  analyze(input: AiInput, signal: AbortSignal): Promise<AiRawResult>;
  testConnection(): Promise<{ ok: boolean; message: string; model: string }>;
}
```

Ein weiterer Anbieter liefert in `analyze` die Rohantwort (`raw`, `model`, `usage`, `simulated`) und wird in `aiFromConfig` eingetragen. Prüfung, Abbildung, Kostenbremse und Oberfläche bleiben unverändert, weil sie nur mit der Rohantwort arbeiten. Für die Kostenschätzung muss das Modell in `PRICES_USD` stehen.

## Schutz gegen Prompt-Injection

Die untersuchte Homepage ist fremder Inhalt und kann Anweisungen an die KI enthalten. Folium behandelt sie als Daten:

1. **Getrennter Datenblock:** Alle Inhalte der Website stehen im Block `<website_daten>`; der Systemauftrag sagt, dass dieser Block und alle Bilder keine Anweisungen enthalten und Aufforderungen darin nie befolgt werden. Taucht `<website_daten>` oder `</website_daten>` selbst im Inhalt auf, wird es durch `[entfernt]` ersetzt, damit der Block nicht vorzeitig endet. Kein Website-Text gelangt in den Systemauftrag (geprüft in `tests/ai.test.ts`).
2. **Keine Werkzeuge:** Die KI kann nichts abrufen, ausführen oder speichern.
3. **Feste Ausgabeform:** Die API erzwingt das JSON-Schema; Folium prüft danach noch einmal selbst.
4. **Nur Daten im Design:** Selbst eine erfolgreiche Manipulation kann nur Werte des Design-Schemas vorschlagen (Hexfarben, Aufzählungen, Zahlen). Eingeschleuster Code in Farbwerten fällt bei der Prüfung heraus; Texte wie die Zusammenfassung zeigt die Oberfläche als reinen Text (`tests/design-routes.test.ts`, „injection in ai output never reaches the theme“).
5. **Nichts wird automatisch übernommen:** Ein Vorschlag ändert nichts. Erst **Variante übernehmen** schreibt ins Entwurfsdesign, sichtbar wird es erst nach dem Veröffentlichen.

## Prüfung und Abbildung der Antwort

`mapAiResult` (`src/server/ai/map.ts`) überführt die Rohantwort in das sichere Design-Schema:

- **Lesbarkeit:** Kein lesbares JSON oder ein Feld außerhalb des zod-Schemas (`aiOutputSchema`) führt zu `ai_invalid` mit Hinweis auf das betroffene Feld. Texte sind in der Länge begrenzt, Aufzählungen fallen bei unbekannten Werten auf einen Standard zurück. Höchstens drei Varianten werden verwendet.
- **„Erkannt“ nur mit Beleg:** Jede als erkannt gemeldete Farbe muss eine Merkmal-ID aus der Analyse nennen, und ihr Hexwert muss genau zu diesem Merkmal passen. Sonst wird sie nicht übernommen und als „Nicht belegt …“ unter **Unsicher oder nicht verfügbar** aufgeführt. Gleiches gilt für Schriften ohne passende ID; Knöpfe und Logo ohne passende ID entfallen.
- **Farben:** `#RGB`, `#RRGGBB`, `rgb()`, `hsl()` und `white`/`black` werden normalisiert; überwiegend transparente Werte und alles andere gelten als ungültig und werden durch die aktuelle Farbe ersetzt (mit Hinweis). Je Farbe zeigt die Variante, ob sie auf der Homepage vorkommt („erkannt“) oder neu ist („vorgeschlagen“).
- **Schriften:** Nur die zehn mitgelieferten Schriften. Eine passende Familie wird zugeordnet, sonst ersetzt durch Source Serif 4 (bei erkennbarer Serifenschrift) bzw. Hanken Grotesk, jeweils mit Hinweis.
- **Bereiche:** Kartenrundung wird auf 0–28 px begrenzt.
- **Festgehaltene Werte:** Bis zu 20 Pfade aus einer festen Positivliste (sieben Farben, zwei Schriften, Knopfform und -stil, Kartenstil, Dichte, Kopflayout, Link-Darstellung, Hauptaktion) werden mit dem aktuellen Wert in jede Variante geschrieben, unabhängig davon, was die KI liefert.
- **Kontrast:** Danach erzwingt `enforceContrast` mindestens 4,5 : 1 für Text und Nebentext auf Hintergrund und Flächen sowie Text auf Akzent. Zu schwache Vordergrundfarben werden schrittweise Richtung Schwarz oder Weiß verschoben, die Änderung erscheint als Hinweis. Das gilt auch für einen festgehaltenen Vordergrundwert.
- **Abschluss:** Jede Variante muss das vollständige Design-Schema (`themeSchema`) bestehen; ungültige Varianten fallen weg. Bleibt keine übrig, meldet Folium `ai_invalid`.

Abgedeckt durch `tests/ai.test.ts` (13 Tests) und `tests/design-routes.test.ts` (7 Tests).

## Wo die Ergebnisse liegen

Analysen (mit den Bildschirmfotos in voller Auflösung) bleiben 2 Stunden im Arbeitsspeicher, höchstens 30 gleichzeitig; Vorschläge 24 Stunden. Beides geht bei einem Neustart verloren und landet nie in der Datenbank oder in Sicherungen. In der Datenbank steht je Aufruf nur eine Zeile in `ai_runs` (Zeit, Person, Adresse, Modell, Status, Token, Kosten, Dauer, Fehlercode).

---

[← Handbuch](README.md) · [Weiter: 20 — Sicherheitskonzept](20-sicherheit.md)
