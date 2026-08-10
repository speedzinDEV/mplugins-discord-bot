'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireAdministrator } = require('../utils/permissions');
const { RANK_THRESHOLDS } = require('../config/ranks');
const rankService = require('../services/rankService');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('setrank')
  .setDescription('Define manualmente o rank de um membro (nao altera o total gasto).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((opt) => opt.setName('membro').setDescription('Membro alvo').setRequired(true))
  .addStringOption((opt) => {
    opt.setName('rank').setDescription('Rank a atribuir').setRequired(true);
    for (const limite of RANK_THRESHOLDS) {
      opt.addChoices({ name: limite.name, value: limite.name });
    }
    return opt;
  });

async function execute(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  await interaction.deferReply();

  const alvo = interaction.options.getUser('membro');
  const rankNome = interaction.options.getString('rank');

  try {
    const member = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    if (!member) {
      await interaction.editReply('Este usuario nao foi encontrado neste servidor.');
      return;
    }

    const resultado = await rankService.definirRankManual(
      interaction.guild,
      member,
      alvo.id,
      rankNome,
      interaction.user.tag
    );

    await interaction.editReply(
      `Rank de ${alvo} definido manualmente: ${resultado.rankAnterior} -> ${resultado.rankNovo}.`
    );
  } catch (err) {
    logger.error('Falha ao executar /setrank', err);
    await interaction.editReply(`Ocorreu um erro ao definir o rank: ${err.message}`);
  }
}

module.exports = { data, execute };
