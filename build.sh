#!/data/data/com.termux/files/usr/bin/env bash
# Fallback para ambientes que nao sejam Termux (Linux comum) tambem funciona,
# pois o shebang acima e apenas usado quando o arquivo e executado diretamente.
# Para rodar de forma universal, use sempre: bash build.sh
#
# ---------------------------------------------------------------------------
# mPlugins Discord Bot - build.sh
#
# Uso:
#   bash build.sh              Executa tudo (inclusive PostgreSQL) e inicia o bot.
#   bash build.sh --check      Executa verificacoes (inclusive PostgreSQL) sem
#                              iniciar o bot e sem registrar Slash Commands.
#   bash build.sh --deploy     Testa configuracao e registra Slash Commands,
#                              sem iniciar o bot. Nao mexe no PostgreSQL.
#   bash build.sh --start      Garante PostgreSQL rodando, executa verificacoes
#                              necessarias e inicia o bot.
#   bash build.sh --reinstall  Remove somente node_modules/ e reinstala as
#                              dependencias (nunca apaga .env, data/, logs/,
#                              nem o PostgreSQL ou o banco).
#
#   bash build.sh --github-init    Prepara o repositorio Git local e o
#                                  remote do GitHub. Nao faz push.
#   bash build.sh --github-push    Verifica seguranca, mostra o que sera
#                                  enviado, pede confirmacao (YES) e faz
#                                  commit + push. Alias: --github.
#   bash build.sh --github-status  Mostra branch, remote, alteracoes e
#                                  verifica arquivos sensiveis.
#   bash build.sh --github-pull    git pull --rebase origin main (recusa se
#                                  houver alteracoes locais nao commitadas).
#   bash build.sh --github-help    Ajuda dos modos GitHub.
#
#   Os modos --github* nunca executam npm install, migrations ou reiniciam
#   o bot, e nunca fazem push sem confirmacao explicita. Nunca enviam .env,
#   tokens, senhas ou chaves.
#
# Etapas (modo completo):
#   [1/12]  Ambiente (Termux, Node.js, npm)
#   [2/12]  Projeto (package.json, .env)
#   [3/12]  Filesystem (copia para fora do armazenamento compartilhado)
#   [4/12]  Dependencias (npm install)
#   [5/12]  Configuracao (.env do Discord/banco)
#   [6/12]  PostgreSQL (instala/inicializa/inicia se necessario)
#   [7/12]  Database (usuario e database dedicados)
#   [8/12]  Testando banco
#   [9/12]  Migrations
#   [10/12] Slash Commands
#   [11/12] Checks
#   [12/12] Start
#
# Seguro para executar multiplas vezes. NUNCA apaga: .env, node_modules/
# (exceto em --reinstall), data/, logs/, banco de dados, roles do PostgreSQL.
# Nunca usa systemctl, sudo ou Docker. Nunca executa DROP DATABASE/TABLE/ROLE.
# ---------------------------------------------------------------------------

set -u

OK="[OK]"
WARN="[WARN]"
ERRO="[ERRO]"
INFO="[INFO]"

MODE="${1:-full}"
case "$MODE" in
  --check) MODE="check" ;;
  --deploy) MODE="deploy" ;;
  --start) MODE="start" ;;
  --reinstall) MODE="reinstall" ;;
  --github) MODE="github" ;;
  --github-init) MODE="github-init" ;;
  --github-push) MODE="github-push" ;;
  --github-status) MODE="github-status" ;;
  --github-pull) MODE="github-pull" ;;
  --github-help) MODE="github-help" ;;
  "") MODE="full" ;;
  full) MODE="full" ;;
  *)
    echo "$ERRO Opcao desconhecida: $MODE"
    echo "Uso: bash build.sh [--check|--deploy|--start|--reinstall|--github|--github-init|--github-push|--github-status|--github-pull|--github-help]"
    exit 1
    ;;
esac

# Diretorio onde este script realmente esta (segue symlinks razoavelmente bem
# para os fins do Termux/Android).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
SAFE_HOME_DIR="${MPLUGINS_SAFE_DIR:-$HOME/projetos/mplugins-discord-bot}"

falhar() {
  echo "$ERRO $1"
  exit 1
}

titulo() {
  echo ""
  echo "$1"
}

# Verifica se um caminho absoluto esta dentro do armazenamento compartilhado
# do Android/Termux. Usa "contem" (*padrao*) em vez de "comeca com", pois
# caminhos como /data/data/com.termux/files/home/storage/shared/... contem
# "/storage/" no meio e nao no inicio.
eh_storage_compartilhado() {
  case "$1" in
    */storage/*|*/sdcard/*|/sdcard/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Le o valor de uma variavel simples (KEY=valor, uma linha) de um arquivo .env.
# Nao suporta valores com aspas complexas ou multi-linha.
ler_env_var() {
  local arquivo="$1" chave="$2"
  [ -f "$arquivo" ] || return 0
  grep -E "^${chave}=" "$arquivo" 2>/dev/null | tail -n1 | cut -d'=' -f2-
}

# Garante que uma chave NAO SECRETA exista com um valor padrao no .env,
# preenchendo apenas se a chave estiver ausente ou vazia. Nunca usar para
# DB_PASSWORD, DISCORD_TOKEN ou qualquer outro segredo.
garantir_env_padrao() {
  local arquivo="$1" chave="$2" valor="$3" atual tmp
  [ -f "$arquivo" ] || return 0
  atual="$(ler_env_var "$arquivo" "$chave")"
  if [ -z "$atual" ]; then
    if grep -q "^${chave}=" "$arquivo" 2>/dev/null; then
      tmp="$(mktemp)"
      grep -v "^${chave}=" "$arquivo" > "$tmp"
      echo "${chave}=${valor}" >> "$tmp"
      mv "$tmp" "$arquivo"
    else
      echo "${chave}=${valor}" >> "$arquivo"
    fi
    echo "$INFO ${chave} nao estava definida no .env; usando padrao '${valor}'."
  fi
}

# Detecta se estamos rodando dentro do Termux (Android), sem assumir
# systemd/sudo/Docker em nenhum outro ambiente Linux.
detectar_termux() {
  if [ -n "${PREFIX:-}" ]; then
    case "$PREFIX" in
      */com.termux/*) return 0 ;;
    esac
  fi
  [ -d "/data/data/com.termux/files/usr" ] && return 0
  return 1
}

# ---------------------------------------------------------------------------
# GitHub - funcoes auxiliares
#
# Nenhuma destas funcoes executa npm install, migrations ou inicia o bot.
# Servem apenas para versionar e publicar o codigo no GitHub, sempre com
# confirmacao explicita antes de qualquer "git push".
# ---------------------------------------------------------------------------

GITHUB_DEFAULT_COMMIT_MSG="Update mPlugins Discord Bot"

# Nomes de arquivo que NUNCA podem ser enviados ao GitHub.
github_arquivos_perigosos() {
  cat <<'EOF'
.env
.env.local
.env.production
.env.development
id_rsa
id_rsa.pub
EOF
}

# Padroes de nome (glob) tambem perigosos, verificados separadamente pois
# usam curinga (*.pem, *.key, .env.*).
github_padroes_perigosos_glob() {
  cat <<'EOF'
*.pem
*.key
.env.*
EOF
}

# Padroes de conteudo que indicam um segredo real (valor nao vazio) dentro
# de um arquivo. .env.example e sempre ignorado neste scan, pois seu
# proposito e conter as chaves sem valores.
github_padroes_secret_conteudo() {
  cat <<'EOF'
DISCORD_TOKEN=
BOT_TOKEN=
DATABASE_URL=
DB_PASSWORD=
API_KEY=
SECRET_KEY=
EOF
}

github_titulo() {
  echo ""
  echo "========================================"
  echo "mPlugins Discord Bot - GitHub"
  echo "========================================"
  echo ""
}

github_verificar_git() {
  if ! command -v git >/dev/null 2>&1; then
    echo "$ERRO Git nao encontrado."
    if detectar_termux; then
      echo "     Instale com: pkg install git"
    else
      echo "     Instale o Git antes de continuar."
    fi
    return 1
  fi

  echo "$OK Git encontrado ($(git --version))"
  github_garantir_safe_directory
  return 0
}

# No Termux, projetos dentro do armazenamento compartilhado do Android
# (/storage/emulated/0/...) costumam pertencer a um usuario/grupo
# diferente do que o Git espera, e o Git recusa QUALQUER operacao nesse
# diretorio com "fatal: detected dubious ownership" - inclusive o
# "git rev-parse --is-inside-work-tree" usado so para checar se o repo
# existe. Sem tratar isso, --github-init parece funcionar mas todo
# comando seguinte (--github-push, --github-status) falha achando que o
# repositorio nao foi inicializado. Registrar o diretorio como seguro
# uma vez resolve para todos os comandos --github* desta sessao em
# diante. So adiciona se ainda nao estiver registrado (idempotente).
github_garantir_safe_directory() {
  if git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$PROJECT_DIR"; then
    return 0
  fi

  if git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null; then
    echo "$OK Diretorio marcado como seguro para o Git (safe.directory)."
  fi
}

github_repo_existe() {
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false rev-parse --is-inside-work-tree >/dev/null 2>&1
}

github_verificar_gitignore() {
  local arquivo="$PROJECT_DIR/.gitignore"
  local obrigatorios=".env node_modules/ logs/ data/ *.pem *.key id_rsa"

  if [ ! -f "$arquivo" ]; then
    cat > "$arquivo" <<'EOF'
.env
.env.*
!.env.example

node_modules/
logs/
data/
*.log

.npm/
coverage/
dist/

.DS_Store

*.pem
*.key

id_rsa
id_rsa.pub
EOF
    echo "$OK .gitignore criado com regras seguras."
    return 0
  fi

  local faltando=0
  local item
  for item in $obrigatorios; do
    if ! grep -qF -- "$item" "$arquivo" 2>/dev/null; then
      echo "$item" >> "$arquivo"
      faltando=1
    fi
  done

  if [ "$faltando" -eq 1 ]; then
    echo "$WARN .gitignore existente estava incompleto; regras de seguranca ausentes foram adicionadas."
  else
    echo "$OK .gitignore ja contem as regras de seguranca necessarias."
  fi
  return 0
}

github_garantir_branch_main() {
  local atual
  atual="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false symbolic-ref --short -q HEAD 2>/dev/null)"

  if [ -z "$atual" ]; then
    # Repositorio recem-criado, sem nenhum commit ainda: define o nome
    # da branch inicial diretamente, sem precisar renomear depois.
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false symbolic-ref HEAD refs/heads/main
    echo "$OK Branch inicial definida como main"
    return 0
  fi

  if [ "$atual" = "main" ]; then
    echo "$OK Branch main"
    return 0
  fi

  git --no-pager -C "$PROJECT_DIR" -c color.ui=false branch -M main
  echo "$OK Branch renomeada para main (era '$atual')"
}

github_remote_configurado() {
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote get-url origin >/dev/null 2>&1
}

github_mostrar_remote() {
  local url
  url="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote get-url origin 2>/dev/null)"
  if [ -n "$url" ]; then
    echo "$INFO Remote origin ja configurado:"
    echo "     $url"
    return 0
  fi
  return 1
}

# So pergunta pela URL quando o terminal e interativo. Nunca inventa uma
# URL ficticia. Aceita tanto SSH (git@github.com:...) quanto HTTPS.
github_configurar_remote_interativo() {
  if github_mostrar_remote; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "$WARN Remote 'origin' nao configurado e o terminal nao e interativo."
    echo "     Configure manualmente com:"
    echo "     git remote add origin git@github.com:USUARIO/mplugins-discord-bot.git"
    return 1
  fi

  echo ""
  read -r -p "URL do repositorio GitHub (ex.: git@github.com:USUARIO/mplugins-discord-bot.git): " REPO_URL

  if [ -z "$REPO_URL" ]; then
    echo "$WARN Nenhuma URL informada. Remote 'origin' nao foi configurado."
    return 1
  fi

  case "$REPO_URL" in
    git@github.com:*|https://github.com/*) ;;
    *)
      echo "$WARN A URL informada nao parece ser um repositorio do GitHub, mas sera usada mesmo assim."
      ;;
  esac

  git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote add origin "$REPO_URL"
  echo "$OK Remote origin configurado:"
  echo "     $REPO_URL"
}

# Verifica se algum arquivo de nome perigoso esta rastreado, staged ou
# presente no diretorio de trabalho (e nao ignorado). Retorna 1 se achar.
github_scan_arquivos_perigosos() {
  local encontrou=0
  local item padrao arquivo

  echo "$INFO Verificando arquivos sensiveis..."

  while IFS= read -r item; do
    [ -z "$item" ] && continue
    if git --no-pager -C "$PROJECT_DIR" -c color.ui=false ls-files --cached --others --exclude-standard 2>/dev/null | grep -Fxq "$item"; then
      echo "$ERRO [SECURITY] Arquivo sensivel detectado: $item"
      encontrou=1
    fi
  done <<< "$(github_arquivos_perigosos)"

  while IFS= read -r padrao; do
    [ -z "$padrao" ] && continue
    while IFS= read -r arquivo; do
      [ -z "$arquivo" ] && continue
      case "$arquivo" in
        .env.example) continue ;;
      esac
      case "$arquivo" in
        $padrao)
          echo "$ERRO [SECURITY] Arquivo sensivel detectado: $arquivo"
          encontrou=1
          ;;
      esac
    done <<< "$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false ls-files --cached --others --exclude-standard 2>/dev/null)"
  done <<< "$(github_padroes_perigosos_glob)"

  return $encontrou
}

# Procura padroes de secret (valor nao vazio, literal) dentro do conteudo
# dos arquivos que estao staged para o commit (git diff --cached).
#
# Para reduzir falsos positivos, o scan:
#  - pula documentacao (*.md), .gitignore e arquivos de exemplo
#    (.env.example, *.example, *.sample), que legitimamente mostram os
#    nomes das chaves;
#  - so considera um match quando o valor apos o "=" comeca com uma letra
#    ou digito literal, e nao com "$" (referencia a variavel/comando, como
#    em DB_PASSWORD="$(...)" ou DB_PASSWORD=${VAR} dentro de scripts).
github_scan_conteudo_secrets() {
  local encontrou=0
  local padrao arquivo

  while IFS= read -r arquivo; do
    [ -z "$arquivo" ] && continue
    [ -f "$PROJECT_DIR/$arquivo" ] || continue
    case "$arquivo" in
      .env.example|*.md|.gitignore|*.example|*.sample) continue ;;
    esac

    while IFS= read -r padrao; do
      [ -z "$padrao" ] && continue
      if grep -qE "^${padrao}\"?[A-Za-z0-9]" "$PROJECT_DIR/$arquivo" 2>/dev/null; then
        echo "$ERRO [SECURITY] Possivel secret detectado em: $arquivo (padrao: ${padrao})"
        encontrou=1
      fi
    done <<< "$(github_padroes_secret_conteudo)"
  done <<< "$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false diff --cached --name-only 2>/dev/null)"

  return $encontrou
}

github_status_resumo() {
  local branch remote alteradas nao_rastreados

  branch="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false symbolic-ref --short -q HEAD 2>/dev/null)"
  [ -z "$branch" ] && branch="(sem commits ainda)"

  remote="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote get-url origin 2>/dev/null)"
  [ -z "$remote" ] && remote="(nao configurado)"

  alteradas="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short 2>/dev/null | grep -vc '^??')"
  nao_rastreados="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short 2>/dev/null | grep -c '^??')"

  echo "Branch:"
  echo "$branch"
  echo ""
  echo "Remote:"
  echo "$remote"
  echo ""
  echo "Alteracoes:"
  echo "$alteradas arquivos"
  echo ""
  echo "Arquivos nao rastreados:"
  echo "$nao_rastreados"
  echo ""

  git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short
}

github_verificar_ssh_se_necessario() {
  local remote
  remote="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote get-url origin 2>/dev/null)"

  case "$remote" in
    git@github.com:*)
      echo "$INFO Remote usa SSH. Verificando autenticacao (ssh -T git@github.com)..."
      local saida
      saida="$(ssh -T -o BatchMode=yes -o ConnectTimeout=8 git@github.com 2>&1)"
      if echo "$saida" | grep -qi "successfully authenticated"; then
        echo "$OK Autenticacao SSH com o GitHub confirmada."
      else
        echo "$WARN Nao foi possivel confirmar a autenticacao SSH com o GitHub."
        echo "     Configure uma chave SSH e adicione-a a sua conta do GitHub:"
        echo "     https://docs.github.com/authentication/connecting-to-github-with-ssh"
      fi
      ;;
    https://github.com/*)
      echo "$INFO Remote usa HTTPS. A autenticacao deve ser feita pelo Git Credential Manager"
      echo "     ou por um Personal Access Token configurado fora deste script."
      echo "     O build.sh nunca armazena nem imprime tokens do GitHub."
      ;;
  esac
}

github_verificar_workflow() {
  if [ -f "$PROJECT_DIR/.github/workflows/deploy.yml" ]; then
    echo "$OK Workflow de deploy encontrado (.github/workflows/deploy.yml)"
    return 0
  fi
  echo "$WARN Workflow de deploy nao encontrado (.github/workflows/deploy.yml)."
  return 1
}

github_cmd_init() {
  github_titulo

  github_verificar_git || return 1

  if github_repo_existe; then
    echo "$OK Repositorio Git ja inicializado"
  else
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false init >/dev/null 2>&1
    echo "$OK Repositorio Git inicializado"
  fi

  github_garantir_branch_main
  github_verificar_gitignore

  if [ -f "$PROJECT_DIR/.env" ]; then
    echo "$OK .env protegido (presente localmente, ignorado pelo Git)"
  else
    echo "$INFO .env ainda nao existe localmente (sera ignorado quando criado)."
  fi

  echo ""
  echo "Remote GitHub:"
  github_configurar_remote_interativo

  echo ""
  echo "$OK GitHub configurado"
  echo ""
  echo "Para enviar:"
  echo ""
  echo "    bash build.sh --github-push"
  echo ""
}

github_cmd_status() {
  github_titulo

  github_verificar_git || return 1
  if ! github_repo_existe; then
    echo "$ERRO Repositorio Git nao inicializado. Rode: bash build.sh --github-init"
    return 1
  fi

  github_status_resumo

  echo ""
  if github_scan_arquivos_perigosos; then
    echo "$OK Nenhum arquivo sensivel detectado."
  else
    echo "$ERRO [SECURITY] Corrija os arquivos sensiveis acima antes de fazer push."
    return 1
  fi
}

github_cmd_pull() {
  github_titulo

  github_verificar_git || return 1
  if ! github_repo_existe; then
    echo "$ERRO Repositorio Git nao inicializado. Rode: bash build.sh --github-init"
    return 1
  fi
  if ! github_remote_configurado; then
    echo "$ERRO Remote 'origin' nao configurado. Rode: bash build.sh --github-init"
    return 1
  fi

  local pendencias
  pendencias="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short 2>/dev/null)"
  if [ -n "$pendencias" ]; then
    echo "$ERRO Existem alteracoes locais."
    echo "$pendencias"
    echo ""
    echo "$INFO Faca commit ou descarte as alteracoes antes de executar --github-pull."
    return 1
  fi

  echo "$INFO Executando: git pull --rebase origin main"
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false pull --rebase origin main
}

# Fluxo compartilhado por --github e --github-push.
# Argumento opcional: mensagem de commit.
github_cmd_push() {
  local mensagem="${1:-}"

  github_titulo

  github_verificar_git || return 1

  if ! github_repo_existe; then
    echo "$ERRO Repositorio Git nao inicializado. Rode: bash build.sh --github-init"
    return 1
  fi

  github_garantir_branch_main
  github_verificar_gitignore

  if ! github_remote_configurado; then
    echo "$ERRO Remote 'origin' nao configurado."
    echo "$INFO Rode: bash build.sh --github-init"
    return 1
  fi
  github_mostrar_remote

  echo ""
  echo "$INFO git status"
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short
  echo ""

  if ! github_scan_arquivos_perigosos; then
    echo "$ERRO [SECURITY] Push cancelado: arquivo sensivel detectado."
    return 1
  fi

  local mudancas
  mudancas="$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false status --short 2>/dev/null)"
  if [ -z "$mudancas" ] && [ -n "$(git --no-pager -C "$PROJECT_DIR" -c color.ui=false log -1 2>/dev/null)" ]; then
    echo "$INFO Nenhuma alteracao para enviar. Nada a fazer."
    return 0
  fi

  git --no-pager -C "$PROJECT_DIR" -c color.ui=false add .

  if ! github_scan_conteudo_secrets; then
    echo "$ERRO [SECURITY] Possivel secret detectado no conteudo dos arquivos staged."
    echo "$INFO Revertendo 'git add' por seguranca."
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false reset >/dev/null 2>&1
    return 1
  fi

  echo ""
  echo "========================================"
  echo "GITHUB PUSH"
  echo "========================================"
  echo ""
  echo "Branch:"
  echo "main"
  echo ""
  echo "Remote:"
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false remote get-url origin
  echo ""
  echo "Arquivos:"
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false diff --cached --name-status
  echo ""
  echo "Deseja continuar?"
  echo ""

  if [ -t 0 ]; then
    read -r -p "Digite YES para continuar: " CONFIRMACAO
  else
    echo "$WARN Terminal nao interativo; push cancelado por seguranca (nunca faz push automatico sem confirmacao)."
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false reset >/dev/null 2>&1
    return 1
  fi

  if [ "$CONFIRMACAO" != "YES" ]; then
    echo "$INFO Push cancelado pelo usuario."
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false reset >/dev/null 2>&1
    return 0
  fi

  if [ -z "$mensagem" ] && [ -t 0 ]; then
    read -r -p "Mensagem do commit [Update mPlugins Discord Bot]: " mensagem
  fi
  [ -z "$mensagem" ] && mensagem="$GITHUB_DEFAULT_COMMIT_MSG"

  git --no-pager -C "$PROJECT_DIR" -c color.ui=false commit -m "$mensagem"
  if [ $? -ne 0 ]; then
    echo "$ERRO Falha ao criar o commit."
    return 1
  fi
  echo "$OK Commit criado: $mensagem"

  github_verificar_ssh_se_necessario

  local primeiro_push=0
  git --no-pager -C "$PROJECT_DIR" -c color.ui=false rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 || primeiro_push=1

  if [ "$primeiro_push" -eq 1 ]; then
    echo "$INFO Primeiro push deste branch; configurando upstream (origin/main)."
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false push -u origin main
  else
    git --no-pager -C "$PROJECT_DIR" -c color.ui=false push origin main
  fi

  if [ $? -ne 0 ]; then
    echo "$ERRO Falha ao executar 'git push'. O commit local foi mantido."
    return 1
  fi

  echo ""
  echo "$OK Codigo enviado para o GitHub."

  if github_verificar_workflow; then
    echo "$INFO O GitHub Actions devera iniciar o deploy automaticamente."
  fi
}

github_cmd_help() {
  github_titulo
  cat <<'EOF'
Uso:

  bash build.sh --github-init      Prepara o repositorio Git local e o
                                    remote do GitHub (nao faz push).

  bash build.sh --github-push      Mostra o status, verifica seguranca,
                                    pede confirmacao e envia (git push).
                                    Mesmo fluxo do --github.

  bash build.sh --github           Alias de --github-push.

  bash build.sh --github-status    Mostra branch, remote, alteracoes e
                                    verifica arquivos sensiveis.

  bash build.sh --github-pull      Executa 'git pull --rebase origin main'.
                                    Recusa se houver alteracoes locais.

  bash build.sh --github-help      Mostra esta ajuda.

Nenhum destes modos executa npm install, migrations ou reinicia o bot.
Nenhum push e feito sem confirmacao explicita (digitar YES).
Segredos (.env, tokens, senhas, chaves) nunca sao enviados.
EOF
}

executar_github() {
  local modo="$1"
  shift || true

  case "$modo" in
    github-init) github_cmd_init "$@" ;;
    github-status) github_cmd_status "$@" ;;
    github-pull) github_cmd_pull "$@" ;;
    github-push) github_cmd_push "$@" ;;
    github) github_cmd_push "$@" ;;
    github-help) github_cmd_help ;;
    *)
      echo "$ERRO Modo GitHub desconhecido: $modo"
      return 1
      ;;
  esac
}

case "$MODE" in
  github|github-init|github-push|github-status|github-pull|github-help)
    executar_github "$MODE" "${2:-}"
    exit $?
    ;;
esac

echo "========================================"
echo "mPlugins Discord Bot"
echo "========================================"

# ---------------------------------------------------------------------------
# [1/12] Verificando ambiente
# ---------------------------------------------------------------------------
titulo "[1/12] Verificando ambiente"

IS_TERMUX=0
if detectar_termux; then
  IS_TERMUX=1
  echo "$OK Termux detectado"
else
  echo "$INFO Termux nao detectado; este e um ambiente Linux comum. Recursos exclusivos do Termux (ex.: 'pkg install postgresql') serao adaptados/pulados quando necessario."
fi

if command -v node >/dev/null 2>&1; then
  echo "$OK Node.js ($(node -v))"
else
  falhar "Node.js nao encontrado. No Termux, instale com: pkg install nodejs"
fi

if command -v npm >/dev/null 2>&1; then
  echo "$OK npm ($(npm -v))"
else
  falhar "npm nao encontrado."
fi

# ---------------------------------------------------------------------------
# [2/12] Verificando projeto
# ---------------------------------------------------------------------------
titulo "[2/12] Verificando projeto"

[ -f "$PROJECT_DIR/package.json" ] && echo "$OK package.json" || falhar "package.json nao encontrado em $PROJECT_DIR."

ENV_RECEM_CRIADO=0
if [ -f "$PROJECT_DIR/.env" ]; then
  echo "$OK .env"
else
  if [ -f "$PROJECT_DIR/.env.example" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "$WARN Arquivo .env nao existia. Foi criado a partir de .env.example."
    ENV_RECEM_CRIADO=1
  else
    falhar "Nenhum .env ou .env.example encontrado em $PROJECT_DIR."
  fi
fi

# Preenche somente valores NAO SECRETOS de banco que ainda nao existam no
# .env. Nunca inventa DB_PASSWORD, DISCORD_TOKEN ou qualquer outro segredo.
garantir_env_padrao "$PROJECT_DIR/.env" DB_HOST "localhost"
garantir_env_padrao "$PROJECT_DIR/.env" DB_PORT "5432"
garantir_env_padrao "$PROJECT_DIR/.env" DB_NAME "mplugins_discord_bot"
garantir_env_padrao "$PROJECT_DIR/.env" DB_USER "mplugins"

if [ "$ENV_RECEM_CRIADO" -eq 1 ]; then
  falhar "Preencha DISCORD_TOKEN, CLIENT_ID, GUILD_ID e (se quiser) DB_PASSWORD em $PROJECT_DIR/.env antes de rodar novamente."
fi

# ---------------------------------------------------------------------------
# [3/12] Preparando filesystem
# ---------------------------------------------------------------------------
titulo "[3/12] Preparando filesystem"

if eh_storage_compartilhado "$PROJECT_DIR"; then
    if eh_storage_compartilhado "$SAFE_HOME_DIR"; then
      falhar "MPLUGINS_SAFE_DIR ($SAFE_HOME_DIR) esta dentro do armazenamento compartilhado. npm install nao funciona ai (EACCES em symlinks - o mesmo erro que motivou essa copia). Aponte MPLUGINS_SAFE_DIR para um diretorio dentro do filesystem privado do Termux (ex.: \$HOME/projetos/mplugins-discord-bot)."
    fi

    echo "$WARN Projeto detectado no armazenamento compartilhado do Android ($PROJECT_DIR)."
    echo "     npm install nao pode ser executado com seguranca ai (EACCES em symlinks)."
    echo "     Copiando para o filesystem privado do Termux: $SAFE_HOME_DIR"

    mkdir -p "$SAFE_HOME_DIR"

    if command -v rsync >/dev/null 2>&1; then
      rsync -a \
        --exclude 'node_modules/' \
        --exclude '.git/' \
        --exclude '.env' \
        --exclude 'data/' \
        --exclude 'logs/' \
        "$PROJECT_DIR"/ "$SAFE_HOME_DIR"/
    else
      # Fallback sem rsync: copia tudo exceto os itens protegidos.
      for item in "$PROJECT_DIR"/* "$PROJECT_DIR"/.[!.]*; do
        base="$(basename "$item")"
        case "$base" in
          node_modules|.git|.env|data|logs) continue ;;
        esac
        [ -e "$item" ] && cp -r "$item" "$SAFE_HOME_DIR"/ 2>/dev/null
      done
    fi

    # .env, data/ e logs/ do destino NUNCA sao sobrescritos se ja existirem;
    # so copiamos o .env se o destino ainda nao tiver um.
    if [ ! -f "$SAFE_HOME_DIR/.env" ] && [ -f "$PROJECT_DIR/.env" ]; then
      cp "$PROJECT_DIR/.env" "$SAFE_HOME_DIR/.env"
    fi

    echo "$OK Copia segura pronta em $SAFE_HOME_DIR"
    echo "$INFO Projeto original em $PROJECT_DIR permanece intacto."
    echo "$INFO Continuando a execucao a partir da copia..."

    exec bash "$SAFE_HOME_DIR/build.sh" "$@"
else
    echo "$OK Diretório seguro do Termux ($PROJECT_DIR)"
fi

cd "$PROJECT_DIR" || falhar "Nao foi possivel entrar em $PROJECT_DIR."

# Validacao obrigatoria: mesmo apos a copia/cd, confirma que o diretorio
# efetivo (via realpath, resolvendo symlinks) nao esta no armazenamento
# compartilhado antes de deixar o npm install rodar.
PROJECT_DIR_REAL="$(realpath "$PROJECT_DIR")"
if eh_storage_compartilhado "$PROJECT_DIR_REAL"; then
  falhar "O diretorio ainda esta no armazenamento compartilhado ($PROJECT_DIR_REAL). npm install nao sera executado. Ajuste MPLUGINS_SAFE_DIR e rode novamente."
else
  echo "$OK Filesystem seguro: $PROJECT_DIR_REAL"
fi
mkdir -p logs data

# ---------------------------------------------------------------------------
# [4/12] Instalando dependências
# ---------------------------------------------------------------------------
titulo "[4/12] Instalando dependências"

if [ "$MODE" = "reinstall" ]; then
  echo "$INFO Removendo node_modules/ para reinstalacao completa..."
  rm -rf "$PROJECT_DIR/node_modules"
fi

DEPENDENCIAS_OK=1
if [ -d "$PROJECT_DIR/node_modules" ]; then
  for dep in dotenv discord.js express pg; do
    if [ ! -d "$PROJECT_DIR/node_modules/$dep" ]; then
      DEPENDENCIAS_OK=0
      break
    fi
  done
else
  DEPENDENCIAS_OK=0
fi

if [ "$DEPENDENCIAS_OK" -eq 1 ] && [ "$MODE" != "reinstall" ]; then
  echo "$OK node_modules ja presente e completo, pulando npm install."
else
  npm install
  if [ $? -eq 0 ]; then
    echo "$OK npm install"
  else
    falhar "Falha ao instalar dependências."
  fi
fi

if [ "$MODE" = "reinstall" ]; then
  echo ""
  echo "$OK Dependencias reinstaladas."
  echo "$INFO Rode 'bash build.sh' (ou 'bash build.sh --start') para continuar."
  exit 0
fi

# ---------------------------------------------------------------------------
# [5/12] Verificando configuração
# ---------------------------------------------------------------------------
titulo "[5/12] Verificando configuração"

node -e "
const config = require('./src/config/constants');
const faltando = [];
if (!config.discord.token) faltando.push('DISCORD_TOKEN');
if (!config.discord.clientId) faltando.push('CLIENT_ID');
if (!config.discord.guildId) faltando.push('GUILD_ID');
if (faltando.length > 0) {
  console.log('[ERRO] Variavel(is) ausente(s) no .env: ' + faltando.join(', '));
  process.exit(1);
}
console.log('[OK] Discord');
"
if [ $? -ne 0 ]; then
  falhar "Configuracao do Discord incompleta. Preencha o .env e rode novamente."
fi

node -e "
const db = require('./src/services/database');
const erro = db.validarConfiguracaoBanco();
if (erro) {
  console.log(erro);
  process.exit(1);
}
console.log('[OK] PostgreSQL');
"
if [ $? -ne 0 ]; then
  falhar "Configuracao do PostgreSQL incompleta. Preencha o .env (DATABASE_URL ou DB_HOST/DB_PORT/DB_NAME/DB_USER) e rode novamente."
fi

if [ "$MODE" = "deploy" ]; then
  titulo "[10/12] Registrando Slash Commands"
  npm run deploy
  if [ $? -eq 0 ]; then
    echo "$OK Commands registrados"
  else
    falhar "Falha ao registrar Slash Commands."
  fi
  echo ""
  echo "========================================"
  echo " DEPLOY CONCLUIDO"
  echo "========================================"
  exit 0
fi

# Le a configuracao de banco do .env, usada pelas etapas de PostgreSQL/Database
# a seguir. Se DATABASE_URL estiver definida, o projeto usa um banco externo
# e a automacao local do PostgreSQL (instalar/iniciar/criar usuario/database)
# e pulada — a configuracao existente e sempre respeitada.
ENV_FILE="$PROJECT_DIR/.env"
DATABASE_URL_ENV="$(ler_env_var "$ENV_FILE" DATABASE_URL)"
DB_HOST="$(ler_env_var "$ENV_FILE" DB_HOST)"; DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(ler_env_var "$ENV_FILE" DB_PORT)"; DB_PORT="${DB_PORT:-5432}"
DB_NAME="$(ler_env_var "$ENV_FILE" DB_NAME)"; DB_NAME="${DB_NAME:-mplugins_discord_bot}"
DB_USER="$(ler_env_var "$ENV_FILE" DB_USER)"; DB_USER="${DB_USER:-mplugins}"
DB_PASSWORD="$(ler_env_var "$ENV_FILE" DB_PASSWORD)"

# ---------------------------------------------------------------------------
# [6/12] PostgreSQL
# ---------------------------------------------------------------------------
titulo "[6/12] PostgreSQL"

POSTGRES_LOCAL_GERENCIADO=1

if [ -n "$DATABASE_URL_ENV" ]; then
  POSTGRES_LOCAL_GERENCIADO=0
  echo "$INFO DATABASE_URL definida no .env; usando banco externo. Pulando instalacao/inicializacao automatica do PostgreSQL local."
else
  pg_binarios_presentes() {
    command -v psql >/dev/null 2>&1 &&
    command -v postgres >/dev/null 2>&1 &&
    command -v initdb >/dev/null 2>&1 &&
    command -v pg_ctl >/dev/null 2>&1
  }

  if pg_binarios_presentes; then
    echo "$OK PostgreSQL encontrado"
  else
    echo "$WARN PostgreSQL nao encontrado."
    if [ "$IS_TERMUX" -eq 1 ] && command -v pkg >/dev/null 2>&1; then
      echo "$INFO Instalando PostgreSQL via pkg (Termux)..."
      pkg install -y postgresql || falhar "Falha ao instalar PostgreSQL via 'pkg install -y postgresql'."
      if pg_binarios_presentes; then
        echo "$OK PostgreSQL instalado"
      else
        falhar "PostgreSQL foi instalado mas os binarios (psql/postgres/initdb/pg_ctl) nao foram encontrados no PATH."
      fi
    else
      falhar "PostgreSQL nao encontrado e nao ha como instalar automaticamente neste ambiente (nao e Termux ou 'pkg' indisponivel). Instale o PostgreSQL manualmente e rode novamente."
    fi
  fi

  # Diretorio de dados do cluster: nunca dentro do armazenamento compartilhado.
  PGDATA="${PGDATA:-${PREFIX:-$HOME}/var/lib/postgresql}"
  if eh_storage_compartilhado "$PGDATA"; then
    falhar "PGDATA ($PGDATA) esta dentro do armazenamento compartilhado. Defina a variavel PGDATA para um caminho no filesystem privado do Termux."
  fi

  if [ -f "$PGDATA/PG_VERSION" ]; then
    echo "$OK Cluster do PostgreSQL ja inicializado ($PGDATA)"
  else
    echo "$INFO Inicializando cluster do PostgreSQL em $PGDATA..."
    mkdir -p "$(dirname "$PGDATA")"
    initdb -D "$PGDATA" >/dev/null 2>&1
    if [ $? -eq 0 ] && [ -f "$PGDATA/PG_VERSION" ]; then
      echo "$OK Cluster inicializado"
    else
      falhar "initdb falhou ao inicializar o cluster em $PGDATA."
    fi
  fi

  if pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
    echo "$OK PostgreSQL ja esta rodando (porta $DB_PORT)"
  else
    echo "$INFO Iniciando PostgreSQL..."
    mkdir -p "$PGDATA"
    # unix_socket_directories aponta para dentro do proprio PGDATA: o padrao
    # do sistema (/var/run/postgresql) normalmente nao e gravavel por um
    # usuario comum, nem no Termux nem em Linux convencional.
    pg_ctl -D "$PGDATA" -o "-p $DB_PORT -k $PGDATA" -l "$PGDATA/logfile" start >/dev/null 2>&1

    PG_PRONTO=0
    TENTATIVA=0
    while [ "$TENTATIVA" -lt 15 ]; do
      if pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
        PG_PRONTO=1
        break
      fi
      TENTATIVA=$((TENTATIVA + 1))
      sleep 1
    done

    if [ "$PG_PRONTO" -eq 1 ]; then
      echo "$OK PostgreSQL iniciado (porta $DB_PORT)"
    else
      falhar "PostgreSQL nao iniciou apos 15 tentativas. Veja o log em: $PGDATA/logfile"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# [7/12] Database
# ---------------------------------------------------------------------------
titulo "[7/12] Database"

if [ "$POSTGRES_LOCAL_GERENCIADO" -eq 0 ]; then
  echo "$INFO Banco gerenciado externamente via DATABASE_URL; pulando criacao automatica de usuario/database."
else
  # Usuario administrador local do cluster: no Termux, o initdb cria o
  # superusuario com o mesmo nome do usuario do sistema operacional.
  PG_ADMIN_USER="$(whoami)"

  if [ -z "$DB_PASSWORD" ]; then
    if [ -t 0 ]; then
      echo "$INFO DB_PASSWORD nao esta definida no .env."
      read -r -s -p "Senha para o usuario '$DB_USER' do PostgreSQL (vazio = sem senha): " DB_PASSWORD_DIGITADA
      echo ""
      if [ -n "$DB_PASSWORD_DIGITADA" ]; then
        read -r -p "Salvar essa senha no .env como DB_PASSWORD? [s/N]: " SALVAR_SENHA
        case "$SALVAR_SENHA" in
          s|S|sim|SIM|y|Y|yes|YES)
            TMP_ENV="$(mktemp)"
            grep -v "^DB_PASSWORD=" "$ENV_FILE" > "$TMP_ENV"
            echo "DB_PASSWORD=${DB_PASSWORD_DIGITADA}" >> "$TMP_ENV"
            mv "$TMP_ENV" "$ENV_FILE"
            echo "$OK DB_PASSWORD salva no .env."
            ;;
          *)
            echo "$INFO Senha nao salva no .env (sera solicitada novamente na proxima execucao)."
            ;;
        esac
      fi
      DB_PASSWORD="$DB_PASSWORD_DIGITADA"
    else
      echo "$WARN DB_PASSWORD nao definida e o terminal nao e interativo; tentando autenticacao local sem senha."
    fi
  fi

  ROLE_EXISTE="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null)"
  if [ "$ROLE_EXISTE" = "1" ]; then
    echo "$OK Usuario $DB_USER ja existe"
  else
    echo "$INFO Criando usuario $DB_USER..."
    if [ -n "$DB_PASSWORD" ]; then
      DB_PASSWORD_SQL="${DB_PASSWORD//\'/\'\'}"
      psql -h 127.0.0.1 -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres >/dev/null 2>&1 <<SQL
CREATE ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASSWORD_SQL';
SQL
    else
      psql -h 127.0.0.1 -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres -c "CREATE ROLE \"$DB_USER\" LOGIN;" >/dev/null 2>&1
    fi
    if [ $? -eq 0 ]; then
      echo "$OK Usuario $DB_USER criado"
    else
      falhar "Falha ao criar o usuario $DB_USER no PostgreSQL."
    fi
  fi

  DATABASE_EXISTE="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null)"
  if [ "$DATABASE_EXISTE" = "1" ]; then
    echo "$OK Database $DB_NAME ja existe"
  else
    echo "$INFO Criando database $DB_NAME..."
    psql -h 127.0.0.1 -p "$DB_PORT" -U "$PG_ADMIN_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      echo "$OK Database criado"
    else
      falhar "Falha ao criar o database $DB_NAME."
    fi
  fi

  echo "$INFO Host: $DB_HOST"
  echo "$INFO Port: $DB_PORT"
  echo "$INFO Database: $DB_NAME"
  echo "$INFO User: $DB_USER"
fi

# ---------------------------------------------------------------------------
# [8/12] Testando banco
# ---------------------------------------------------------------------------
titulo "[8/12] Testando banco"

npm run db:test
if [ $? -eq 0 ]; then
  echo "$OK PostgreSQL conectado"
  if [ -n "$DATABASE_URL_ENV" ]; then
    echo "$OK Configurado via DATABASE_URL"
  else
    echo "$OK User: $DB_USER"
    echo "$OK Database: $DB_NAME"
  fi
else
  falhar "PostgreSQL não está acessível. Verifique se o servidor esta rodando e as credenciais no .env."
fi

# ---------------------------------------------------------------------------
# [9/12] Executando migrations
# ---------------------------------------------------------------------------
titulo "[9/12] Executando migrations"

npm run migrate
if [ $? -eq 0 ]; then
  echo "$OK Database atualizado"
else
  falhar "Falha ao executar migrations."
fi

# ---------------------------------------------------------------------------
# [10/12] Registrando Slash Commands
# ---------------------------------------------------------------------------
titulo "[10/12] Registrando Slash Commands"

if [ "$MODE" = "check" ]; then
  echo "$INFO Modo --check: pulando registro de Slash Commands."
else
  npm run deploy
  if [ $? -eq 0 ]; then
    echo "$OK Commands registrados"
  else
    falhar "Falha ao registrar Slash Commands."
  fi
fi

# ---------------------------------------------------------------------------
# [11/12] Executando checks
# ---------------------------------------------------------------------------
titulo "[11/12] Executando checks"

npm run check
if [ $? -eq 0 ]; then
  echo "$OK Checks passaram"
else
  falhar "Checks falharam. Veja os detalhes acima."
fi

if [ "$MODE" = "check" ]; then
  echo ""
  echo "========================================"
  echo " TUDO PRONTO (verificacao)"
  echo "========================================"
  exit 0
fi

# ---------------------------------------------------------------------------
# [12/12] Iniciando bot
# ---------------------------------------------------------------------------
titulo "[12/12] Iniciando bot"

echo ""
echo "========================================"
echo " TUDO PRONTO"
echo "========================================"
echo ""

exec npm start
