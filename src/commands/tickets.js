'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ticketService = require('../services/ticketService');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('tickets')
  .setDescription('Abre um ticket de suporte.');

async function execute(interaction) {
  try {
    // Reaproveita a mesma logica usada pelo botao "Abrir Ticket" do painel,
    // evitando duplicar a implementacao (canal privado, permissoes, banco).
    await ticketService.abrirTicket(interaction);
  } catch (err) {
    logger.error('Falha ao executar /tickets', err);
    const payload = { content: `Ocorreu um erro ao abrir o ticket: ${err.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = { data, execute };
