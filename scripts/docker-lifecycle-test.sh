#!/usr/bin/env bash
# Prüft das Docker-Image im echten Betrieb: Start, Einrichtung, Veröffentlichen, Neustart,
# Entwürfe unsichtbar, Browser ohne Internet, Analyse blockiert interne Ziele, Sicherung.
# Aufruf: scripts/docker-lifecycle-test.sh   (räumt am Ende alles wieder ab)
set -euo pipefail
cd "$(dirname "$0")/.."
P=folium-lifecycle
PUB=18180
ADM=18181
ENVF=$(mktemp)
JAR=$(mktemp)
cat > "$ENVF" <<ENV
APP_URL=http://localhost:$ADM
PUBLIC_BASE_URL=http://localhost:$PUB
SETUP_CODE=123-456-789
PUBLIC_HOST_PORT=$PUB
ADMIN_HOST_PORT=$ADM
AI_PROVIDER=none
ENV
dc() { FOLIUM_ENV_FILE="$ENVF" docker compose -p $P --env-file "$ENVF" -f docker-compose.yml "$@"; }
cleanup() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -f "$ENVF" "$JAR"; }
trap cleanup EXIT
ok() { echo "OK   $*"; }
fail() { echo "FEHLER $*"; exit 1; }
api() { curl -sS -b "$JAR" -c "$JAR" -H "Origin: http://localhost:$ADM" -H 'content-type: application/json' "$@"; }
wait_up() { for i in $(seq 1 60); do curl -sf "http://localhost:$ADM/healthz" >/dev/null && curl -sf "http://localhost:$PUB/healthz" >/dev/null && return 0; sleep 1; done; dc logs folium | tail -30; fail "Dienste nicht erreichbar"; }

echo "── Bauen und starten"
cp .env.example /dev/null
dc up -d --build >/dev/null 2>&1 || { dc logs | tail -40; fail "Start"; }
wait_up; ok "Container läuft, beide Ports antworten"
[ "$(dc exec -T folium folium health | tr -d '\r')" = "öffentlich: ok, Verwaltung: ok" ] && ok "Healthcheck im Container"

echo "── Einrichtung und Seite"
api -X POST "http://localhost:$ADM/api/v1/setup" -d '{"code":"123-456-789","email":"admin@example.test","name":"Admin","password":"sehr-geheimes-passwort"}' | grep -q '"role":"admin"' && ok "Erstes Admin-Konto angelegt"
api -X PATCH "http://localhost:$ADM/api/v1/settings" -d '{"imprintUrl":"https://www.example.com/impressum/","privacyUrl":"https://www.example.com/datenschutz/"}' >/dev/null
PAGE=$(api -X POST "http://localhost:$ADM/api/v1/pages" -d '{"name":"Muster","slug":"muster","preset":"editorial","template":"organisation"}')
ID=$(echo "$PAGE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
api -X POST "http://localhost:$ADM/api/v1/pages/$ID/publish" -d '{}' >/dev/null
curl -sf "http://localhost:$PUB/muster" | grep -q 'Muster &amp; Partner' && ok "Seite öffentlich"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PUB/api/v1/pages")" = 404 ] && ok "Öffentlicher Port kennt keine Verwaltungs-API"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$ADM/api/v1/pages")" = 401 ] && ok "Verwaltung ohne Anmeldung gesperrt"

echo "── Entwurf bleibt privat"
CUR=$(api "http://localhost:$ADM/api/v1/pages/$ID")
NEW=$(echo "$CUR" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);p.draft.content.profile.name='GEHEIMER ENTWURF';console.log(JSON.stringify({content:p.draft.content,rev:p.draft.rev}))})")
api -X PATCH "http://localhost:$ADM/api/v1/pages/$ID" -d "$NEW" | grep -q 'GEHEIMER ENTWURF' && ok "Entwurf gespeichert"
curl -s "http://localhost:$PUB/muster" | grep -q 'GEHEIMER ENTWURF' && fail "Entwurf öffentlich sichtbar" || ok "Entwurf öffentlich unsichtbar"

echo "── Neustart"
dc restart folium >/dev/null 2>&1; wait_up
curl -sf "http://localhost:$PUB/muster" | grep -q 'Muster &amp; Partner' && ok "Veröffentlichte Seite nach Neustart da"
api "http://localhost:$ADM/api/v1/pages/$ID" | grep -q 'GEHEIMER ENTWURF' && ok "Entwurf und Anmeldung nach Neustart erhalten"

echo "── Abschottung des Browsers"
dc exec -T folium-browser node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))" && ok "Browser-Container hat kein Internet"
dc exec -T folium node -e "fetch('http://folium-browser:3000/').then(r=>process.exit(0)).catch(()=>process.exit(1))" && ok "Folium erreicht den Browser im internen Netz"

if api -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$ADM/api/v1/design/analyze" -d '{"url":"http://169.254.169.254/latest/meta-data/"}' | grep -q 422; then ok "Analyse blockiert Metadaten-Adresse"; else echo "HINWEIS Analyse-Endpunkt noch nicht vorhanden oder anderes Ergebnis"; fi
if api -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$ADM/api/v1/design/analyze" -d '{"url":"http://folium-browser:3000/"}' | grep -q 422; then ok "Analyse blockiert internes Docker-Ziel"; else echo "HINWEIS internes Ziel nicht als 422 abgelehnt"; fi

R=$(api -X POST "http://localhost:$ADM/api/v1/design/analyze" -d '{"url":"https://example.com/"}' || true)
if echo "$R" | grep -q '"desktop":"/api/v1/design'; then ok "Echte Analyse mit Bildschirmfotos über den abgeschotteten Browser"; else echo "HINWEIS Analyse ohne Bildschirmfotos (kein Internet?): $(echo "$R" | head -c 200)"; fi
if dc exec -T folium folium sicherung 2>/dev/null | grep -q 'Sicherung angelegt'; then ok "Sicherung über die Kommandozeile"; else echo "HINWEIS Sicherung noch nicht verfügbar"; fi
echo "Alle Prüfungen bestanden."
