'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const rankService = require('../services/rankService');

const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Mostra o rank atual de um membro.')
  .addUserOption((opt) => opt.setName('membro').setDescription('Membro a consultar').setRequired(false));

async function execute(interaction) {
  await interaction.deferReply();

  const alvo = interaction.options.getUser('membro') || interaction.user;
  const usuario = await rankService.obterOuCriarUsuario(alvo.id);
  const total = Number(usuario.total_spent);
  const rankAtual = usuario.current_rank || rankService.RANK_INICIAL;
  const { proximo, faltam } = rankService.calcularProximoRank(total);

  const embed = new EmbedBuilder()
    .setTitle(`Rank de ${alvo.username}`)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Cargo atual', value: rankAtual, inline: true },
      { name: 'Total gasto', value: `R$ ${total.toFixed(2)}`, inline: true },
      {
        name: 'Proximo cargo',
        value: proximo ? `${proximo} (faltam R$ ${faltam.toFixed(2)})` : 'Rank maximo atingido',
        inline: false
      }
    )
    .setThumbnail(alvo.displayAvatarURL());

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };
