#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

echo "========================================"
echo "$APP_NAME - Health Check"
echo "========================================"
echo ""

FALHOU=0

verificar_pm2 || exit 1

# ---- Processo (PM2) ----
INFO_PROCESSO="$(pm2 jlist 2>/dev/null | node -e "
  let data = '';
  process.stdin.on('data', (c) => data += c);
  process.stdin.on('end', () => {
    try {
      const lista = JSON.parse(data || '[]');
      const app = lista.find((p) => p.name === '$APP_NAME');
      if (!app) { console.log('AUSENTE'); return; }
      const status = app.pm2_env ? app.pm2_env.status : 'desconhecido';
      const restarts = app.pm2_env ? app.pm2_env.restart_time : 0;
      const uptimeMs = app.pm2_env && app.pm2_env.pm_uptime ? (Date.now() - app.pm2_env.pm_uptime) : 0;
      console.log(status + '|' + restarts + '|' + Math.floor(uptimeMs / 1000));
    } catch (err) {
      console.log('ERRO_PARSE');
    }
  });
")"

if [ "$INFO_PROCESSO" = "AUSENTE" ]; then
  echo "$ERRO Processo $APP_NAME nao esta registrado no PM2."
  FALHOU=1
elif [ "$INFO_PROCESSO" = "ERRO_PARSE" ] || [ -z "$INFO_PROCESSO" ]; then
  echo "$ERRO Nao foi possivel ler o status do PM2."
  FALHOU=1
else
  STATUS="$(echo "$INFO_PROCESSO" | cut -d'|' -f1)"
  RESTARTS="$(echo "$INFO_PROCESSO" | cut -d'|' -f2)"
  UPTIME_SEGUNDOS="$(echo "$INFO_PROCESSO" | cut -d'|' -f3)"

  if [ "$STATUS" = "online" ]; then
    echo "$OK Processo online (uptime: ${UPTIME_SEGUNDOS}s, restarts: ${RESTARTS})"
  else
    echo "$ERRO Processo em status '$STATUS' (esperado: online)."
    FALHOU=1
  fi

  if [ "$RESTARTS" -gt 5 ] 2>/dev/null; then
    echo "$WARN Numero alto de restarts ($RESTARTS) - pode indicar crash loop."
  fi
fi

# ---- Banco de dados ----
if [ -f "src/db/test-connection.js" ]; then
  if node src/db/test-connection.js >/tmp/mplugins-healthcheck-db.log 2>&1; then
    echo "$OK PostgreSQL respondendo."
  else
    echo "$ERRO PostgreSQL nao respondeu. Detalhes em /tmp/mplugins-healthcheck-db.log"
    FALHOU=1
  fi
fi

echo ""
if [ "$FALHOU" -eq 0 ]; then
  echo "$OK Health check passou."
  exit 0
else
  echo "$ERRO Health check falhou."
  exit 1
fi
