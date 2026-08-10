# Configuracao do GitHub

Este guia assume que o projeto ainda NAO esta no GitHub. Siga na ordem.

## 1. Criar o repositorio no GitHub

1. Acesse https://github.com/new
2. Nome sugerido: `mplugins-discord-bot`
3. Visibilidade: **privado** (o projeto tem logica de negocio e nao precisa ser publico)
4. NAO marque "Add a README" nem ".gitignore" nem "license" — o projeto local ja tem esses arquivos
5. Clique em "Create repository" e copie a URL mostrada (SSH ou HTTPS)

## 2. Primeiro commit e push (local, Termux ou qualquer Linux)

Estes comandos ja podem ser executados pelo `build.sh` deste projeto
(`bash build.sh --github-init` e depois `bash build.sh --github-push`), mas
se preferir fazer manualmente, o fluxo e:

```bash
cd mplugins-discord-bot

git init
git branch -M main

git add .
git commit -m "Initial commit"

# Substitua pela URL copiada no passo 1 - nunca invente uma URL
git remote add origin <URL_DO_REPOSITORIO>

git push -u origin main
```

Exemplo de URL SSH: `git@github.com:SEU_USUARIO/mplugins-discord-bot.git`
Exemplo de URL HTTPS: `https://github.com/SEU_USUARIO/mplugins-discord-bot.git`

### Autenticacao

- **SSH (recomendado)**: gere uma chave com `ssh-keygen -t ed25519 -C "seu@email.com"`,
  adicione a chave publica (`~/.ssh/id_ed25519.pub`) em
  https://github.com/settings/keys, e teste com `ssh -T git@github.com`.
- **HTTPS**: o Git vai pedir usuario/senha. Use um Personal Access Token
  (Settings > Developer settings > Personal access tokens) no lugar da
  senha. Nunca salve o token em texto puro no projeto.

## 3. Confirmar que nada sensivel foi enviado

Depois do primeiro push, confira no GitHub (aba "Code") que **NAO** existe:

- `.env`
- qualquer arquivo `.pem` ou `.key`
- token do Discord, senha ou connection string em texto puro em qualquer arquivo

Se algo sensivel foi enviado por engano, troque a credencial imediatamente
(gere um novo token/senha) — remover do Git depois nao invalida uma
credencial que ja vazou.

## 4. Configurar os Secrets do repositorio

Necessarios para o GitHub Actions (`.github/workflows/deploy.yml`)
conseguir fazer deploy na Oracle Cloud. Em
`Settings > Secrets and variables > Actions > New repository secret`,
crie:

| Secret | Valor |
|---|---|
| `ORACLE_HOST` | IP publico ou hostname da instancia Oracle Cloud |
| `ORACLE_USER` | usuario Linux criado para rodar o bot (ver ORACLE_SETUP.md) |
| `ORACLE_PORT` | porta SSH (geralmente `22`) |
| `ORACLE_SSH_KEY` | chave SSH **privada** usada para acessar a instancia |

Nunca cole esses valores em nenhum arquivo do repositorio, no
`ecosystem.config.js`, no `build.sh` ou no workflow — eles existem
somente dentro do GitHub Secrets, e o Actions os injeta em tempo de
execucao.

## 5. Verificar a branch main

```bash
git branch --show-current
```

Deve mostrar `main`. O workflow (`.github/workflows/deploy.yml`) so
executa o deploy em push para `main`.

## Proximo passo

Com o codigo no GitHub e os secrets configurados, siga `ORACLE_SETUP.md`
para preparar o servidor, e depois `DEPLOY.md` para o fluxo do dia a dia.
