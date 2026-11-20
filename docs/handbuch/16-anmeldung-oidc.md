# 16 — Anmeldung über authentik (OIDC)

[← Handbuch](README.md) · [Weiter: 17 — Sicherung und Wiederherstellung](17-sicherung.md)

> Dieses Kapitel richtet sich an die IT bzw. an Administratoren des Servers.

Folium kann die Anmeldung an authentik (oder einen anderen OpenID-Connect-Anbieter) übergeben. Verwendet wird der Authorization Code Flow mit PKCE, `state` und `nonce`. Die Passwort-Anmeldung bleibt daneben bestehen, bis Sie sie abschalten.

> **Stand der Prüfung:** Die Anbindung ist nach dem Muster von Filum implementiert, aber **noch nicht gegen eine echte authentik-Instanz getestet**; es gibt dafür auch keine automatisierten Tests ([Kapitel 23](23-einschraenkungen.md)). Richten Sie sie zuerst mit einem Testkonto ein und behalten Sie die Passwort-Anmeldung, bis alles funktioniert.

## In authentik

1. **Applications → Providers → Create → OAuth2/OpenID Provider**
   - Name: `Folium`
   - Client type: **Confidential**
   - Redirect URI: `APP_URL` + `/api/v1/auth/oidc/callback`, also z. B. `https://folium.intranet.example.com/api/v1/auth/oidc/callback`. Die Adresse muss genau übereinstimmen, auch in Schreibweise und Protokoll.
   - Scopes: `openid`, `email`, `profile`. Folium fragt zusätzlich den Scope `groups` an und erwartet die Gruppen im Feld `groups` (im ID-Token oder in der UserInfo-Antwort). In authentik liefert die Standard-Zuordnung zum Scope `profile` dieses Feld; prüfen Sie das in Ihrer Version.
   - Signing Key: ein beliebiges Zertifikat.
2. **Applications → Create**: Name `Folium`, Slug `folium`, Provider `Folium`.
3. Gruppen anlegen und Personen zuordnen, z. B. `folium-admins` und `folium-redaktion`.
4. Client ID und Client Secret des Providers notieren.

## In Folium (.env)

```ini
OIDC_ISSUER=https://auth.example.com/application/o/folium/
OIDC_CLIENT_ID=<Client ID aus authentik>
OIDC_CLIENT_SECRET=<Client Secret aus authentik>
OIDC_ADMIN_GROUPS=folium-admins
OIDC_EDITOR_GROUPS=folium-redaktion
OIDC_DEFAULT_ROLE=viewer
# OIDC_BUTTON_LABEL=Mit authentik anmelden
```

Dann `docker compose up -d`. Auf der Anmeldeseite erscheint der Knopf **Mit authentik anmelden**.

`OIDC_ISSUER` ist die Aussteller-Adresse der Anwendung in authentik (Muster `https://<authentik>/application/o/<slug>/`). Folium liest beim ersten Anmeldeversuch die Discovery-Daten (`.well-known/openid-configuration`) von dort. Ist authentik nicht erreichbar, meldet die Schnittstelle „Der Anmeldedienst (…) ist nicht erreichbar: …“; beim nächsten Versuch fragt Folium erneut.

## Gruppen und Rollen

Bei jeder Anmeldung prüft Folium die Gruppen in dieser Reihenfolge:

| Bedingung | Rolle in Folium |
| --- | --- |
| mindestens eine Gruppe aus `OIDC_ADMIN_GROUPS` | Admin |
| sonst mindestens eine Gruppe aus `OIDC_EDITOR_GROUPS` | Redaktion |
| sonst, **neues** Konto | `OIDC_DEFAULT_ROLE` (Standard `viewer` = Ansehen) |
| sonst, **bestehendes** Konto | bisherige Rolle bleibt (auch eine in Folium von Hand gesetzte) |
| `OIDC_DEFAULT_ROLE=none` und keine passende Gruppe | Anmeldung abgewiesen („Ihr Konto ist für Folium nicht freigeschaltet.“) |

Die Gruppennamen werden exakt verglichen (Groß-/Kleinschreibung zählt). Passt eine Gruppe, setzt sie die Rolle bei **jeder** Anmeldung neu; eine in Folium von Hand geänderte Rolle wird dann überschrieben. Passt keine Gruppe, bleibt die von Hand gesetzte Rolle erhalten. Wer nur ausgewählten Personen Zugang geben will, setzt `OIDC_DEFAULT_ROLE=none` und steuert alles über die Gruppen.

## Was bei der Anmeldung passiert

1. Der Knopf führt zu `APP_URL/api/v1/auth/oidc/start`. Folium merkt sich den Vorgang 10 Minuten lang (Kennung im Cookie `folium_oidc`, die Prüfwerte selbst nur im Arbeitsspeicher) und leitet zu authentik weiter.
2. Nach der Anmeldung kommt die Person über die Redirect URI zurück. Folium prüft Code, `state` und `nonce`, liest Angaben aus ID-Token und UserInfo.
3. Folium sucht das Konto:
   - Gibt es schon ein Konto mit demselben Aussteller und derselben Kennung (`sub`), wird es verwendet; der Name wird aktualisiert, die Rolle nur, wenn eine Gruppe passt.
   - Sonst: Gibt es ein lokales Konto mit derselben E-Mail-Adresse, wird es **nur dann** verknüpft, wenn authentik die E-Mail-Adresse als bestätigt meldet (`email_verified`). Andernfalls wird die Anmeldung abgelehnt („Für diese E-Mail-Adresse gibt es schon ein lokales Konto. …“).
   - Sonst legt Folium ein neues Konto an. Liefert authentik keine E-Mail-Adresse, verwendet Folium `<sub>@oidc.invalid`.
4. Folium legt eine Sitzung an (14 Tage) und schreibt `login.oidc` mit den Gruppen ins Protokoll.

Gut zu wissen:

- Ob authentik `email_verified` als bestätigt meldet, hängt von der Scope-Zuordnung `email` ab. Ist das nicht der Fall, lassen sich bestehende lokale Konten nicht automatisch verknüpfen. Dann das lokale Konto löschen (Seiten bleiben erhalten) und die Person einmal über authentik anmelden lassen.
- In Folium **gesperrte** Konten kommen auch über authentik nicht hinein.
- Folium speichert keine Tokens von authentik, nur Aussteller und `sub` zur Wiedererkennung.
- Startet Folium während einer laufenden Anmeldung neu, ist der gemerkte Vorgang verloren; die Person beginnt die Anmeldung neu.
- Fehlgeschlagene Anmeldungen führen zurück auf die Anmeldeseite, die den Grund oben anzeigt, etwa *Ihr Konto ist für Folium nicht freigeschaltet.*, *Dieses Konto ist gesperrt.* oder, wenn der gemerkte Vorgang fehlt, *Die Anmeldung hat zu lange gedauert oder wurde in einem anderen Fenster begonnen. Bitte erneut versuchen.* Unerwartete Fehler erscheinen als *Die Anmeldung über authentik ist fehlgeschlagen.*; die genaue Ursache steht im Log:

```bash
docker compose logs folium | grep "OIDC-Anmeldung fehlgeschlagen"
```

## Nur noch OIDC

```ini
DISABLE_LOCAL_LOGIN=true
```

Danach blendet die Anmeldeseite die Felder für E-Mail und Passwort aus; die Schnittstelle lehnt Passwort-Anmeldungen ab („Die Anmeldung mit Passwort ist abgeschaltet.“). Die Ersteinrichtung mit dem Einrichtungscode funktioniert weiterhin, solange noch kein Konto existiert.

**Notfallzugang**, wenn authentik ausfällt:

1. In der `.env` `DISABLE_LOCAL_LOGIN=false` setzen, `docker compose up -d`.
2. Für ein Admin-Konto ein Passwort setzen: `docker compose exec folium folium passwort admin@example.com` ([Kapitel 18](18-betrieb.md#kommandozeile)). Das funktioniert auch für Konten, die über authentik entstanden sind.
3. Anmelden, Problem beheben, danach die Variable wieder auf `true` setzen.

## Prüfen

1. Mit einem Testkonto in der Gruppe `folium-redaktion` anmelden: Rolle „Redaktion“ unter **Einstellungen → Konten** (Zusatz „· authentik“).
2. Testkonto aus der Gruppe nehmen, erneut anmelden: Das Konto behält seine bisherige Rolle (bei `OIDC_DEFAULT_ROLE=none`: Anmeldung abgewiesen, die Anmeldeseite nennt den Grund). Ein neues Testkonto ohne Gruppe erhält `OIDC_DEFAULT_ROLE`.
3. Testkonto in Folium sperren: Anmeldung über authentik scheitert.

---

[← Handbuch](README.md) · [Weiter: 17 — Sicherung und Wiederherstellung](17-sicherung.md)
