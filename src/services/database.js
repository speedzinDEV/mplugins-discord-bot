'use strict';

const { Pool } = require('pg');
const config = require('../config/constants');
const logger = require('../utils/logger');

let pool = null;

/**
 * Valida a configuracao do banco ANTES de criar qualquer Pool.
 * Retorna null se estiver tudo certo, ou uma mensagem de erro pronta
 * para ser exibida (nunca contem senha ou a DATABASE_URL completa).
 */
function validarConfiguracaoBanco() {
  if (config.database.url) {
    let parsed;
    try {
      parsed = new URL(config.database.url);
    } catch (err) {
      return '[ERRO] DATABASE_URL invalida (nao foi possivel interpretar a URL).';
    }

    if (!parsed.protocol.startsWith('postgres')) {
      return '[ERRO] DATABASE_URL invalida: o protocolo deve ser postgresql:// ou postgres://.';
    }
    if (!parsed.hostname) {
      return '[ERRO] DATABASE_URL invalida: host ausente.';
    }
    if (!parsed.username) {
      return '[ERRO] DATABASE_URL invalida: usuario ausente.';
    }
    return null;
  }

  if (!config.database.host) return '[ERRO] DB_HOST nao configurado.';
  if (!config.database.port) return '[ERRO] DB_PORT nao configurado.';
  if (!config.database.name) return '[ERRO] DB_NAME nao configurado.';
  if (!config.database.user) return '[ERRO] DB_USER nao configurado.';

  return null;
}

/**
 * Cria (uma unica vez) e retorna o Pool do PostgreSQL.
 * NUNCA cria um Pool sem usuario definido: se a configuracao estiver
 * incompleta, lanca um erro com a mensagem exata de qual variavel falta,
 * em vez de deixar o driver falhar la na frente com um erro generico.
 */
function getPool() {
  if (pool) return pool;

  const erro = validarConfiguracaoBanco();
  if (erro) {
    throw new Error(erro);
  }

  const poolConfig = config.database.url
    ? { connectionString: config.database.url }
    : {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password
      };

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    logger.error('Erro inesperado no pool do PostgreSQL', err);
  });

  return pool;
}

async function query(text, params) {
  const client = getPool();
  return client.query(text, params);
}

async function testConnection() {
  try {
    await query('SELECT NOW()');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, testConnection, closePool, validarConfiguracaoBanco };
