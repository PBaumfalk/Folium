# Abgeschotteter Browser für Bildschirmfotos der Homepage-Analyse.
# Läuft nur im internen Docker-Netz ohne Internetzugang; Folium beantwortet jede Anfrage des Browsers selbst.
ARG PW_VERSION=1.65.1
FROM mcr.microsoft.com/playwright:v${PW_VERSION}-noble
ARG PW_VERSION
RUN npm i -g --no-audit --no-fund playwright-core@${PW_VERSION} && npm cache clean --force
USER pwuser
EXPOSE 3000
CMD ["playwright-core", "run-server", "--port", "3000", "--host", "0.0.0.0", "--max-clients", "2"]
