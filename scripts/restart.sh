#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

verificar_pm2 || exit 1

if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "$WARN $APP_NAME nao estava registrado no PM2. Iniciando pela primeira vez..."
  exec "$SCRIPTS_DIR/start.sh"
fi

echo "$INFO Reiniciando $APP_NAME..."
pm2 restart "$APP_NAME" --update-env
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "$ERRO Falha ao reiniciar $APP_NAME."
  exit 1
fi

pm2 save >/dev/null 2>&1

echo "$OK $APP_NAME reiniciado."
