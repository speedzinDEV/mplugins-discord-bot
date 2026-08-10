'use strict';

const db = require('./database');

/**
 * Registra um objeto (cargo, categoria ou canal) criado pelo /setup.
 * Armazenado na tabela setup_objects (schema oficial definido na Fase 5).
 */
async function registrar(guildId, tipo, nome, objectId) {
  await db.query(
    `INSERT INTO setup_objects (guild_id, object_type, object_name, object_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, object_type, object_id) DO NOTHING`,
    [guildId, tipo, nome, objectId]
  );
}

/**
 * Retorna todos os registros de uma guild, opcionalmente filtrando por tipo.
 * Os aliases abaixo (nome/criado_em) mantem compatibilidade com o restante
 * do codigo (ex.: setupService.js) sem precisar alterar quem ja consome isto.
 */
async function listar(guildId, tipo) {
  if (tipo) {
    const result = await db.query(
      `SELECT *, object_name AS nome, created_at AS criado_em
       FROM setup_objects
       WHERE guild_id = $1 AND object_type = $2
       ORDER BY created_at ASC`,
      [guildId, tipo]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT *, object_name AS nome, created_at AS criado_em
     FROM setup_objects
     WHERE guild_id = $1
     ORDER BY created_at ASC`,
    [guildId]
  );
  return result.rows;
}

/**
 * Verifica se um nome ja foi registrado para aquele tipo, nesta guild.
 */
async function existePorNome(guildId, tipo, nome) {
  const result = await db.query(
    `SELECT *, object_name AS nome, created_at AS criado_em
     FROM setup_objects
     WHERE guild_id = $1 AND object_type = $2 AND object_name = $3
     LIMIT 1`,
    [guildId, tipo, nome]
  );
  return result.rows[0] || null;
}

/**
 * Remove um registro pelo object_id (usado apos deletar no Discord).
 */
async function remover(guildId, tipo, objectId) {
  await db.query(
    'DELETE FROM setup_objects WHERE guild_id = $1 AND object_type = $2 AND object_id = $3',
    [guildId, tipo, objectId]
  );
}

module.exports = { registrar, listar, existePorNome, remover };
