#!/usr/bin/env bash
# Funcoes compartilhadas por scripts/*.sh. Nao e executado diretamente:
# os outros scripts fazem "source scripts/_common.sh".

OK="[OK]"
WARN="[WARN]"
ERRO="[ERRO]"
INFO="[INFO]"

# Raiz do projeto = diretorio pai de scripts/, independente de onde o
# script foi chamado.
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"
APP_NAME="mplugins-discord-bot"

cd "$PROJECT_ROOT" || exit 1

detectar_termux() {
  if [ -n "${PREFIX:-}" ]; then
    case "$PREFIX" in
      */com.termux/*) return 0 ;;
    esac
  fi
  [ -d "/data/data/com.termux/files/usr" ] && return 0
  return 1
}

verificar_pm2() {
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "$ERRO PM2 nao encontrado. Instale com: npm install -g pm2"
    return 1
  fi
  return 0
}
