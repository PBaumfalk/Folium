# 17 — Sicherung und Wiederherstellung

[← Handbuch](README.md) · [Weiter: 18 — Betrieb und Updates](18-betrieb.md)

> Dieses Kapitel richtet sich an die IT und an Admins. Sicherungen in der Oberfläche sehen und bedienen nur Admins.

Folium kennt drei Wege, Daten zu sichern:

| Weg | Inhalt | Zweck |
| --- | --- | --- |
| **Sicherung** (automatisch oder von Hand) | gesamte Datenbank und alle hochgeladenen Dateien | Zurück auf einen früheren Stand, Notfall |
| **Export** (ZIP) | Seiten mit Design und Bildern | Seiten in eine andere Folium-Installation übertragen |
| **Server-Sicherung** des Volumes | alles unter `/data`, auch die Sicherungen | Schutz vor Verlust des Servers |

Die ersten beiden liegen auf demselben Server wie Folium. Erst die Server-Sicherung schützt vor dem Ausfall der Festplatte oder des Servers.

## Was eine Sicherung enthält

Jede Sicherung ist ein Ordner unter `/data/backups/`:

```
/data/backups/folium-20261120-023000-auto/
├── folium.db      # vollständige Kopie der Datenbank
└── assets/        # alle hochgeladenen Bilder und Schriften
```

Die Datenbank wird mit `VACUUM INTO` kopiert. Das ist im laufenden Betrieb konsistent; Folium muss dafür nicht angehalten werden. Enthalten sind Seiten mit Entwürfen und allen Versionen, Konten (mit Passwort-Prüfsummen), Sitzungen, Einstellungen, Domains, Statistik, Protokoll und die Liste der KI-Aufrufe.

**Nicht enthalten** ist die `.env` mit den Schlüsseln. Sichern Sie sie gesondert und geschützt (z. B. im Passwortmanager Ihrer Organisation).

Der Name zeigt Datum und Uhrzeit **in UTC** und die Art: `auto` (automatisch), `manuell` (über **Jetzt sichern** oder die Kommandozeile), `vor-wiederherst` (Stand unmittelbar vor einer Wiederherstellung).

## Automatische Sicherungen

- Beim Start prüft Folium, ob die letzte automatische Sicherung älter als `BACKUP_INTERVAL_HOURS` (Standard 24) ist oder fehlt, und legt dann sofort eine an. Danach folgt alle `BACKUP_INTERVAL_HOURS` Stunden eine weitere.
- Folium behält die neuesten `BACKUP_KEEP` (Standard 14) automatischen Sicherungen und löscht ältere. Mit `BACKUP_KEEP=0` bleiben alle erhalten.
- **Manuelle** Sicherungen und Sicherungen **vor einer Wiederherstellung** löscht Folium nie automatisch. Sie bleiben, bis jemand sie entfernt (siehe unten).
- `BACKUP_INTERVAL_HOURS=0` schaltet automatische Sicherungen ab.

Schlägt eine automatische Sicherung fehl (z. B. Festplatte voll), steht „Automatische Sicherung fehlgeschlagen“ im Log; Folium läuft weiter.

## Sicherung von Hand

**In der Oberfläche:** **Einstellungen → Sicherung und Export → Jetzt sichern**. Die Liste zeigt danach die neue Sicherung mit Zeitpunkt, Art und Größe der Datenbank.

**Auf der Kommandozeile:**

```bash
docker compose exec folium folium sicherung
# Sicherung angelegt: /data/backups/folium-20261120-141502-manuell
```

Entstehen zwei Sicherungen in derselben Sekunde, erhält die zweite im Namen die nächste freie Sekunde; beide bleiben erhalten.

**Alte manuelle Sicherungen entfernen:**

```bash
docker compose exec folium ls -l /data/backups
docker compose exec folium rm -r /data/backups/folium-20261001-090000-manuell
```

## Sicherungen vom Server wegkopieren

Der einfachste Weg: das Verzeichnis `/data/backups` regelmäßig aus dem Container kopieren und von dort in die nächtliche Sicherung Ihrer Organisation aufnehmen.

```bash
cd /opt/folium
docker compose cp folium:/data/backups ./sicherung-export
```

Die Ordner darin sind in sich konsistent und lassen sich einzeln wiederherstellen.

Alternativ das gesamte Volume sichern. Damit die Datenbank dabei nicht mitten im Schreiben kopiert wird, Folium kurz anhalten:

```bash
cd /opt/folium
docker compose stop folium
docker run --rm -v folium_folium-data:/data:ro -v "$PWD":/ziel alpine \
  tar czf /ziel/folium-data-$(date +%F).tar.gz -C /data .
docker compose start folium
```

`folium_folium-data` ist der Name, den Compose dem Volume gibt (Projektname `folium` + Volume `folium-data`); `docker volume ls` zeigt ihn.

Testen Sie die Wiederherstellung mindestens einmal, z. B. auf einem Testrechner mit Docker Desktop.

## Wiederherstellen

### In der Oberfläche (empfohlen)

1. **Einstellungen → Sicherung und Export**, in der Liste bei der gewünschten Sicherung **Wiederherstellen**.
2. Rückfrage „Sicherung einspielen?“ mit **Vormerken** bestätigen. Folium meldet: „Die Sicherung … wird beim nächsten Neustart eingespielt (docker compose restart folium). Der aktuelle Stand wird vorher gesichert.“
3. Die IT startet Folium neu:

   ```bash
   docker compose restart folium
   ```

4. Nach dem Start gegebenenfalls erneut anmelden. Im Log steht „Sicherung wiederhergestellt; der vorherige Stand wurde gesichert“.

Die Wiederherstellung ist nur **vorgemerkt** (Datei `/data/wiederherstellen.json`), bis Folium neu startet. Bis dahin läuft alles normal weiter; Änderungen in dieser Zeit gehen beim Einspielen verloren (sie stecken aber in der Sicherung `vor-wiederherst`). Wer mehrmals **Vormerken** wählt, bekommt die zuletzt gewählte Sicherung. Die Befehle der Kommandozeile (`konten`, `passwort`, `sicherung`) lassen die Vormerkung unberührt; eingespielt wird nur beim Neustart des Dienstes. Eine Vormerkung zurücknehmen:

```bash
docker compose exec folium rm /data/wiederherstellen.json
```

### Was beim Neustart passiert

1. Folium verschiebt die aktuelle Datenbank und den Ordner `assets` in eine neue Sicherung `folium-<zeit>-vor-wiederherst`.
2. Folium kopiert Datenbank und Dateien aus der gewählten Sicherung an ihren Platz.
3. Die Vormerkung wird gelöscht, Folium startet normal.

Danach gilt der Stand der Sicherung vollständig: Konten, Passwörter, Sitzungen, Seiten, Statistik und Einstellungen. Wer seither neu angelegt wurde, fehlt. Ist die gewählte Sicherung inzwischen verschwunden, verwirft Folium die Vormerkung und startet unverändert.

### Sicherungen vor einer Datenbankmigration

Vor jedem Update mit Datenbankmigration legt Folium zusätzlich eine Datei `/data/backups/vor-migration-v<n>-<zeitstempel>.db` an ([Kapitel 18](18-betrieb.md#update-auf-eine-neue-version)). Sie enthält nur die Datenbank, keine Dateien, und erscheint **nicht** in der Liste der Oberfläche. Sie wird beim Zurückgehen auf die alte Version gebraucht ([Kapitel 18](18-betrieb.md#zurück-zur-vorherigen-version-rollback)).

## Export und Import als ZIP

**Einstellungen → Sicherung und Export → Alles exportieren** erzeugt `folium-export-<datum>.zip` mit der Datei `folium-export.json` und einem Ordner `assets/`. Enthalten sind je Seite Name, Adresse, Entwurf mit Design und die veröffentlichte Fassung, dazu alle verwendeten Bilder und Schriften.

**Export importieren** (nur Admin) liest ein solches Archiv ein:

- Jede Seite entsteht als **neuer Entwurf** aus dem exportierten Entwurf. Nichts wird überschrieben, nichts veröffentlicht; Veröffentlichen ist danach ein eigener Schritt.
- Ist die Adresse vergeben, bekommt die Seite den Zusatz `-import` (bei Bedarf `-import-2` usw.).
- Bilder und Schriften werden neu eingelesen und dabei erneut geprüft.
- Höchstens 100 MB (gepackt und entpackt).

Nicht im Export: Konten, Versionsgeschichte, Statistik, Domains, Einstellungen, Protokoll. Der Export ersetzt also keine Sicherung.

## Umzug auf einen neuen Server

1. Auf dem neuen Server die Dateien holen und die `.env` vom alten Server übernehmen ([Kapitel 13](13-installation.md), Schritte 1 und 2), dann nur das Image bauen: `docker compose build`. Folium dort **noch nicht** starten.
2. Auf dem alten Server Folium anhalten und das Volume sichern (Befehle oben).
3. Archiv auf den neuen Server kopieren und in das Volume entpacken:

   ```bash
   cd /opt/folium
   docker compose create                                    # legt das leere Volume an
   docker run --rm -v folium_folium-data:/data -v "$PWD":/quelle alpine \
     sh -c 'tar xzf /quelle/folium-data-2026-11-20.tar.gz -C /data && chown -R 1000:1000 /data'
   docker compose up -d
   ```

4. DNS und Reverse Proxy umstellen ([Kapitel 14](14-reverse-proxy.md)).

Folium läuft im Container als Benutzer `node` (Benutzer-ID 1000); das `chown` stellt sicher, dass Folium die Dateien schreiben darf. Fehlen die Rechte, bricht der Start mit der Meldung „Das Datenverzeichnis /data ist nicht beschreibbar …“ ab.

## Notfall: Passwort vergessen

Folium verschickt keine E-Mails zum Zurücksetzen. Die IT setzt ein neues Passwort auf der Kommandozeile:

```bash
docker compose exec folium folium passwort admin@example.com
# Neues Passwort für admin@example.com: …
```

Das Passwort erscheint einmalig. Alle Sitzungen des Kontos enden. Welche Konten es gibt, zeigt `docker compose exec folium folium konten`.

---

[← Handbuch](README.md) · [Weiter: 18 — Betrieb und Updates](18-betrieb.md)
