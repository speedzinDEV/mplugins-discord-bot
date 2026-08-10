# Configuracao da Oracle Cloud (Free Tier, Ubuntu ARM64)

Guia de preparacao **unica** do servidor. Depois disso, os deploys do dia
a dia sao so `git push` (ver `DEPLOY.md`).

Este guia assume uma instancia **Ampere (ARM64)** do Oracle Cloud Free
Tier rodando Ubuntu. Nao assuma x86 — os pacotes instalados abaixo
detectam a arquitetura automaticamente, mas fique atento se copiar
comandos de outros tutoriais que assumem `amd64`.

## 1. Criar a instancia

No console da Oracle Cloud:

1. Compute > Instances > Create Instance
2. Shape: `VM.Standard.A1.Flex` (Ampere / ARM64, parte do Always Free)
3. Imagem: Ubuntu (22.04 ou mais recente)
4. Adicione sua chave SSH publica na criacao (ou gere uma nova)
5. Anote o IP publico da instancia

## 2. Primeiro acesso

```bash
ssh -i /caminho/para/sua_chave ubuntu@<IP_DA_INSTANCIA>
```

## 3. Atualizar o sistema e instalar dependencias basicas

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

## 4. Instalar Node.js (versao compativel, ver `package.json` -> `engines.node >= 18`)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 5. Instalar PM2 globalmente

```bash
sudo npm install -g pm2
pm2 -v
```

## 6. Instalar e configurar o PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

sudo -u postgres psql -c "CREATE USER mplugins WITH PASSWORD 'DEFINA_UMA_SENHA_FORTE_AQUI';"
sudo -u postgres psql -c "CREATE DATABASE mplugins_discord_bot OWNER mplugins;"
```

Guarde a senha escolhida — ela vai para o `.env` do servidor (nunca para
o Git).

## 7. Criar um usuario dedicado para rodar o bot (nunca como root)

```bash
sudo adduser --disabled-password --gecos "" mplugins
sudo usermod -aG sudo mplugins   # opcional, só se essa conta tambem for administrar o servidor
```

A partir daqui, todos os comandos abaixo rodam como o usuario `mplugins`,
nao como `root` nem `ubuntu`:

```bash
sudo su - mplugins
```

## 8. Configurar acesso SSH para o GitHub Actions

O GitHub Actions precisa de uma chave SSH **dedicada** para se conectar
como o usuario `mplugins` (nao reutilize sua chave pessoal).

Ainda como o usuario `mplugins`:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N ""
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_actions_deploy   # copie esta chave PRIVADA
```

A chave privada exibida no ultimo comando vai para o secret
`ORACLE_SSH_KEY` no GitHub (ver `GITHUB_SETUP.md`). Depois de copiada,
considere remover a saida do seu terminal/historico.

## 9. Diretorio do projeto

```bash
sudo mkdir -p /opt/mplugins-platform
sudo chown mplugins:mplugins /opt/mplugins-platform
cd /opt/mplugins-platform

git clone <URL_DO_REPOSITORIO_GITHUB> mplugins-discord-bot
cd mplugins-discord-bot
```

Use a URL HTTPS do repositorio se a chave SSH pessoal do usuario
`mplugins` nao estiver configurada para leitura do repo; ou configure
`Deploy Keys` (somente leitura) no GitHub para esse fim.

## 10. Configurar o `.env` de producao

```bash
cp .env.example .env
nano .env
```

Preencha `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `OWNER_ID`,
`DATABASE_URL` (ou `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`), e
`NODE_ENV=production`. Este arquivo nunca vai para o Git (protegido pelo
`.gitignore`).

## 11. Primeira instalacao e teste manual

```bash
npm ci
npm run migrate
npm run check
npm run register
```

Se tudo passar, teste manualmente antes de deixar o PM2 gerenciar:

```bash
node src/index.js
```

Confirme no log que aparece `Bot inicializado.` e que o bot fica online
no Discord. Pare com `Ctrl+C` (o handler de `SIGINT` do projeto encerra
graciosamente).

## 12. Iniciar via PM2 e configurar o startup automatico

```bash
bash scripts/start.sh
pm2 startup systemd -u mplugins --hp /home/mplugins
```

O comando `pm2 startup` imprime um comando `sudo ...` — copie e execute
exatamente o que ele mostrar (precisa de um usuario com sudo, use a conta
`ubuntu` ou outra com privilegio para rodar esse único comando; o
processo do bot em si continua rodando como `mplugins`).

```bash
pm2 save
```

Isso garante que, se a instancia reiniciar, o PM2 (e o bot) sobem
automaticamente.

## 13. Verificar

```bash
bash scripts/healthcheck.sh
pm2 status
pm2 logs mplugins-discord-bot --lines 50
```

## Checklist desta etapa

```
[ ] Instancia Oracle Cloud (ARM64) criada
[ ] Node.js instalado (>=18)
[ ] PM2 instalado globalmente
[ ] PostgreSQL instalado e banco criado
[ ] Usuario dedicado "mplugins" criado (bot nao roda como root)
[ ] Chave SSH dedicada para o GitHub Actions gerada e autorizada
[ ] Repositorio clonado em /opt/mplugins-platform/mplugins-discord-bot
[ ] .env preenchido no servidor (nunca no Git)
[ ] npm ci + migrate + check rodaram sem erro
[ ] Bot testado manualmente (node src/index.js) antes do PM2
[ ] PM2 gerenciando o processo (scripts/start.sh)
[ ] pm2 startup + pm2 save configurados (sobrevive a reboot)
[ ] scripts/healthcheck.sh passando
```

Com isso feito, siga para `DEPLOY.md` para configurar o `GITHUB_SETUP.md`
(se ainda nao fez) e entender o fluxo de deploy do dia a dia.
