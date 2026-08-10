'use strict';

const { MessageFlags } = require('discord.js');

/**
 * Resposta padrao para comandos cuja logica completa sera implementada
 * em uma fase futura do projeto. Nao simula dados nem finge funcionalidade.
 */
async function responderPendente(interaction, nomeComando, fase) {
  await interaction.reply({
    content: `O comando /${nomeComando} ainda nao foi implementado. Esta funcionalidade sera adicionada em ${fase}.`,
    flags: MessageFlags.Ephemeral
  });
}

module.exports = { responderPendente };
