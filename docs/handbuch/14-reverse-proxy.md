# 14 — Reverse Proxy

[← Handbuch](README.md) · [Weiter: 15 — Konfiguration](15-konfiguration.md)

> Dieses Kapitel richtet sich an die IT bzw. an Administratoren des Servers.

Folium spricht selbst nur HTTP. Ein Reverse Proxy davor stellt HTTPS bereit und verbindet jeden Hostnamen mit dem richtigen Port. Die Beispiele gehen davon aus, dass der Proxy auf demselben Server läuft und die Ports wie in der Standardkonfiguration auf `127.0.0.1` liegen ([Kapitel 13](13-installation.md#4-ports-und-erreichbarkeit)).

## Das Prinzip: zwei Ports, zwei Welten

| | Öffentlich | Verwaltung |
| --- | --- | --- |
| Port | 8080 | 8081 |
| Hostname (Beispiel) | `links.example.com` und weitere Domains | `folium.intranet.example.com` |
| Inhalt | nur veröffentlichte Linkseiten, Bilder, Schriften, Klickzähler | Oberfläche, Schnittstelle, Entwürfe, Konten, Sicherungen |
| Erreichbar | aus dem Internet | nur intern (internes Netz, VPN/WireGuard) |
| Konfiguration | `PUBLIC_BASE_URL` | `APP_URL` |

Der öffentliche Port kennt keine Verwaltungsschnittstelle: Selbst ein Fehler im Proxy, der `/api/…` auf Port 8080 leitet, liefert nur „Nicht gefunden“. Umgekehrt darf der Verwaltungsport **nie** unter einem öffentlichen Hostnamen erreichbar sein.

Zwei Dinge muss jeder Proxy richtig machen:

1. **Hostname unverändert weitergeben** (`Host`-Kopf). Folium erkennt daran die Standardadresse und weitere Domains. Ohne ihn zeigt jede Linkseite „Diese Seite gibt es nicht.“
2. **Verwaltung unter genau der Adresse aus `APP_URL`** ausliefern. Folium nimmt schreibende Anfragen nur an, wenn der Browser sie von dieser Adresse (oder vom weitergegebenen Hostnamen) schickt; die Anmeldung über authentik nutzt `APP_URL` als Rücksprungadresse.

## Caddy (empfohlen)

Caddy holt Zertifikate automatisch und gibt den Hostnamen von sich aus weiter.

```caddy
links.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}

# Verwaltung nur intern (WireGuard/VPN) – nicht öffentlich freigeben
folium.intranet.example.com {
    @extern not remote_ip 10.0.0.0/8 192.168.0.0/16 172.16.0.0/12
    respond @extern 403
    reverse_proxy 127.0.0.1:8081
}
```

Gut zu wissen:

- Für einen rein internen Hostnamen kann Caddy kein öffentliches Zertifikat über die HTTP-Prüfung holen, wenn der Name von außen nicht erreichbar ist. Dann `tls internal` (Caddys eigene Zertifizierungsstelle, deren Stammzertifikat auf den Arbeitsplätzen vertraut werden muss) oder die DNS-Prüfung mit einem DNS-Plugin verwenden.
- Die Netzbereiche in `remote_ip` an das tatsächliche interne Netz und VPN anpassen.
- Nach Änderungen: `caddy reload` bzw. `systemctl reload caddy`.

## nginx

```nginx
# Öffentliche Linkseiten
server {
    listen 443 ssl;
    server_name links.example.com;
    ssl_certificate     /etc/letsencrypt/live/links.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/links.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;                       # Pflicht, siehe oben
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Verwaltung – nur intern
server {
    listen 443 ssl;
    server_name folium.intranet.example.com;
    ssl_certificate     /etc/ssl/folium-intern/fullchain.pem;
    ssl_certificate_key /etc/ssl/folium-intern/privkey.pem;

    allow 10.0.0.0/8;
    allow 172.16.0.0/12;
    allow 192.168.0.0/16;
    deny  all;

    client_max_body_size 110m;      # Import von Exporten bis 100 MB
    proxy_read_timeout   180s;      # KI-Aufrufe dürfen bis AI_TIMEOUT_MS (120 s) dauern

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP auf HTTPS umleiten
server {
    listen 80;
    server_name links.example.com folium.intranet.example.com;
    return 301 https://$host$request_uri;
}
```

Gut zu wissen:

- nginx setzt ohne `proxy_set_header Host $host;` den Kopf auf `127.0.0.1:8080`. Das ist der häufigste Fehler.
- Ohne `client_max_body_size` lehnt nginx Uploads über 1 MB ab (Bilder bis 5 MB, Import bis 100 MB).
- Ohne längeres `proxy_read_timeout` bricht nginx KI-Vorschläge nach 60 Sekunden mit Fehler 504 ab.

## Echte Absenderadresse (TRUST_PROXY)

Hinter einem Proxy sieht Folium als Absender aller Anfragen nur die Adresse des Proxys. Folium speichert keine IP-Adressen, verwendet sie aber im Arbeitsspeicher für Begrenzungen je Absender: Klickzähler (120 pro Minute), Einrichtung (10 pro Minute), Anmeldung (30 pro Minute), Homepage-Analyse und KI. Ohne `TRUST_PROXY` teilen sich **alle** Besucher diese Grenzen. Bei vielen gleichzeitigen Klicks gehen dann Zählungen verloren; die Links funktionieren trotzdem.

Mit `TRUST_PROXY` übernimmt Folium die Absenderadresse aus `X-Forwarded-For`, aber nur von vertrauenswürdigen Absendern:

```ini
TRUST_PROXY=172.18.0.0/16          # Netz oder Adresse, aus dem die Anfragen des Proxys kommen
```

Erlaubt sind eine Adresse, ein Netz in CIDR-Schreibweise, mehrere davon durch Komma getrennt, oder `true` (vertraut jedem Absender; nur, wenn die Ports von nirgends sonst erreichbar sind). Leer bzw. nicht gesetzt: aus.

Bei einem Proxy auf demselben Server kommen die Anfragen im Container in der Regel vom Gateway des Compose-Netzes. Das Netz zeigt:

```bash
docker network inspect folium_default --format '{{(index .IPAM.Config 0).Subnet}}'
```

Caddy setzt `X-Forwarded-For` von sich aus, bei nginx steht es im Beispiel oben.

## HTTPS

- Der Proxy stellt die Zertifikate aus, Folium selbst hat keine.
- Beginnt `APP_URL` mit `https://`, setzt Folium das Sitzungscookie nur für HTTPS. Die Verwaltung muss dann auch per HTTPS aufgerufen werden.
- Folium setzt auf öffentlichen Seiten eigene Sicherheitsköpfe (u. a. eine strenge Content-Security-Policy, `X-Frame-Options: DENY`). Der Proxy sollte sie nicht überschreiben. Ein `Strict-Transport-Security`-Kopf für die öffentliche Domain kann im Proxy ergänzt werden.

## Weitere Domains

Jede in **Einstellungen → Domains** eingetragene Domain ([Kapitel 9](09-domains.md)) braucht einen DNS-Eintrag auf den Proxy und einen Proxy-Eintrag auf den **öffentlichen** Port.

Caddy, als zusätzliche Adresse im bestehenden Block oder als eigener Block:

```caddy
links.example.com, links.maria-muster.de {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

nginx: die Domain im `server_name` des öffentlichen Blocks ergänzen (oder einen eigenen Block anlegen) und ein Zertifikat beschaffen, das sie abdeckt. `proxy_set_header Host $host;` ist auch hier Pflicht.

Eine Domain, die nur im Proxy, aber nicht in Folium eingetragen ist, zeigt „Diese Seite gibt es nicht.“

## Prüfen

```bash
# Öffentliche Seite: Status 200, kein Set-Cookie, Content-Security-Policy vorhanden
curl -sI https://links.example.com/cafe

# Öffentlicher Port kennt keine Verwaltung: erwartet 404
curl -s -o /dev/null -w '%{http_code}\n' https://links.example.com/api/v1/session

# Gesundheit
curl -s https://links.example.com/healthz          # {"ok":true}

# Verwaltung von außerhalb des internen Netzes: erwartet 403
curl -s -o /dev/null -w '%{http_code}\n' https://folium.intranet.example.com/
```

---

[← Handbuch](README.md) · [Weiter: 15 — Konfiguration](15-konfiguration.md)
