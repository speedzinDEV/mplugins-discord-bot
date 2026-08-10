'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const setupService = require('../services/setupService');
const { requireAdministrator } = require('../utils/permissions');
const permissionService = require('../services/permissionService');
const settingsService = require('../services/settingsService');
const logService = require('../services/logService');
const logger = require('../utils/logger');
const { CHAVE_CARGO_AVISO } = require('../services/ticketService');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configura ou gerencia a estrutura automatica da mPlugins neste servidor.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName('executar').setDescription('Cria automaticamente cargos, categorias e canais da mPlugins.')
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Mostra o status atual do bot, banco de dados e estrutura da guild.')
  )
  .addSubcommand((sub) =>
    sub.setName('cleanup').setDescription('Remove tudo que o /setup criou nesta guild (exige confirmacao).')
  )
  .addSubcommand((sub) =>
    sub
      .setName('manager-role')
      .setDescription('Define qual cargo tem permissao de Bot Manager (controle total do bot).')
      .addRoleOption((opt) =>
        opt.setName('cargo').setDescription('Cargo que sera o Bot Manager').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('ticket-staff-role')
      .setDescription('Define qual cargo e avisado quando um novo ticket e aberto.')
      .addRoleOption((opt) =>
        opt.setName('cargo').setDescription('Cargo a ser mencionado na abertura de tickets').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('help').setDescription('Explica o que o /setup faz e quais subcomandos existem.')
  );

async function executarSubcomando(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const resultado = await setupService.executarSetup(interaction.guild);

    const embed = new EmbedBuilder()
      .setTitle('Setup concluido')
      .setColor(0x57f287)
      .setDescription('Estrutura da mPlugins verificada/criada com sucesso.')
      .addFields(
        { name: 'Cargos criados', value: String(resultado.cargosCriados), inline: true },
        { name: 'Categorias criadas', value: String(resultado.categoriasCriadas), inline: true },
        { name: 'Canais criados', value: String(resultado.canaisCriados), inline: true }
      )
      .setFooter({ text: 'Execute /setup status para conferir o estado completo.' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Falha ao executar /setup executar', err);
    await interaction.editReply({
      content: `Ocorreu um erro ao executar o setup: ${err.message}`
    });
  }
}

async function statusSubcomando(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const status = await setupService.obterStatus(interaction.guild);

    const emoji = { OK: 'OK', WARN: 'WARN', ERROR: 'ERROR' };
    const linhas = status.itens.map((item) => `[${emoji[item.estado]}] ${item.nome}: ${item.detalhe}`);

    const embed = new EmbedBuilder()
      .setTitle('Status do sistema mPlugins')
      .setColor(0x5865f2)
      .setDescription(linhas.join('\n'));

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Falha ao executar /setup status', err);
    await interaction.editReply({
      content: `Ocorreu um erro ao obter o status: ${err.message}`
    });
  }
}

async function cleanupSubcomando(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_cleanup_confirm')
      .setLabel('Confirmar remocao')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('setup_cleanup_cancel')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );

  const reply = await interaction.reply({
    content:
      'Isso ira remover TODOS os cargos, categorias e canais criados pelo /setup nesta guild.\n' +
      'Objetos externos, banco de dados e compras NAO serao afetados.\n\nConfirma a remocao?',
    components: [row],
    flags: MessageFlags.Ephemeral,
    fetchReply: true
  });

  try {
    const confirmacao = await reply.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000
    });

    if (confirmacao.customId === 'setup_cleanup_cancel') {
      await confirmacao.update({ content: 'Cleanup cancelado.', components: [] });
      return;
    }

    await confirmacao.update({ content: 'Removendo estrutura criada pelo setup...', components: [] });

    const removidos = await setupService.executarCleanup(interaction.guild);

    await interaction.editReply({
      content:
        `Cleanup concluido.\n` +
        `Cargos removidos: ${removidos.cargos}\n` +
        `Categorias removidas: ${removidos.categorias}\n` +
        `Canais removidos: ${removidos.canais}`,
      components: []
    });
  } catch (err) {
    if (err.code === 'InteractionCollectorError') {
      await interaction.editReply({ content: 'Tempo esgotado. Cleanup cancelado.', components: [] });
      return;
    }
    logger.error('Falha ao executar /setup cleanup', err);
    await interaction.editReply({
      content: `Ocorreu um erro ao executar o cleanup: ${err.message}`,
      components: []
    });
  }
}

async function managerRoleSubcomando(interaction) {
  // Bootstrap: definir o Bot Manager e uma acao sensivel, mas nao pode
  // exigir BOT_MANAGER previamente configurado (isso trancaria o
  // servidor). Por isso exige ADMIN nativo ou OWNER, nunca menos.
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  const cargo = interaction.options.getRole('cargo');

  if (cargo.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content:
        'Aviso: este cargo ja possui a permissao Administrator do proprio Discord, ' +
        'entao ja tinha acesso total independente desta configuracao. Definindo mesmo assim.',
      flags: MessageFlags.Ephemeral
    });
  }

  await settingsService.set('bot_manager_role_id', cargo.id);

  await logService.registrar(
    interaction.guild,
    'admin',
    `${interaction.user.tag} definiu o cargo Bot Manager: ${cargo.name} (${cargo.id}).`
  );

  const payload = { content: `Cargo Bot Manager definido: ${cargo}. Membros com este cargo agora tem controle total do bot neste servidor.` };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}

async function ticketStaffRoleSubcomando(interaction) {
  const ok = await requireAdministrator(interaction);
  if (!ok) return;

  const cargo = interaction.options.getRole('cargo');

  await settingsService.set(CHAVE_CARGO_AVISO, cargo.id);

  await logService.registrar(
    interaction.guild,
    'admin',
    `${interaction.user.tag} definiu o cargo de aviso de tickets: ${cargo.name} (${cargo.id}).`
  );

  await interaction.reply({
    content: `Cargo de aviso de tickets definido: ${cargo}. Ele sera mencionado sempre que um novo ticket for aberto.`,
    flags: MessageFlags.Ephemeral
  });
}

async function helpSubcomando(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Ajuda - /setup')
    .setColor(0xfee75c)
    .setDescription(
      'Comandos disponiveis (somente administradores):\n\n' +
        '`/setup executar` - cria os cargos, categorias e canais padrao da mPlugins.\n' +
        '`/setup status` - mostra o status do bot, banco de dados e da estrutura da guild.\n' +
        '`/setup cleanup` - remove (com confirmacao) tudo que o /setup criou.\n' +
        '`/setup manager-role` - define o cargo com controle total do bot (Bot Manager).\n' +
        '`/setup ticket-staff-role` - define o cargo avisado quando um ticket e aberto.\n' +
        '`/setup help` - mostra esta mensagem.\n\n' +
        'Observacao: a API de comandos do Discord nao permite que "/setup" sozinho ' +
        'tenha uma acao direta ao mesmo tempo em que possui subcomandos. ' +
        'Por isso a criacao automatica esta em `/setup executar`.'
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'executar') return executarSubcomando(interaction);
  if (sub === 'status') return statusSubcomando(interaction);
  if (sub === 'cleanup') return cleanupSubcomando(interaction);
  if (sub === 'manager-role') return managerRoleSubcomando(interaction);
  if (sub === 'ticket-staff-role') return ticketStaffRoleSubcomando(interaction);
  if (sub === 'help') return helpSubcomando(interaction);

  await interaction.reply({ content: 'Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };
