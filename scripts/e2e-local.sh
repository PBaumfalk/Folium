#!/usr/bin/env bash
# Browser-Tests gegen einen frischen Build (Desktop und Smartphone-Emulation, Chromium).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:web >/dev/null
npx playwright test "$@"
