'use strict';

const config = require('./config/constants');
const logger = require('./utils/logger');
const { createClient } = require('./bot/client');
const { loadEvents } = require('./bot/loadEvents');

async function main() {
  if (!config.discord.token) {
    logger.error('DISCORD_TOKEN nao definido. Configure o arquivo .env antes de iniciar o bot.');
    process.exit(1);
  }

  const client = createClient();
  loadEvents(client);

  let encerrando = false;
  async function encerrarGraciosamente(sinal) {
    if (encerrando) return;
    encerrando = true;
    logger.info(`Sinal ${sinal} recebido. Encerrando graciosamente...`);
    try {
      client.destroy();
      logger.info('Conexao com o Discord encerrada. Ate logo.');
    } catch (err) {
      logger.error('Erro ao encerrar a conexao com o Discord', err);
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGTERM', () => encerrarGraciosamente('SIGTERM'));
  process.on('SIGINT', () => encerrarGraciosamente('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error('Promise rejeitada sem tratamento', err);
  });

  // Uma excecao nao tratada deixa o processo em estado potencialmente
  // inconsistente (ex.: listener quebrado, timer travado). Em vez de so
  // logar e seguir rodando "quebrado" indefinidamente, o processo
  // encerra para que o PM2 (ecosystem.config.js, autorestart: true)
  // reinicie o bot em um estado limpo. Sem isso, o bot pode ficar "vivo"
  // mas nao funcional, sem que o PM2/healthcheck percebam.
  process.on('uncaughtException', (err) => {
    logger.error('Excecao nao tratada. Encerrando para reinicio limpo via PM2.', err);
    process.exit(1);
  });

  await client.login(config.discord.token);
  logger.info('Bot inicializado.');
}

main();
