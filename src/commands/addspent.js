'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireAdministrator } = require('../utils/permissions');
const rankService = require('../services/rankService');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('addspent')
  .setDescription('Adiciona valor gasto por um membro (usado para ranks de recompensa).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((opt) => opt.setName('membro').setDescription('Membro alvo').setRequired(true))
  .addNumberOption((opt) => opt.setName('valor').setDescription('Valor a adicionar').setRequired(true).setMinValue(0.01));

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
      valor,
      interaction.user.tag
    );

    let resposta =
      `Adicionado R$ ${valor.toFixed(2)} ao total de ${alvo}.\n` +
      `Total: R$ ${resultado.totalAnterior.toFixed(2)} -> R$ ${resultado.totalNovo.toFixed(2)}.`;

    if (resultado.mudouRank) {
      resposta += `\nRank atualizado: ${resultado.rankAnterior} -> ${resultado.rankNovo}.`;
    }

    await interaction.editReply(resposta);
  } catch (err) {
    logger.error('Falha ao executar /addspent', err);
    await interaction.editReply(`Ocorreu um erro ao adicionar o valor: ${err.message}`);
  }
}

module.exports = { data, execute };
