'use strict';

const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const ticketService = require('../services/ticketService');

const name = Events.InteractionCreate;
const once = false;

// customId dos botoes "persistentes" do sistema de tickets (o painel e o
// botao "Fechar Ticket" ficam publicados indefinidamente, entao precisam
// ser roteados aqui em vez de um collector local, que so vive enquanto a
// interacao original que o criou estiver ativa).
const BOTOES_TICKET = {
  ticket_abrir: (interaction) => ticketService.abrirTicket(interaction),
  ticket_fechar: (interaction) => ticketService.iniciarFechamento(interaction)
};

// customId dos select menus "persistentes" (o select de categoria do painel
// de tickets), mesmo raciocinio dos botoes acima.
const SELECTS_TICKET = {
  ticket_categoria: (interaction) => ticketService.abrirTicket(interaction)
};

async function tratarComponente(interaction, mapa, tipo) {
  const handler = mapa[interaction.customId];
  if (!handler) return; // outros componentes (ex.: confirmacoes) usam collector local e sao ignorados aqui.

  try {
    await handler(interaction);
  } catch (err) {
    logger.error(`Erro ao processar ${tipo} ${interaction.customId}`, err);
    const payload = { content: 'Ocorreu um erro ao processar esta acao.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

async function tratarComando(interaction) {
  const comando = interaction.client.commands.get(interaction.commandName);
  if (!comando) {
    logger.warn(`Comando desconhecido recebido: /${interaction.commandName}`);
    return;
  }

  try {
    await comando.execute(interaction);
  } catch (err) {
    logger.error(`Erro ao executar /${interaction.commandName}`, err);

    const payload = {
      content: 'Ocorreu um erro ao executar este comando.',
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    await tratarComando(interaction);
    return;
  }

  if (interaction.isButton()) {
    await tratarComponente(interaction, BOTOES_TICKET, 'botao');
    return;
  }

  if (interaction.isStringSelectMenu()) {
    await tratarComponente(interaction, SELECTS_TICKET, 'select');
  }
}

module.exports = { name, once, execute };
