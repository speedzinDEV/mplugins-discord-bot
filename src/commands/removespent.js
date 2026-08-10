'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireAdministrator } = require('../utils/permissions');
const rankService = require('../services/rankService');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('removespent')
  .setDescription('Remove valor gasto de um membro (usado para ranks de recompensa).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((opt) => opt.setName('membro').setDescription('Membro alvo').setRequired(true))
  .addNumberOption((opt) => opt.setName('valor').setDescription('Valor a remover').setRequired(true).setMinValue(0.01));

async function execute(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  await interaction.deferReply();

  const alvo = interaction.options.getUser('membro');
  const valor = interaction.options.getNumber('valor');

  try {
    const member = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    const resultado = await rankService.alterarGastoCompleto(
      interaction.guild,
      member,
      alvo.id,
      -valor,
      interaction.user.tag
    );

    let resposta =
      `Removido R$ ${valor.toFixed(2)} do total de ${alvo}.\n` +
      `Total: R$ ${resultado.totalAnterior.toFixed(2)} -> R$ ${resultado.totalNovo.toFixed(2)}.`;

    if (resultado.mudouRank) {
      resposta += `\nRank atualizado: ${resultado.rankAnterior} -> ${resultado.rankNovo}.`;
    }

    await interaction.editReply(resposta);
  } catch (err) {
    logger.error('Falha ao executar /removespent', err);
    await interaction.editReply(`Ocorreu um erro ao remover o valor: ${err.message}`);
  }
}

module.exports = { data, execute };
