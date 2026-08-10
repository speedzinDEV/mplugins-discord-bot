'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { responderPendente } = require('../utils/pending');

const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Mostra estatisticas de um membro.')
  .addUserOption((opt) => opt.setName('membro').setDescription('Membro a consultar').setRequired(false));

async function execute(interaction) {
  await responderPendente(interaction, 'stats', 'uma proxima etapa do projeto (sistema de ranks)');
}

module.exports = { data, execute };
