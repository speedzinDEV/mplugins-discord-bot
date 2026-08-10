#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

echo "========================================"
echo "$APP_NAME - Rollback"
echo "========================================"
echo ""

if [ ! -f ".deploy/rollback_commit" ]; then
  echo "$ERRO Nenhum commit de rollback salvo (.deploy/rollback_commit nao existe)."
  echo "$INFO Isso significa que scripts/deploy.sh ainda nao rodou neste servidor."
  exit 1
fi

COMMIT_ALVO="$(cat .deploy/rollback_commit)"

if [ -z "$COMMIT_ALVO" ]; then
  echo "$ERRO .deploy/rollback_commit esta vazio."
  exit 1
fi

echo "$INFO Revertendo codigo para o commit: $COMMIT_ALVO"
git reset --hard "$COMMIT_ALVO" || { echo "$ERRO git reset falhou."; exit 1; }

echo "$INFO Reinstalando dependencias para o commit revertido..."
if [ -f "package-lock.json" ]; then
  npm ci --omit=dev || echo "$WARN npm ci falhou durante o rollback; continuando com node_modules existente."
else
  npm install --omit=dev || echo "$WARN npm install falhou durante o rollback; continuando com node_modules existente."
fi

echo "$INFO Reiniciando processo via PM2..."
bash "$SCRIPTS_DIR/restart.sh"

sleep 5
if bash "$SCRIPTS_DIR/healthcheck.sh"; then
  echo "$OK Rollback concluido. $APP_NAME esta saudavel em $COMMIT_ALVO."
else
  echo "$ERRO Rollback executado, mas o health check ainda falhou. Intervencao manual necessaria."
  exit 1
fi

echo ""
echo "$WARN IMPORTANTE: o commit com problema ainda esta em origin/main no GitHub."
echo "$WARN Este rollback so restaurou o servidor. Corrija ou reverta o commit no GitHub"
echo "$WARN antes de rodar scripts/deploy.sh de novo, ou o mesmo problema volta."
