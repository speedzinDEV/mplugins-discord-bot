'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireAdministrator } = require('../utils/permissions');
const rankService = require('../services/rankService');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('syncroles')
  .setDescription('Sincroniza os cargos de rank de todos os membros com o banco de dados.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  await interaction.deferReply();

  try {
    const resultado = await rankService.sincronizarTodos(interaction.guild, interaction.user.tag);
    await interaction.editReply(
      `Sincronizacao concluida. Usuarios verificados: ${resultado.verificados}. Corrigidos: ${resultado.corrigidos}.`
    );
  } catch (err) {
    logger.error('Falha ao executar /syncroles', err);
    await interaction.editReply(`Ocorreu um erro ao sincronizar os cargos: ${err.message}`);
  }
}

module.exports = { data, execute };
