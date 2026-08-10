#!/usr/bin/env bash
set -u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

echo "========================================"
echo "$APP_NAME - Deploy"
echo "========================================"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "$ERRO git nao encontrado."
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "$ERRO Este diretorio nao e um repositorio Git ($PROJECT_ROOT)."
  exit 1
fi

# ---- 1. Salva o commit atual, para rollback.sh poder voltar aqui caso o
#         deploy falhe. Sempre sobrescreve com o commit ANTES desta
#         tentativa (o ultimo estado que sabemos que estava rodando). ----
mkdir -p .deploy
COMMIT_ANTERIOR="$(git rev-parse HEAD)"
echo "$COMMIT_ANTERIOR" > .deploy/rollback_commit
echo "$INFO Commit atual salvo para rollback: $COMMIT_ANTERIOR"

# ---- 2. Recusa deploy se houver alteracoes locais nao commitadas ----
if [ -n "$(git status --short)" ]; then
  echo "$ERRO Existem alteracoes locais nao commitadas neste servidor. Aborting."
  git --no-pager status --short
  exit 1
fi

# ---- 3. git pull ----
echo "$INFO Executando git pull..."
if ! git pull --ff-only origin main; then
  echo "$ERRO git pull falhou (histórico divergente ou sem conexao)."
  exit 1
fi

NOVO_COMMIT="$(git rev-parse HEAD)"
echo "$OK Codigo atualizado: $COMMIT_ANTERIOR -> $NOVO_COMMIT"

falhar_e_reverter() {
  local motivo="$1"
  echo "$ERRO $motivo"
  echo "$INFO Executando rollback automatico para $COMMIT_ANTERIOR..."
  bash "$SCRIPTS_DIR/rollback.sh"
  exit 1
}

# ---- 4. Instala dependencias (reprodutivel via package-lock.json) ----
echo "$INFO Instalando dependencias (npm ci)..."
if [ -f "package-lock.json" ]; then
  npm ci --omit=dev || falhar_e_reverter "npm ci falhou."
else
  echo "$WARN package-lock.json nao encontrado; usando npm install (menos reprodutivel)."
  npm install --omit=dev || falhar_e_reverter "npm install falhou."
fi

# ---- 5. Migrations ----
echo "$INFO Executando migrations..."
npm run migrate || falhar_e_reverter "Migrations falharam."

# ---- 6. Checks ----
echo "$INFO Executando checks..."
npm run check || falhar_e_reverter "npm run check falhou."

# ---- 7. Restart PM2 ----
echo "$INFO Reiniciando processo via PM2..."
bash "$SCRIPTS_DIR/restart.sh" || falhar_e_reverter "Falha ao reiniciar o PM2."

# ---- 8. Health check ----
echo "$INFO Aguardando 5s antes do health check..."
sleep 5
bash "$SCRIPTS_DIR/healthcheck.sh" || falhar_e_reverter "Health check falhou apos o deploy."

echo ""
echo "========================================"
echo "$OK Deploy concluido com sucesso: $NOVO_COMMIT"
echo "========================================"
