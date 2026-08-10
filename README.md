# mPlugins Discord Bot

Bot Discord oficial da mPlugins. Node.js + discord.js v14 + Express + PostgreSQL.
Compatível com Android + Termux.

Este é o **PROMPT 2 de 4** do projeto. Implementado até aqui: fundação do
projeto, o sistema de `/setup` (criação automática de cargos/categorias/canais,
status e cleanup), o sistema completo de ranks por gasto acumulado, o schema
PostgreSQL completo (com migrations numeradas) e o sistema completo de tickets.

## Requisitos

- Node.js >= 18
- npm
- PostgreSQL (local ou remoto)
- Uma aplicação Discord com bot criado no [Discord Developer Portal](https://discord.com/developers/applications)

No Termux:

```bash
pkg update
pkg install nodejs postgresql git
```

## Instalação

```bash
git clone <seu-repositorio>
cd mplugins-discord-bot
bash build.sh
```

`bash build.sh` sozinho é suficiente: ele detecta o ambiente, prepara o
filesystem, instala dependências, valida a configuração, testa o banco,
roda as migrations, registra os Slash Commands, executa os checks e inicia
o bot — nessa ordem. Não é preciso rodar `npm install`, `npm run check` etc.
manualmente.

Na primeira execução, se o `.env` ainda não existir, o `build.sh` cria um a
partir de `.env.example` e para, pedindo para você preencher as credenciais
antes de continuar (ele nunca inventa `DISCORD_TOKEN`, senhas etc.). Edite o
`.env` e rode `bash build.sh` de novo:

```
DISCORD_TOKEN=seu_token
CLIENT_ID=id_da_aplicacao
GUILD_ID=id_do_servidor_de_testes

DATABASE_URL=postgresql://usuario:senha@localhost:5432/mplugins
# ou, em vez de DATABASE_URL:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mplugins
DB_USER=postgres
DB_PASSWORD=
```

### Modos do build.sh

| Comando                    | O que faz                                                        |
|-----------------------------|-------------------------------------------------------------------|
| `bash build.sh`              | Roda tudo (ambiente → deploy → checks) e **inicia o bot**.        |
| `bash build.sh --check`      | Roda as mesmas verificações, mas **não inicia o bot**.            |
| `bash build.sh --deploy`     | Só valida a config do Discord e **registra os Slash Commands**.   |
| `bash build.sh --start`      | Igual ao modo padrão: verifica tudo e inicia o bot.                |
| `bash build.sh --reinstall`  | Remove **só** `node_modules/` e reinstala (nunca toca `.env`/`data/`/`logs/`). |

É seguro rodar `bash build.sh` (em qualquer modo) quantas vezes forem
necessárias — nunca apaga `.env`, dados do banco, logs ou configurações.

### Android / Termux e armazenamento compartilhado

Se o projeto estiver em `/storage/emulated/0/...` ou `/sdcard/...` (inclusive
`~/storage/shared/...`, que no Termux é um symlink para o mesmo lugar) — onde
o `npm install` falha com `EACCES` em symlinks — o `build.sh` detecta isso
automaticamente, copia o projeto para `$HOME/mplugins/bot-dc/mplugins-discord-bot`
(sem tocar em `node_modules/`, `.env`, `data/` ou `logs/` já existentes ali)
e continua a execução a partir dessa cópia segura — o projeto original no
armazenamento compartilhado nunca é apagado ou modificado.

Não é possível rodar o `npm install` de fato dentro do armazenamento
compartilhado: é uma limitação do sistema de arquivos do Android (FUSE), que
não suporta os symlinks que pacotes como `express`/`mime` criam em
`node_modules/.bin` — é exatamente o erro `EACCES: ... symlink '../mime/cli.js'`
do Problema 1. Por isso o `npm install`, o `npm start` e tudo o mais sempre
rodam a partir da cópia no filesystem privado do Termux.

Se quiser usar outro caminho em vez do padrão, defina `MPLUGINS_SAFE_DIR`
antes de rodar o build (precisa continuar fora do armazenamento
compartilhado):

```bash
export MPLUGINS_SAFE_DIR="$HOME/outro/caminho/mplugins-discord-bot"
bash build.sh
```

## Scripts disponíveis

| Comando           | Descrição                                              |
|-------------------|----------------------------------------------------------|
| `npm start`       | Inicia o bot em modo produção                            |
| `npm run dev`     | Inicia o bot com reload automático (`node --watch`)      |
| `npm run build`   | Executa `build.sh`                                       |
| `npm run deploy`  | Registra os Slash Commands na API do Discord (guild)     |
| `npm run register`| Alias de `npm run deploy` (mantido por compatibilidade)  |
| `npm run migrate` | Aplica o schema do banco de dados (idempotente)          |
| `npm run check`   | Verificação de sanidade: `.env`, config e comandos       |

## Primeira execução

```bash
bash build.sh
npm run migrate
npm run deploy
npm start
```

## Registrando os Slash Commands

`npm run deploy` (equivalente a `node src/deploy-commands.js`) lê todos os
arquivos de `src/commands/`, valida cada um (nome, descrição, `toJSON()`,
duplicados) e registra os comandos válidos diretamente na guild definida em
`GUILD_ID` (`Routes.applicationGuildCommands`), que propaga quase
imediatamente — nesta etapa o projeto não usa comandos globais.

Requer `DISCORD_TOKEN`, `CLIENT_ID` e `GUILD_ID` preenchidos no `.env`; se
algum estiver faltando, o comando avisa exatamente qual e encerra sem tentar
registrar nada. O bot precisa ter sido convidado ao servidor com os escopos
`bot` e `applications.commands` — se o `GUILD_ID` configurado não for
encontrado entre os servidores do bot, um aviso é exibido antes do registro.

## Comandos Discord

- `/setup executar` — cria automaticamente cargos, categorias e canais da mPlugins (admin).
- `/setup status` — mostra status do bot, banco de dados e da estrutura da guild.
- `/setup cleanup` — remove (com confirmação) tudo que o `/setup` criou (admin).
- `/setup manager-role @cargo` — define o cargo com controle total do bot (Bot Manager).
- `/setup help` — explica os subcomandos do `/setup`.
- `/rank [membro]` — mostra cargo atual, total gasto, próximo cargo e valor restante.
- `/ranking` — mostra os 10 maiores compradores.
- `/addspent @usuario valor` — adiciona valor gasto e promove automaticamente (admin).
- `/removespent @usuario valor` — remove valor gasto e rebaixa automaticamente se necessário (admin).
- `/setrank @usuario rank` — define manualmente o rank de um membro, sem alterar o total gasto (admin).
- `/syncroles` — corrige qualquer divergência entre o banco de dados e os cargos reais no Discord (admin).
- `/tickets` — abre um ticket de suporte (mesma lógica do botão "Abrir Ticket" do painel em `#tickets`).
- `/mod warn @membro motivo` — aplica uma advertência (moderador+).
- `/mod unwarn caso motivo` — remove uma advertência específica pelo número do caso (moderador+).
- `/mod warnings @membro` — lista as advertências ativas de um membro (moderador+).
- `/mod mute @membro minutos motivo` — silencia via timeout nativo do Discord, até 28 dias (moderador+).
- `/mod unmute @membro motivo` — remove o silenciamento (moderador+).
- `/mod kick @membro motivo` — expulsa um membro (moderador+).
- `/mod ban @usuario motivo [dias_mensagens]` — bane um usuário (admin+).
- `/mod unban usuario_id motivo` — remove um banimento pelo ID do Discord (admin+).
- `/mod history @membro` — mostra o histórico completo de punições de um membro (moderador+).
- `/stats` — estrutura criada, funcionalidade completa chegará em uma fase futura do projeto.

### Sistema de permissões

Hierarquia central (`src/services/permissionService.js`), usada por todos os
comandos administrativos e de moderação, do nível mais alto para o mais
baixo:

`OWNER` > `BOT_MANAGER` > `ADMIN` > `MODERATOR` > `SUPPORT` > `HELPER` > `USER`

- **OWNER**: definido por `OWNER_ID` no `.env`, ou o dono do próprio
  servidor no Discord — sempre tem acesso total, mesmo sem nenhum cargo
  configurado (garante que o servidor nunca fique sem ninguém capaz de
  configurar o bot).
- **BOT_MANAGER**: cargo definido via `/setup manager-role`. Controle total
  do bot neste servidor.
- **ADMIN**: permissão nativa `Administrator` do Discord, ou cargo chamado
  `Administrador`.
- **MODERATOR**: cargo chamado `Moderador`.
- **SUPPORT**: cargo chamado `Suporte`.

Um executor nunca pode moderar (`/mod`) alguém com nível igual ou superior
ao seu, nem a si mesmo, nem o próprio bot.

### Sistema de moderação

Todas as ações de `/mod` (warn/mute/kick/ban e suas reversões) são
gravadas na tabela `punishments`, com usuário, moderador, motivo, data,
duração (quando aplicável) e status (`ativo`/`revogado`). `/mod history`
mostra o histórico completo de um membro; `/mod warnings` mostra só as
advertências ativas.

O silenciamento (`mute`/`unmute`) usa o **timeout nativo do Discord**
(`member.timeout()`), em vez de um cargo "Muted" — evita ter que
sincronizar permissões em todo canal existente e futuro, e é o mecanismo
atualmente recomendado pelo próprio Discord.

### Sistema de ranks

Cargo é definido pelo total acumulado (o usuário sempre possui **apenas o
maior** cargo de recompensa correspondente ao seu total; nenhum cargo
administrativo é tocado):

| Cargo              | Valor mínimo |
|---------------------|--------------|
| Pintinho             | R$ 0         |
| Galinha              | R$ 25        |
| Galo                 | R$ 75        |
| Frango               | R$ 150       |
| Galinha Dourada      | R$ 300       |
| Galo de Ouro         | R$ 600       |
| Rei do Galinheiro    | R$ 1000      |

Ao subir de rank, o bot remove o cargo anterior, adiciona o novo, registra
histórico em `rank_history`, grava um log e envia uma mensagem de promoção no
canal configurado via `settings` (chave `canal_promocao`) ou no canal
`#anuncios`, se existir.

### Sistema de tickets

O painel com o botão **Abrir Ticket** é publicado automaticamente no canal
`#tickets` (criado pelo `/setup executar`), sem duplicar a mensagem em
reinícios do bot. Ao abrir um ticket:

- é criado um canal privado na categoria `SUPORTE`;
- o registro é salvo no PostgreSQL (impede um segundo ticket aberto do mesmo usuário);
- acesso é liberado para o autor e para cargos chamados `Suporte`, `Moderador`
  ou `Administrador` (se existirem na guild) — administradores reais sempre
  têm acesso, independentemente de overwrites, por causa da permissão
  `Administrator` do Discord;
- `@everyone` não vê o canal.

O botão **Fechar Ticket**, dentro do próprio ticket, pede confirmação, só
pode ser usado pelo autor ou pela staff, registra o fechamento no banco e em
log, e exclui o canal após a confirmação.

### Logs

Todo evento relevante (`setup`, `ticket_criado`, `ticket_fechado`, `gasto`,
`promocao`, `admin`, `sincronizacao`, `erro`) é gravado na tabela `logs` e,
quando existe um canal chamado `logs` na guild, também é publicado lá. Um
sanitizador remove qualquer trecho que se pareça com token, senha ou
webhook secret antes de gravar — mas por princípio, nenhum desses valores é
passado para o log em primeiro lugar.

> Nota técnica: a API de Slash Commands do Discord não permite que um comando
> tenha subcomandos (`/setup status`, `/setup cleanup`...) e, ao mesmo tempo,
> seja executável "puro" sem subcomando. Por isso a ação de criação automática
> ficou em `/setup executar`, em vez de `/setup` sozinho.

## Estrutura do projeto

```
mplugins-discord-bot/
├── build.sh
├── package.json
├── .env.example
├── src/
│   ├── index.js              # ponto de entrada
│   ├── bot/                  # client, loaders, registro de comandos
│   ├── commands/              # um arquivo por Slash Command
│   ├── events/                 # eventos do client Discord (inclui botões)
│   ├── services/                # banco, setup, ranks, tickets, logs, settings
│   ├── config/                    # constantes, cargos, canais, valores de rank
│   ├── utils/                      # logger, permissões, helpers
│   └── db/
│       ├── migrate.js               # executa migrations/*.sql em ordem
│       └── migrations/
│           ├── 001_initial_schema.sql
│           └── 002_ranks_tickets_system.sql
```

## Migrations

`npm run migrate` executa, em ordem e dentro de transações, todos os
arquivos `.sql` de `src/db/migrations/` que ainda não constam na tabela de
controle `schema_migrations`. É seguro rodar quantas vezes for necessário —
migrations já aplicadas são puladas, e nenhuma migration apaga dados
existentes (a `002` inclusive renomeia `setup_registry` para `setup_objects`
preservando os registros, em vez de recriar a tabela do zero).

## Rodando 24/7 (Oracle Cloud + PM2 + GitHub Actions)

Para colocar o bot no ar 24 horas por dia, de graça, na Oracle Cloud Free
Tier, com deploy automatico a cada `git push`, siga nesta ordem:

1. **`GITHUB_SETUP.md`** — criar o repositorio e enviar o codigo pela
   primeira vez (o projeto ainda nao esta no GitHub).
2. **`ORACLE_SETUP.md`** — preparar a instancia (Ubuntu ARM64): Node.js,
   PM2, PostgreSQL, usuario dedicado (o bot nunca roda como root).
3. **`DEPLOY.md`** — o fluxo do dia a dia (`git push` -> testes ->
   deploy -> health check -> rollback automatico se algo falhar) e os
   scripts em `scripts/` (`start.sh`, `stop.sh`, `restart.sh`,
   `healthcheck.sh`, `deploy.sh`, `rollback.sh`).

O processo roda com `ecosystem.config.js` (PM2), sempre em instancia
unica (nunca cluster — um bot Discord rodando duplicado processaria cada
comando duas vezes).

## GitHub

O `build.sh` tambem versiona e publica o projeto no GitHub, sempre com
confirmacao explicita antes de qualquer push. Nenhum desses modos executa
`npm install`, migrations ou reinicia o bot.

```bash
bash build.sh --github-init      # prepara o repositorio local e o remote (uma vez)
bash build.sh --github-push      # verifica seguranca, mostra o que sera enviado, pede "YES" e envia
bash build.sh --github           # alias de --github-push
bash build.sh --github-status    # mostra branch, remote, alteracoes e checa arquivos sensiveis
bash build.sh --github-pull      # git pull --rebase origin main (recusa se houver alteracoes locais)
bash build.sh --github-help      # ajuda dos modos GitHub
```

Antes de qualquer `git add`/`git push`, o script bloqueia o envio se
detectar `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa` entre os arquivos, ou
padroes de secret (`DISCORD_TOKEN=`, `DATABASE_URL=`, `DB_PASSWORD=`, etc.)
com valor literal no conteudo dos arquivos staged. `.env.example` e a
documentacao continuam sendo enviados normalmente. Nunca e feito push sem
digitar `YES` na confirmacao, e nenhum token do GitHub e salvo no `build.sh`,
no `.env` ou no `package.json` — a autenticacao deve ser feita por SSH ou
pelo Git Credential Manager.

## O que NÃO está implementado ainda

Reservado para as próximas etapas do projeto:

- Painel completo (mAPI/mPanel)
- Sistema completo de compras
- Webhook da loja
- Integração com Cloudflare
- Integração com Mercado Pago
