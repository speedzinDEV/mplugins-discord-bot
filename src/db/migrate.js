'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../services/database');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function garantirTabelaControle() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        id          SERIAL PRIMARY KEY,
        nome        VARCHAR(128) NOT NULL UNIQUE,
        aplicada_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

async function jaAplicada(nome) {
  const result = await db.query('SELECT 1 FROM schema_migrations WHERE nome = $1', [nome]);
  return result.rowCount > 0;
}

async function marcarAplicada(nome) {
  await db.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [nome]);
}

async function migrate() {
  logger.info('Iniciando migrations do banco de dados...');

  const erroConfig = db.validarConfiguracaoBanco();
  if (erroConfig) {
    logger.error(erroConfig);
    process.exitCode = 1;
    return;
  }

  const check = await db.testConnection();
  if (!check.ok) {
    logger.error(`Nao foi possivel conectar ao banco: ${check.error}`);
    process.exitCode = 1;
    return;
  }

  const arquivos = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (arquivos.length === 0) {
    logger.warn('Nenhum arquivo de migration encontrado em src/db/migrations.');
    await db.closePool();
    return;
  }

  try {
    await garantirTabelaControle();

    let aplicadasAgora = 0;

    for (const arquivo of arquivos) {
      const jaFoi = await jaAplicada(arquivo);
      if (jaFoi) {
        logger.info(`Migration ja aplicada, pulando: ${arquivo}`);
        continue;
      }

      const caminho = path.join(MIGRATIONS_DIR, arquivo);
      const sql = fs.readFileSync(caminho, 'utf8');

      const client = await db.getPool().connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        logger.ok(`Migration aplicada: ${arquivo}`);
        aplicadasAgora += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${arquivo}: ${err.message}`);
      } finally {
        client.release();
      }
    }

    if (aplicadasAgora === 0) {
      logger.ok('Banco de dados ja estava atualizado. Nenhuma migration nova aplicada.');
    } else {
      logger.ok(`${aplicadasAgora} migration(s) aplicada(s) com sucesso.`);
    }
  } catch (err) {
    logger.error('Falha ao executar migrations', err);
    process.exitCode = 1;
  } finally {
    await db.closePool();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
