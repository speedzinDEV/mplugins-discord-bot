'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const rankService = require('../services/rankService');

const data = new SlashCommandBuilder()
  .setName('ranking')
  .setDescription('Mostra o ranking geral do servidor.');

async function execute(interaction) {
  await interaction.deferReply();

  const top = await rankService.topRanking(10);

  if (top.length === 0) {
    await interaction.editReply('Ainda nao ha nenhum registro de gasto neste servidor.');
    return;
  }

  const linhas = top.map((linha, index) => {
    const posicao = index + 1;
    const total = Number(linha.total_spent).toFixed(2);
    return `**${posicao}.** <@${linha.discord_id}> - ${linha.current_rank || rankService.RANK_INICIAL} - R$ ${total}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Ranking - Top 10 compradores')
    .setColor(0xf1c40f)
    .setDescription(linhas.join('\n'));

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };
