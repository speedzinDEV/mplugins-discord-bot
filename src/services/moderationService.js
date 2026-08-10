'use strict';

const db = require('./database');
const logService = require('./logService');
const logger = require('../utils/logger');

const TIPOS_VALIDOS = ['warn', 'mute', 'kick', 'ban'];

/**
 * Envia uma DM ao usuario em melhor esforco. Nunca lanca excecao: DMs
 * fechadas ou bloqueios sao comuns e nao podem derrubar a acao de
 * moderacao em si.
 */
async function notificarUsuario(user, texto) {
  if (!user) return false;
  try {
    await user.send(texto);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Registra uma punicao no banco. Todas as acoes de moderacao passam por
 * aqui, garantindo o mesmo formato de registro (usuario, moderador,
 * motivo, data, duracao, tipo, status) pedido na fase de refinamento.
 */
async function registrarPunicao({ guildId, discordId, moderatorId, type, reason, durationSeconds = null, expiresAt = null }) {
  if (!TIPOS_VALIDOS.includes(type)) {
    throw new Error(`Tipo de punicao invalido: ${type}`);
  }

  const result = await db.query(
    `INSERT INTO punishments (guild_id, discord_id, moderator_id, type, reason, duration_seconds, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [guildId, discordId, moderatorId, type, reason, durationSeconds, expiresAt]
  );

  return result.rows[0];
}

/**
 * Revoga a punicao ATIVA mais recente de um tipo especifico para um
 * usuario (usado por unmute/unban, onde so existe uma ativa por vez).
 * Retorna a linha revogada, ou null se nao havia nenhuma ativa.
 */
async function revogarPunicaoAtiva(guildId, discordId, type, revokedBy, revokedReason) {
  const result = await db.query(
    `UPDATE punishments
     SET status = 'revogado', revoked_at = NOW(), revoked_by = $4, revoked_reason = $5
     WHERE id = (
       SELECT id FROM punishments
       WHERE guild_id = $1 AND discord_id = $2 AND type = $3 AND status = 'ativo'
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING *`,
    [guildId, discordId, type, revokedBy, revokedReason]
  );

  return result.rows[0] || null;
}

/**
 * Revoga uma punicao especifica por ID de caso (usado por /mod unwarn,
 * ja que um usuario pode ter varios warns ativos ao mesmo tempo, entao
 * "o mais recente" nao basta).
 */
async function revogarPunicaoPorId(guildId, caseId, tipoEsperado, revokedBy, revokedReason) {
  const result = await db.query(
    `UPDATE punishments
     SET status = 'revogado', revoked_at = NOW(), revoked_by = $5, revoked_reason = $6
     WHERE id = $1 AND guild_id = $2 AND type = $3 AND status = 'ativo'
     RETURNING *`,
    [caseId, guildId, tipoEsperado, revokedBy, revokedReason]
  );

  return result.rows[0] || null;
}

async function listarWarningsAtivos(guildId, discordId) {
  const result = await db.query(
    `SELECT * FROM punishments
     WHERE guild_id = $1 AND discord_id = $2 AND type = 'warn' AND status = 'ativo'
     ORDER BY created_at DESC`,
    [guildId, discordId]
  );
  return result.rows;
}

async function listarHistorico(guildId, discordId, limit = 10) {
  const result = await db.query(
    `SELECT * FROM punishments
     WHERE guild_id = $1 AND discord_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [guildId, discordId, limit]
  );
  return result.rows;
}

async function contarHistorico(guildId, discordId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS total FROM punishments WHERE guild_id = $1 AND discord_id = $2`,
    [guildId, discordId]
  );
  return result.rows[0].total;
}

// ---------------------------------------------------------------------
// Acoes completas: banco + Discord + log, na mesma funcao, para que o
// comando nunca precise decidir a ordem das chamadas (evita, por
// exemplo, aplicar a punicao no Discord mas esquecer de registrar).
// ---------------------------------------------------------------------

async function aplicarWarn(guild, targetUser, moderatorId, reason) {
  const punicao = await registrarPunicao({
    guildId: guild.id,
    discordId: targetUser.id,
    moderatorId,
    type: 'warn',
    reason
  });

  await notificarUsuario(targetUser, `Voce recebeu uma advertencia em ${guild.name}.\nMotivo: ${reason}`);

  await logService.registrar(
    guild,
    'warn',
    `${moderatorId} advertiu ${targetUser.id}. Caso #${punicao.id}. Motivo: ${reason}`
  );

  return punicao;
}

async function removerWarn(guild, caseId, moderatorId, reason) {
  const punicao = await revogarPunicaoPorId(guild.id, caseId, 'warn', moderatorId, reason);

  if (!punicao) {
    return null;
  }

  await logService.registrar(
    guild,
    'unwarn',
    `${moderatorId} removeu a advertencia #${caseId} de ${punicao.discord_id}. Motivo: ${reason}`
  );

  return punicao;
}

/**
 * Mute via timeout nativo do Discord (member.timeout), nao via cargo
 * "Muted". Decisao deliberada: um cargo de mute exigiria sincronizar
 * overwrites em todo canal (existente e futuro), o que e uma superficie
 * de bugs maior sem beneficio real sobre o timeout nativo, que e o
 * mecanismo padrao atual reconhecido pelo proprio Discord. Isso tambem
 * cobre o "timeout" pedido separadamente na especificacao: e a mesma
 * funcionalidade, entao nao ha um /mod timeout redundante.
 */
async function aplicarMute(guild, member, moderatorId, reason, durationMinutes) {
  const durationMs = durationMinutes * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  await member.timeout(durationMs, reason);

  const punicao = await registrarPunicao({
    guildId: guild.id,
    discordId: member.id,
    moderatorId,
    type: 'mute',
    reason,
    durationSeconds: durationMinutes * 60,
    expiresAt
  });

  await notificarUsuario(
    member.user,
    `Voce foi silenciado em ${guild.name} por ${durationMinutes} minuto(s).\nMotivo: ${reason}`
  );

  await logService.registrar(
    guild,
    'mute',
    `${moderatorId} silenciou ${member.id} por ${durationMinutes} minuto(s). Caso #${punicao.id}. Motivo: ${reason}`
  );

  return punicao;
}

async function removerMute(guild, member, moderatorId, reason) {
  await member.timeout(null, reason);

  const punicao = await revogarPunicaoAtiva(guild.id, member.id, 'mute', moderatorId, reason);

  await logService.registrar(
    guild,
    'unmute',
    `${moderatorId} removeu o silenciamento de ${member.id}. Motivo: ${reason}`
  );

  return punicao;
}

async function executarKick(guild, member, moderatorId, reason) {
  await notificarUsuario(member.user, `Voce foi expulso de ${guild.name}.\nMotivo: ${reason}`);

  await member.kick(reason);

  const punicao = await registrarPunicao({
    guildId: guild.id,
    discordId: member.id,
    moderatorId,
    type: 'kick',
    reason
  });

  await logService.registrar(
    guild,
    'kick',
    `${moderatorId} expulsou ${member.id}. Caso #${punicao.id}. Motivo: ${reason}`
  );

  return punicao;
}

async function executarBan(guild, targetUser, moderatorId, reason, deleteMessageSeconds = 0) {
  // A DM precisa ser tentada ANTES do ban: depois de banido, o bot
  // normalmente nao compartilha mais nenhum servidor com o usuario para
  // enviar mensagem direta.
  await notificarUsuario(targetUser, `Voce foi banido de ${guild.name}.\nMotivo: ${reason}`);

  await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds });

  const punicao = await registrarPunicao({
    guildId: guild.id,
    discordId: targetUser.id,
    moderatorId,
    type: 'ban',
    reason
  });

  await logService.registrar(
    guild,
    'ban',
    `${moderatorId} baniu ${targetUser.id}. Caso #${punicao.id}. Motivo: ${reason}`
  );

  return punicao;
}

async function executarUnban(guild, discordId, moderatorId, reason) {
  await guild.members.unban(discordId, reason);

  const punicao = await revogarPunicaoAtiva(guild.id, discordId, 'ban', moderatorId, reason);

  await logService.registrar(
    guild,
    'unban',
    `${moderatorId} desbaniu ${discordId}. Motivo: ${reason}`
  );

  return punicao;
}

module.exports = {
  TIPOS_VALIDOS,
  registrarPunicao,
  revogarPunicaoAtiva,
  revogarPunicaoPorId,
  listarWarningsAtivos,
  listarHistorico,
  contarHistorico,
  aplicarWarn,
  removerWarn,
  aplicarMute,
  removerMute,
  executarKick,
  executarBan,
  executarUnban,
  notificarUsuario
};
