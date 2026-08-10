#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

echo "$INFO Iniciando $APP_NAME via PM2..."

verificar_pm2 || exit 1

if [ ! -f ".env" ]; then
  echo "$ERRO Arquivo .env nao encontrado em $PROJECT_ROOT. Copie .env.example e preencha antes de iniciar."
  exit 1
fi

mkdir -p logs

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "$WARN $APP_NAME ja esta registrado no PM2. Use scripts/restart.sh para reiniciar."
  pm2 describe "$APP_NAME" | grep -E "status|restarts" || true
  exit 0
fi

pm2 start ecosystem.config.js --env production
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "$ERRO Falha ao iniciar $APP_NAME via PM2."
  exit 1
fi

pm2 save >/dev/null 2>&1

echo "$OK $APP_NAME iniciado."
echo "$INFO Para persistir apos reboot, configure o startup do PM2 (veja ORACLE_SETUP.md)."
