'use strict';

const config = require('../config/constants');
const db = require('../services/database');
const logger = require('../utils/logger');

async function testarBanco() {
  logger.info('Testando conexao com o PostgreSQL...');

  const erroConfig = db.validarConfiguracaoBanco();
  if (erroConfig) {
    logger.error(erroConfig);
    process.exitCode = 1;
    return;
  }

  const resultado = await db.testConnection();

  if (!resultado.ok) {
    logger.error(`Falha ao conectar ao PostgreSQL: ${resultado.error}`);
    process.exitCode = 1;
    await db.closePool();
    return;
  }

  logger.ok('PostgreSQL conectado');
  logger.ok(`Database: ${config.database.url ? '(configurado via DATABASE_URL)' : config.database.name}`);

  await db.closePool();
}

if (require.main === module) {
  testarBanco();
}

module.exports = { testarBanco };
