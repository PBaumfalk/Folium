[← Handbuch](README.md)

# 23 — Bekannte Einschränkungen

Was Folium bewusst nicht kann, welche kleineren Punkte offen sind und was nicht unter Realbedingungen geprüft ist. Stand: Version 0.1.0.

## Betrieb

- **Eine Instanz.** Folium ist ein Prozess mit SQLite und Zählern im Arbeitsspeicher. Mehrere Container auf derselben Datenbank (Lastverteilung, Hochverfügbarkeit) werden nicht unterstützt ([Kapitel 21](21-architektur.md)).
- **Statistik bis zu 3 Sekunden verzögert.** Zählungen werden gebündelt geschrieben. Bei einem harten Absturz (nicht bei normalem Beenden) können die Zählungen dieser letzten Sekunden fehlen.
- **Analysen und KI-Ergebnisse nur im Arbeitsspeicher.** Eine Homepage-Analyse bleibt 2 Stunden, ein KI-Vorschlag 24 Stunden erhalten. Nach einem Neustart muss die Homepage erneut untersucht werden.
- **Kein Downgrade** nach einer Datenbankmigration. Der Rückweg führt über die automatische Sicherung `vor-migration-…` ([Kapitel 18](18-betrieb.md)).
- **Internetzugang des Servers** ist für die Homepage-Analyse und die KI nötig. Ohne ihn bleibt der manuelle Design-Editor voll nutzbar.
- **DNS, Zertifikate und Reverse Proxy** richtet Folium nicht selbst ein; das Handbuch liefert Vorlagen ([Kapitel 14](14-reverse-proxy.md)).

## Browser-Dienst

- Der Chromium im Dienst `folium-browser` läuft ohne eigene Sandbox (im Container üblich). Geschützt wird er durch das Netz ohne Internet und dadurch, dass Folium jede seiner Anfragen selbst über den geschützten Abruf beantwortet ([Kapitel 20](20-sicherheit.md)).
- Je Bildschirmfoto lädt der Browser höchstens 40 Unterressourcen. Sehr bildreiche Seiten erscheinen deshalb unvollständig; die Analyse vermerkt das.
- Einwilligungsbanner werden für die Bildschirmfotos nur per CSS ausgeblendet, soweit sie an üblichen Namen erkennbar sind. Sie werden nie angeklickt.

## KI

- **Echter Aufruf noch nicht getestet.** Der Aufruf der Anthropic-API ist implementiert und ein Live-Test vorbereitet, aber mangels Schlüssel nicht ausgeführt ([Kapitel 19](19-ki-anbindung.md)).
- **Kosten sind Schätzungen** mit festem Kurs (0,92 € je US-$) und hinterlegten Preisen (Stand 11/2026). Aufrufe, die mit einem Fehler enden, verbucht Folium mit 0 €, auch wenn beim Anbieter Kosten entstanden sein können. Ein Ausgabenlimit im Anthropic-Konto ist deshalb sinnvoll.
- **Das Tageslimit wechselt um Mitternacht UTC**, nicht Europe/Berlin (im Winter 1 Uhr, im Sommer 2 Uhr deutscher Zeit). Auch der Monat für das Budget wird in UTC gerechnet.
- Der Live-Test läuft an der Kostenbremse vorbei und erscheint nicht in der Verbrauchsübersicht.
- Nur die zehn mitgelieferten Schriften sind für KI-Vorschläge zugelassen; andere Schriften der Homepage werden ersetzt (mit Hinweis). Eine eigene Schrift lässt sich danach von Hand hochladen.

## Bekannte kleinere Punkte

Aus der unabhängigen Gesamtprüfung bewusst offen gelassen (gering, eingedämmt), siehe [Prüfbericht](../pruefbericht.md):

- **SVG-Bereinigung:** Numerische Entitäten werden vor der Prüfung nicht dekodiert. Eingedämmt durch die strenge CSP der Auslieferung und die Einbindung als `<img>`, in der SVG keine Skripte ausführt.
- **Import:** Bilder werden eingelesen, bevor die Seiten geprüft sind. Bei einem fehlerhaften Archiv bleiben Dateien ohne Verwendung zurück.
- **Konten:** Ein gesperrtes letztes Admin-Konto lässt sich nicht löschen.
- **Sicherungen:** Zwei Sicherungen in derselben Sekunde kollidieren; manuelle Sicherungen werden nicht automatisch ausgedünnt (nur `auto`-Sicherungen nach `BACKUP_KEEP`).
- **KI-Tageslimit** wechselt um Mitternacht UTC (siehe oben).
- **Umbenennen und Entwurfsspeichern** sind nicht atomar.
- **Die Verwaltungsoberfläche hat keine eigene CSP.** Sie soll ohnehin nur intern bzw. über VPN erreichbar sein.

Zusätzlich beim Abgleich mit dem Code aufgefallen:

- Die Sperre nach Fehlversuchen bei der Anmeldung gilt je Konto und liegt im Arbeitsspeicher; nach einem Neustart beginnt sie von vorn. Je Absender begrenzt nur das Rate-Limit (30 Anmeldungen pro Minute).
- Sitzungen laufen fest 14 Tage nach der Anmeldung ab und verlängern sich bei Nutzung nicht.
- Hochgeladene Schriften werden nur an der Dateisignatur erkannt und unverändert gespeichert, nicht neu kodiert.
- Der Container-Test meldet einige Abweichungen nur als `HINWEIS`, ohne abzubrechen ([Kapitel 22](22-tests.md)).

## Funktionsumfang

- **Kein eigenes CSS oder JavaScript.** Gestaltet wird nur über die Stellschrauben des Design-Editors ([Kapitel 5](05-design.md)). Das ist gewollt.
- **Statistik nur als Tagessummen.** Keine IP-Adressen, keine Geräteangaben, keine Besucherkennungen; Aufrufe sind nicht gleich Personen ([Kapitel 8](08-statistik.md), [Kapitel 12](12-datenschutz.md)).
- **Keine Terminbuchung oder Kontaktformulare.** Folium verlinkt vorhandene Systeme.
- **Oberfläche und Dokumentation nur auf Deutsch.**

## Was nicht oder nur simuliert getestet ist

| Integration | Status |
| --- | --- |
| Homepage-Analyse gegen eine echte öffentliche Homepage (echtes Internet, HTML/CSS, Bildschirmfotos über den abgeschotteten Browser im Container) | **tatsächlich getestet** |
| KI-Ablauf in Oberfläche und Server mit simuliertem Anbieter (`AI_PROVIDER=fake`, überall als „Simuliert“ gekennzeichnet) | **simuliert** |
| Echter Aufruf der Anthropic-API (`claude-opus-5-5`) | **nicht getestet**: kein Schlüssel verfügbar. Test vorbereitet, Ergebnis in `docs/pruefbericht-ki.json` |
| Filum-Kurzlink und Tessera-QR | nur gegen einen lokalen **Testserver simuliert** (Bearer-Token, Antwortformat aus dem Quellcode von Filum und Tessera); nicht gegen laufende Instanzen |
| authentik / OIDC | implementiert nach Filum-Muster, **nicht getestet** ([Kapitel 16](16-anmeldung-oidc.md)) |
| Reverse Proxy (Caddy), TLS, DNS, öffentliche Domain | **nicht eingerichtet** (Vorlage in [Kapitel 14](14-reverse-proxy.md)) |
| Safari/WebKit, Firefox, echte Smartphones | **nicht getestet** (nur Chromium, Desktop und Smartphone-Emulation Pixel 7) |
| Lighthouse | nicht ausgeführt; gemessen: öffentliche Seite ≈ 23 KB HTML inkl. CSS, Schriften lokal, ein Skript < 1 KB, keine externen Anfragen |

Vor dem produktiven Einsatz deshalb einmal: Live-Test der KI ausführen, Filum und Tessera im Bereich **Teilen** ausprobieren, die Anmeldung über authentik mit einem Testkonto durchspielen und die veröffentlichte Seite auf einem iPhone (Safari) und einem Android-Gerät ansehen.

---

[← Handbuch](README.md)
