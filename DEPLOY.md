# Deploy

Depois que `GITHUB_SETUP.md` e `ORACLE_SETUP.md` foram seguidos uma vez,
o fluxo do dia a dia e apenas:

```bash
git add .
git commit -m "Atualizacao"
git push
```

O que acontece automaticamente:

```
GitHub
  |
  v
GitHub Actions (.github/workflows/deploy.yml)
  |
  v
Job "test": npm ci, node --check em tudo, roda os testes offline
  |
  v
Job "deploy" (so roda se "test" passar, e so na branch main):
  conecta via SSH na Oracle Cloud (secrets: ORACLE_HOST/ORACLE_USER/ORACLE_PORT/ORACLE_SSH_KEY)
  |
  v
scripts/deploy.sh, executado NO SERVIDOR:
  1. salva o commit atual em .deploy/rollback_commit
  2. git pull --ff-only origin main
  3. npm ci
  4. npm run migrate
  5. npm run check
  6. scripts/restart.sh (PM2)
  7. scripts/healthcheck.sh
  |
  v
Se qualquer passo de 3 a 7 falhar: rollback automatico (scripts/rollback.sh)
  para o commit salvo no passo 1, e o workflow falha (fica vermelho no GitHub).
```

## Rodando manualmente (sem esperar o Actions)

Direto no servidor, dentro de `/opt/mplugins-platform/mplugins-discord-bot`:

```bash
bash scripts/deploy.sh
```

## Rollback manual

Normalmente o `deploy.sh` ja reverte sozinho se algo falhar. Se precisar
reverter manualmente por qualquer outro motivo:

```bash
bash scripts/rollback.sh
```

Isso volta o codigo para o commit salvo em `.deploy/rollback_commit` (o
ultimo commit que estava rodando antes da ultima tentativa de deploy),
reinstala dependencias e reinicia o PM2.

**Importante**: o rollback so restaura o servidor. O commit com problema
continua em `origin/main` no GitHub. Se voce rodar `scripts/deploy.sh`
de novo sem corrigir/reverter o commit no GitHub primeiro, o mesmo
problema volta. Corrija o codigo (ou `git revert` o commit problematico)
e faca push antes do proximo deploy.

## Scripts disponiveis

| Script | O que faz |
|---|---|
| `scripts/start.sh` | Inicia o bot via PM2 (primeira vez) |
| `scripts/stop.sh` | Para o bot (graceful shutdown) |
| `scripts/restart.sh` | Reinicia o bot; inicia se ainda nao estiver rodando |
| `scripts/healthcheck.sh` | Verifica status do processo (PM2) e conexao com o PostgreSQL |
| `scripts/deploy.sh` | Fluxo completo de deploy, com rollback automatico em caso de falha |
| `scripts/rollback.sh` | Reverte para o ultimo commit salvo e reinicia |

Todos funcionam tanto em Linux "normal" (Oracle Cloud) quanto no Termux,
sem depender de Docker, systemd ou comandos exclusivos de uma
distribuicao.

## Comandos uteis no dia a dia

```bash
pm2 status                                  # status do processo
pm2 logs mplugins-discord-bot               # logs em tempo real
pm2 logs mplugins-discord-bot --lines 200   # ultimas 200 linhas
pm2 monit                                   # CPU/memoria em tempo real
bash scripts/healthcheck.sh                 # checagem completa (processo + banco)
```

## Troubleshooting

**O workflow falhou no job "test"**
O problema esta no codigo, nao no servidor — o deploy nem chegou a ser
tentado. Veja o log do job no GitHub Actions.

**O workflow falhou no job "deploy" / SSH**
Confira se os secrets `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_PORT` e
`ORACLE_SSH_KEY` estao corretos (Settings > Secrets and variables >
Actions) e se a chave publica correspondente ainda esta em
`~/.ssh/authorized_keys` do usuario `mplugins` no servidor.

**Deploy rodou mas o bot nao aparece online no Discord**
```bash
pm2 logs mplugins-discord-bot --lines 100
```
Procure por erros de `DISCORD_TOKEN invalido` ou falha de conexao. Confira
o `.env` do servidor.

**`scripts/healthcheck.sh` falha no PostgreSQL**
```bash
sudo systemctl status postgresql
node src/db/test-connection.js
```

**Quero forçar um redeploy sem alterar codigo**
No GitHub, aba Actions > selecione o workflow > "Run workflow" (o
`workflow_dispatch` no `deploy.yml` permite isso manualmente).

**PM2 nao inicia apos reboot da instancia**
```bash
pm2 startup systemd -u mplugins --hp /home/mplugins
pm2 save
```
(mesmo passo do fim do `ORACLE_SETUP.md`).
