'use strict';

const db = require('./database');
const logger = require('./../utils/logger');

// Padroes de dados sensiveis que nunca devem ser gravados em log,
// mesmo por engano (defesa extra alem da disciplina de nao passar
// esses valores para ca).
const PADROES_SENSIVEIS = [
  /discord_token\s*[:=]\s*\S+/gi,
  /webhook[_-]?secret\s*[:=]\s*\S+/gi,
  /db[_-]?password\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /senha\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi
];

function sanitizar(mensagem) {
  let texto = String(mensagem);
  for (const padrao of PADROES_SENSIVEIS) {
    texto = texto.replace(padrao, (match) => match.split(/[:=]/)[0] + '=[REDACTED]');
  }
  return texto;
}

/**
 * Registra um evento no banco de dados (tabela logs) e, se possivel,
 * publica uma versao resumida no canal de texto "logs" da guild.
 *
 * tipo: 'setup' | 'ticket_criado' | 'ticket_fechado' | 'compra' |
 *       'gasto' | 'promocao' | 'admin' | 'sincronizacao' | 'erro'
 */
async function registrar(guild, tipo, mensagem) {
  const mensagemSegura = sanitizar(mensagem);
  const guildId = guild && guild.id ? guild.id : String(guild);

  try {
    await db.query(
      'INSERT INTO logs (guild_id, type, message) VALUES ($1, $2, $3)',
      [guildId, tipo, mensagemSegura]
    );
  } catch (err) {
    logger.error('Falha ao gravar log no banco de dados', err);
  }

  if (guild && typeof guild.channels?.cache?.find === 'function') {
    try {
      const canalLogs = guild.channels.cache.find(
        (c) => c.name === 'logs' && typeof c.isTextBased === 'function' && c.isTextBased()
      );
      if (canalLogs) {
        await canalLogs.send({ content: `[${tipo.toUpperCase()}] ${mensagemSegura}` });
      }
    } catch (err) {
      logger.warn(`Nao foi possivel publicar log no canal #logs: ${err.message}`);
    }
  }
}

module.exports = { registrar, sanitizar };
