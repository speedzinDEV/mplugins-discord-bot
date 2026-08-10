'use strict';

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config/constants');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');

/**
 * Hierarquia de permissao do bot. Quanto maior o numero, mais privilegios.
 * Isso e usado como fonte unica de verdade em todo o projeto: nenhum
 * outro arquivo deve comparar cargos por conta propria (ver secao 2 da
 * fase de refinamento).
 */
const LEVELS = Object.freeze({
  USER: 0,
  HELPER: 1,
  SUPPORT: 2,
  MODERATOR: 3,
  ADMIN: 4,
  BOT_MANAGER: 5,
  OWNER: 6
});

const LEVEL_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(LEVELS).map(([nome, valor]) => [valor, nome]))
);

// Chave em settings (por guild) -> nivel que aquele cargo concede.
// bot_manager_role_id e as demais sao configuradas via /setup manager-role
// (bot manager) e, no futuro, /setup permissions para as demais.
const CHAVES_CARGO_POR_NIVEL = [
  { chave: 'bot_manager_role_id', nivel: LEVELS.BOT_MANAGER },
  { chave: 'admin_role_id', nivel: LEVELS.ADMIN },
  { chave: 'moderator_role_id', nivel: LEVELS.MODERATOR },
  { chave: 'support_role_id', nivel: LEVELS.SUPPORT },
  { chave: 'helper_role_id', nivel: LEVELS.HELPER }
];

// Nomes de cargo usados como fallback quando nao ha configuracao explicita
// via settings (compatibilidade com o que ja existia em ticketService).
const NOMES_CARGO_FALLBACK = [
  { nome: 'Administrador', nivel: LEVELS.ADMIN },
  { nome: 'Moderador', nivel: LEVELS.MODERATOR },
  { nome: 'Suporte', nivel: LEVELS.SUPPORT }
];

/**
 * E o dono do bot (OWNER_ID no .env)? Sempre tem acesso total, mesmo sem
 * nenhum cargo configurado no servidor. Nao depende de banco de dados.
 */
function isOwnerId(userId) {
  return Boolean(config.discord.ownerId) && userId === config.discord.ownerId;
}

/**
 * E o dono DESTE servidor no Discord? Tratado como OWNER tambem, para que
 * o servidor nunca fique sem ninguem capaz de configurar o bot (secao 3
 * da fase de refinamento: "nao deixar o servidor sem possibilidade de
 * configuracao").
 */
function isGuildOwner(guild, userId) {
  return Boolean(guild) && guild.ownerId === userId;
}

/**
 * Determina o nivel de permissao mais alto que um member possui neste
 * guild. Nunca lanca excecao: se settings/banco falhar, degrada para o
 * que for calculavel so a partir de permissoes nativas do Discord.
 */
async function getMemberLevel(guild, member) {
  if (!member) return LEVELS.USER;

  if (isOwnerId(member.id) || isGuildOwner(guild, member.id)) {
    return LEVELS.OWNER;
  }

  let nivelMaximo = LEVELS.USER;

  // Administrator nativo do Discord sempre conta como ADMIN, independente
  // de qualquer configuracao (garante acesso mesmo em servidor novo).
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) {
    nivelMaximo = Math.max(nivelMaximo, LEVELS.ADMIN);
  }

  for (const { nome, nivel } of NOMES_CARGO_FALLBACK) {
    if (nivel <= nivelMaximo) continue;
    const role = guild.roles.cache.find((r) => r.name === nome);
    if (role && member.roles.cache.has(role.id)) {
      nivelMaximo = Math.max(nivelMaximo, nivel);
    }
  }

  for (const { chave, nivel } of CHAVES_CARGO_POR_NIVEL) {
    if (nivel <= nivelMaximo) continue;

    let roleId;
    try {
      roleId = await settingsService.get(chave, null);
    } catch (err) {
      logger.warn(`Falha ao ler configuracao de permissao "${chave}": ${err.message}`);
      continue;
    }

    if (!roleId) continue;

    const roleExiste = guild.roles.cache.has(roleId);
    if (!roleExiste) {
      // Cargo configurado mas apagado do servidor: nao concede o nivel,
      // e fica registrado no log/estado para o /setup status alertar.
      continue;
    }

    if (member.roles.cache.has(roleId)) {
      nivelMaximo = Math.max(nivelMaximo, nivel);
    }
  }

  return nivelMaximo;
}

/**
 * Verifica se o cargo de Bot Manager configurado ainda existe no servidor.
 * Usado pelo /setup status para alertar caso tenha sido apagado, sem
 * nunca deixar o servidor sem alternativa (OWNER_ID e o dono do servidor
 * sempre continuam com acesso).
 */
async function verificarBotManagerRole(guild) {
  const roleId = await settingsService.get('bot_manager_role_id', null);
  if (!roleId) {
    return { configurado: false, existe: false };
  }
  const existe = guild.roles.cache.has(roleId);
  return { configurado: true, existe, roleId };
}

async function isOwner(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.OWNER;
}

async function hasBotManager(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.BOT_MANAGER;
}

async function isAdmin(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.ADMIN;
}

async function isModerator(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.MODERATOR;
}

async function isSupport(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.SUPPORT;
}

async function isHelper(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.HELPER;
}

// Funcoes de dominio reutilizaveis, para nao espalhar "que nivel precisa
// pra fazer X" pelo projeto inteiro.
async function canManageTickets(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.SUPPORT;
}

async function canManageChannels(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.ADMIN;
}

async function canManageRoles(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.ADMIN;
}

async function canManageSetup(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.BOT_MANAGER;
}

// Somente OWNER, BOT_MANAGER ou ADMIN podem alterar gastos manualmente
// (secao 16 da fase de refinamento: usuarios comuns nunca podem).
async function canManageSpent(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.ADMIN;
}

// Acoes de moderacao "reversiveis"/menos severas (warn, mute, kick):
// MODERATOR ou superior.
async function canModerate(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.MODERATOR;
}

// Ban/unban sao mais severos que kick/mute (efeito mais dificil de
// reverter na pratica), por isso exigem ADMIN ou superior, seguindo a
// mesma separacao que o Discord ja faz nativamente entre Kick e Ban.
async function canBan(guild, member) {
  return (await getMemberLevel(guild, member)) >= LEVELS.ADMIN;
}

/**
 * Helper de interacao: verifica o nivel minimo exigido e, se o executor
 * nao tiver, responde de forma ephemeral e retorna false. Centraliza a
 * resposta padrao de "sem permissao" para todos os comandos.
 */
async function requireLevel(interaction, nivelMinimo) {
  const nivel = await getMemberLevel(interaction.guild, interaction.member);

  if (nivel >= nivelMinimo) {
    return true;
  }

  const nomeNivel = LEVEL_NAMES[nivelMinimo] || String(nivelMinimo);
  const payload = {
    content: `Voce precisa do nivel de permissao **${nomeNivel}** ou superior para executar esta acao.`,
    flags: MessageFlags.Ephemeral
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }

  return false;
}

module.exports = {
  LEVELS,
  LEVEL_NAMES,
  getMemberLevel,
  verificarBotManagerRole,
  isOwner,
  hasBotManager,
  isAdmin,
  isModerator,
  isSupport,
  isHelper,
  canManageTickets,
  canManageChannels,
  canManageRoles,
  canManageSetup,
  canManageSpent,
  canModerate,
  canBan,
  requireLevel
};
