#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

verificar_pm2 || exit 1

if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "$WARN $APP_NAME nao esta registrado no PM2 (ja parado ou nunca foi iniciado)."
  exit 0
fi

echo "$INFO Parando $APP_NAME (graceful shutdown)..."
pm2 stop "$APP_NAME"
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "$ERRO Falha ao parar $APP_NAME."
  exit 1
fi

echo "$OK $APP_NAME parado."
