'use strict';

const { PermissionFlagsBits } = require('discord.js');
const permissionService = require('../services/permissionService');

/**
 * Mantido por compatibilidade com codigo existente que so precisa checar
 * o bit nativo Administrator do Discord, de forma sincrona (sem ir ao
 * banco). Para qualquer checagem que envolva a hierarquia do bot (OWNER,
 * BOT_MANAGER, etc.), use permissionService diretamente.
 */
function isAdministrator(interactionOrMember) {
  const member = interactionOrMember.member || interactionOrMember;
  if (!member || !member.permissions) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Mantido por compatibilidade: agora delega para a hierarquia central
 * (permissionService), exigindo nivel ADMIN ou superior (o que inclui
 * OWNER e BOT_MANAGER). Comandos novos devem chamar
 * permissionService.requireLevel(interaction, permissionService.LEVELS.X)
 * diretamente em vez desta funcao.
 */
async function requireAdministrator(interaction) {
  return permissionService.requireLevel(interaction, permissionService.LEVELS.ADMIN);
}

module.exports = { isAdministrator, requireAdministrator };
