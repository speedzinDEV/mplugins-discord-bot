'use strict';

const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  MessageFlags
} = require('discord.js');
const db = require('./database');
const settingsService = require('./settingsService');
const logService = require('./logService');
const permissionService = require('./permissionService');
const logger = require('../utils/logger');
const config = require('../config/constants');

const NOMES_CARGOS_STAFF = ['Suporte', 'Moderador', 'Administrador'];

// Categorias disponiveis no select menu do painel. Hoje so existe uma
// (generica, conforme combinado), mas o formato ja suporta adicionar mais
// no futuro sem mexer no fluxo de abertura de ticket.
const CATEGORIAS_TICKET = [
  {
    value: 'suporte_geral',
    label: 'Suporte Geral',
    emoji: '🎫',
    description: 'Duvidas, problemas ou qualquer outro assunto.'
  }
];

function chaveConfigPainel(channelId) {
  return `ticket_panel_message:${channelId}`;
}

const CHAVE_CARGO_AVISO = 'ticket_staff_role_id';
const LIMITE_MENSAGENS_TRANSCRIPT = 2000;
const TAMANHO_MAXIMO_ANEXO_BYTES = 7 * 1024 * 1024; // margem abaixo do limite padrao de 8MB do Discord

/**
 * Busca todas as mensagens de um canal de ticket, paginando de 100 em 100
 * (limite da API do Discord), ate um teto de seguranca. Retorna em ordem
 * cronologica (mais antiga primeiro), ideal para leitura do transcript.
 */
async function coletarMensagens(canal, limiteMaximo = LIMITE_MENSAGENS_TRANSCRIPT) {
  const mensagens = [];
  let ultimoId;

  while (mensagens.length < limiteMaximo) {
    const opcoes = { limit: 100 };
    if (ultimoId) opcoes.before = ultimoId;

    const lote = await canal.messages.fetch(opcoes);
    if (lote.size === 0) break;

    mensagens.push(...lote.values());
    ultimoId = lote.last().id;

    if (lote.size < 100) break;
  }

  return mensagens.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/**
 * Formata as mensagens coletadas em um transcript de texto simples,
 * incluindo autor, horario, conteudo e anexos (por URL, sem baixar o
 * arquivo em si).
 */
function formatarTranscript(canal, mensagens) {
  const linhas = [];
  linhas.push(`Transcript do ticket: #${canal.name} (${canal.id})`);
  linhas.push(`Gerado em: ${new Date().toISOString()}`);
  linhas.push(`Total de mensagens: ${mensagens.length}`);
  linhas.push('='.repeat(60));
  linhas.push('');

  for (const msg of mensagens) {
    const autor = msg.author ? `${msg.author.tag} (${msg.author.id})` : 'desconhecido';
    const data = new Date(msg.createdTimestamp).toISOString();

    linhas.push(`[${data}] ${autor}:`);
    if (msg.content) {
      linhas.push(msg.content);
    }
    for (const anexo of msg.attachments.values()) {
      linhas.push(`  Anexo: ${anexo.url}`);
    }
    linhas.push('');
  }

  return linhas.join('\n');
}

async function salvarTranscript({ ticketId, guildId, discordId, channelId, conteudo, quantidadeMensagens }) {
  const result = await db.query(
    `INSERT INTO ticket_transcripts (ticket_id, guild_id, discord_id, channel_id, message_count, content)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ticketId, guildId, discordId, channelId, quantidadeMensagens, conteudo]
  );
  return result.rows[0];
}

/**
 * Publica o transcript (arquivo .txt) no canal #logs, se ele existir.
 * Nunca lanca excecao: a ausencia do canal de logs, ou uma falha no
 * upload, nao pode impedir o fechamento do ticket em si.
 */
async function enviarTranscriptParaLogs(guild, canal, ticket, transcriptRow, quemFechou) {
  const canalLogs = guild.channels.cache.find(
    (c) => c.name === 'logs' && typeof c.isTextBased === 'function' && c.isTextBased()
  );
  if (!canalLogs) return;

  try {
    const bufferConteudo = Buffer.from(transcriptRow.content, 'utf8');
    if (bufferConteudo.byteLength > TAMANHO_MAXIMO_ANEXO_BYTES) {
      await canalLogs.send(
        `Transcript do ticket #${ticket.id} (usuario <@${ticket.discord_id}>, fechado por <@${quemFechou}>) ` +
          `ficou grande demais para anexar (${transcriptRow.message_count} mensagens). ` +
          `Ele continua salvo no banco de dados (ticket_transcripts, id ${transcriptRow.id}).`
      );
      return;
    }

    const anexo = new AttachmentBuilder(bufferConteudo, { name: `transcript-ticket-${ticket.id}.txt` });

    await canalLogs.send({
      content:
        `Transcript do ticket #${ticket.id} - usuario <@${ticket.discord_id}> - fechado por <@${quemFechou}> ` +
        `- ${transcriptRow.message_count} mensagem(ns).`,
      files: [anexo]
    });
  } catch (err) {
    logger.warn(`Nao foi possivel enviar o transcript do ticket #${ticket.id} para #logs: ${err.message}`);
  }
}

/**
 * Publica o painel de suporte (titulo, horario de atendimento, tempo medio
 * de resposta, banner e select de categoria) no canal informado, caso ainda
 * nao exista um painel valido publicado (evita duplicar embeds a cada
 * reinicio do bot ou execucao do /setup).
 */
async function postarPainelSeNecessario(canal) {
  const chave = chaveConfigPainel(canal.id);
  const mensagemIdSalva = await settingsService.get(chave, null);

  if (mensagemIdSalva) {
    try {
      const existente = await canal.messages.fetch(mensagemIdSalva);
      if (existente) return existente;
    } catch (err) {
      // Mensagem nao existe mais (apagada manualmente); sera recriada abaixo.
    }
  }

  const { titulo, horario, tempoResposta, bannerUrl, rodape, cor } = config.ticketPanel;

  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setColor(Number(cor))
    .setDescription(
      'Selecione uma das opcoes abaixo para abrir um atendimento. Responderemos o mais rapido possivel!'
    )
    .addFields(
      { name: '⭐ Horário de Atendimento', value: horario },
      { name: '📶 Tempo Médio de Resposta', value: tempoResposta }
    )
    .setFooter({ text: rodape, iconURL: canal.guild.iconURL() || undefined });

  if (bannerUrl) {
    embed.setImage(bannerUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_categoria')
      .setPlaceholder('Selecione a categoria do ticket')
      .addOptions(
        CATEGORIAS_TICKET.map((cat) => ({
          value: cat.value,
          label: cat.label,
          description: cat.description,
          emoji: cat.emoji
        }))
      )
  );

  const mensagem = await canal.send({ embeds: [embed], components: [row] });
  await settingsService.set(chave, mensagem.id);
  return mensagem;
}

function encontrarCargosStaff(guild) {
  return NOMES_CARGOS_STAFF.map((nome) => guild.roles.cache.find((r) => r.name === nome)).filter(Boolean);
}

function montarOverwrites(guild, autor) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: autor.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  for (const cargo of encontrarCargosStaff(guild)) {
    overwrites.push({
      id: cargo.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  return overwrites;
}

async function buscarTicketAbertoPorUsuario(discordId) {
  const result = await db.query(
    "SELECT * FROM tickets WHERE discord_id = $1 AND status = 'aberto' LIMIT 1",
    [discordId]
  );
  return result.rows[0] || null;
}

async function buscarTicketPorCanal(channelId) {
  const result = await db.query('SELECT * FROM tickets WHERE channel_id = $1', [channelId]);
  return result.rows[0] || null;
}

/**
 * Delega para o PermissionService central (nivel SUPPORT ou superior),
 * em vez de reimplementar a checagem de cargo aqui. Mantido como funcao
 * local (sincrona por fora) porque quem chama precisa do resultado antes
 * de decidir se mostra o botao/confirmacao de fechamento.
 */
async function usuarioEStaff(member, guild) {
  if (!member) return false;
  return permissionService.canManageTickets(guild, member);
}

/**
 * Cria um novo ticket para o usuario que interagiu com o painel (seja pelo
 * select menu "Selecione a categoria do ticket", seja por /tickets).
 * Impede um segundo ticket aberto do mesmo usuario.
 */
async function abrirTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const autor = interaction.member;

  const ticketExistente = await buscarTicketAbertoPorUsuario(autor.id);
  if (ticketExistente) {
    const canalExistente = guild.channels.cache.get(ticketExistente.channel_id);
    if (canalExistente) {
      await interaction.editReply({ content: `Voce ja possui um ticket aberto: ${canalExistente}` });
      return;
    }
    // Canal nao existe mais no Discord, mas o banco ainda marca como aberto: corrige.
    await db.query("UPDATE tickets SET status = 'fechado', closed_at = NOW() WHERE id = $1", [
      ticketExistente.id
    ]);
  }

  const canalPainel = interaction.channel;
  const categoriaSuporte =
    guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === 'SUPORTE') ||
    (canalPainel.parentId ? guild.channels.cache.get(canalPainel.parentId) : null);

  const nomeCanal = `ticket-${autor.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

  let canalTicket;
  try {
    canalTicket = await guild.channels.create({
      name: nomeCanal,
      type: ChannelType.GuildText,
      parent: categoriaSuporte ? categoriaSuporte.id : undefined,
      permissionOverwrites: montarOverwrites(guild, autor),
      reason: `Ticket aberto por ${autor.user.tag}`
    });
  } catch (err) {
    logger.error('Falha ao criar canal de ticket', err);
    await interaction.editReply({ content: `Nao foi possivel criar o ticket: ${err.message}` });
    return;
  }

  await db.query(
    'INSERT INTO tickets (discord_id, channel_id, status) VALUES ($1, $2, $3)',
    [autor.id, canalTicket.id, 'aberto']
  );

  const embed = new EmbedBuilder()
    .setTitle('Ticket aberto')
    .setColor(0x57f287)
    .setDescription(`Ola ${autor}, descreva o seu problema. A equipe de suporte ira te atender em breve.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_fechar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
  );

  const cargoAvisoId = await settingsService.get(CHAVE_CARGO_AVISO, null);
  const cargoAvisoExiste = cargoAvisoId ? guild.roles.cache.has(cargoAvisoId) : false;
  const mencaoCargo = cargoAvisoExiste ? ` <@&${cargoAvisoId}>` : '';

  await canalTicket.send({
    content: `${autor}${mencaoCargo}`,
    embeds: [embed],
    components: [row],
    allowedMentions: {
      users: [autor.id],
      roles: cargoAvisoExiste ? [cargoAvisoId] : []
    }
  });

  if (cargoAvisoId && !cargoAvisoExiste) {
    logger.warn(
      `Cargo de aviso de tickets (${cargoAvisoId}) configurado mas nao encontrado na guild ${guild.id}. Configure novamente com /setup ticket-staff-role.`
    );
  }

  await logService.registrar(guild, 'ticket_criado', `Ticket criado por ${autor.id} no canal ${canalTicket.id}.`);

  await interaction.editReply({ content: `Ticket criado: ${canalTicket}` });
}

/**
 * Inicia o fluxo de fechamento de um ticket, exigindo confirmacao.
 * Apenas o autor do ticket ou membros da staff podem fechar.
 */
async function iniciarFechamento(interaction) {
  const ticket = await buscarTicketPorCanal(interaction.channel.id);

  if (!ticket || ticket.status !== 'aberto') {
    await interaction.reply({ content: 'Este canal nao esta registrado como um ticket aberto.', flags: MessageFlags.Ephemeral });
    return;
  }

  const ehAutor = interaction.user.id === ticket.discord_id;
  const ehStaff = await usuarioEStaff(interaction.member, interaction.guild);

  if (!ehAutor && !ehStaff) {
    await interaction.reply({ content: 'Voce nao tem permissao para fechar este ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_fechar_confirmar')
      .setLabel('Confirmar fechamento')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_fechar_cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );

  const reply = await interaction.reply({
    content: 'Tem certeza que deseja fechar este ticket? O canal sera excluido apos a confirmacao.',
    components: [row],
    fetchReply: true
  });

  try {
    const confirmacao = await reply.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000
    });

    if (confirmacao.customId === 'ticket_fechar_cancelar') {
      await confirmacao.update({ content: 'Fechamento cancelado.', components: [] });
      return;
    }

    await confirmacao.update({ content: 'Fechando ticket em instantes...', components: [] });
    await finalizarFechamento(interaction.guild, interaction.channel, ticket, interaction.user.id);
  } catch (err) {
    if (err.code === 'InteractionCollectorError') {
      await interaction.editReply({ content: 'Tempo esgotado. Fechamento cancelado.', components: [] });
      return;
    }
    logger.error('Falha ao confirmar fechamento de ticket', err);
  }
}

async function finalizarFechamento(guild, canal, ticket, quemFechou) {
  await db.query("UPDATE tickets SET status = 'fechado', closed_at = NOW() WHERE id = $1", [ticket.id]);

  let transcriptRow = null;
  try {
    const mensagens = await coletarMensagens(canal);
    const conteudo = formatarTranscript(canal, mensagens);
    transcriptRow = await salvarTranscript({
      ticketId: ticket.id,
      guildId: guild.id,
      discordId: ticket.discord_id,
      channelId: canal.id,
      conteudo,
      quantidadeMensagens: mensagens.length
    });
    await enviarTranscriptParaLogs(guild, canal, ticket, transcriptRow, quemFechou);
  } catch (err) {
    logger.error('Falha ao gerar/salvar transcript do ticket', err);
  }

  await logService.registrar(
    guild,
    'ticket_fechado',
    `Ticket ${ticket.id} (usuario ${ticket.discord_id}) fechado por ${quemFechou}.` +
      (transcriptRow ? ` Transcript #${transcriptRow.id} salvo (${transcriptRow.message_count} mensagens).` : ' Transcript nao pode ser gerado.')
  );

  await canal.send('Este ticket sera excluido em 5 segundos.').catch(() => {});

  setTimeout(() => {
    canal.delete('Ticket fechado').catch((err) => {
      logger.error('Falha ao excluir canal de ticket', err);
    });
  }, 5000);
}

module.exports = { postarPainelSeNecessario, abrirTicket, iniciarFechamento, CHAVE_CARGO_AVISO, formatarTranscript };
