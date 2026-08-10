'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const permissionService = require('../services/permissionService');
const moderationService = require('../services/moderationService');
const logger = require('../utils/logger');

const DURACAO_MAXIMA_MINUTOS = 40320; // 28 dias, limite nativo de timeout do Discord

const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Comandos de moderacao (advertencias, silenciamento, expulsao e banimento).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub
      .setName('warn')
      .setDescription('Aplica uma advertencia a um membro.')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a advertir').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo da advertencia').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('unwarn')
      .setDescription('Remove uma advertencia especifica pelo numero do caso.')
      .addIntegerOption((opt) => opt.setName('caso').setDescription('Numero do caso (ex.: 12)').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo da remocao').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('warnings')
      .setDescription('Lista as advertencias ativas de um membro.')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a consultar').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('mute')
      .setDescription('Silencia um membro por um tempo determinado (timeout nativo do Discord).')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a silenciar').setRequired(true))
      .addIntegerOption((opt) =>
        opt
          .setName('minutos')
          .setDescription('Duracao em minutos (maximo 40320 = 28 dias)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(DURACAO_MAXIMA_MINUTOS)
      )
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo do silenciamento').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('unmute')
      .setDescription('Remove o silenciamento de um membro.')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a dessilenciar').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo da remocao').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('kick')
      .setDescription('Expulsa um membro do servidor.')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a expulsar').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo da expulsao').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Bane um usuario do servidor.')
      .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a banir').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo do banimento').setRequired(true))
      .addIntegerOption((opt) =>
        opt
          .setName('dias_mensagens')
          .setDescription('Apagar mensagens dos ultimos X dias (0 a 7)')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(7)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unban')
      .setDescription('Remove o banimento de um usuario pelo ID do Discord.')
      .addStringOption((opt) => opt.setName('usuario_id').setDescription('ID do Discord do usuario').setRequired(true))
      .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo do desbanimento').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('history')
      .setDescription('Mostra o historico completo de punicoes de um membro.')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro a consultar').setRequired(true))
  );

/**
 * Bloqueia auto-moderacao, moderar o proprio bot, e escalada de
 * privilegio (moderar alguem com nivel igual ou superior ao do
 * executor). Retorna uma mensagem de erro, ou null se estiver liberado.
 */
async function validarAlvo(interaction, targetUser) {
  if (targetUser.id === interaction.user.id) {
    return 'Voce nao pode executar esta acao em si mesmo.';
  }
  if (targetUser.id === interaction.client.user.id) {
    return 'Voce nao pode executar esta acao no proprio bot.';
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember) {
    const nivelExecutor = await permissionService.getMemberLevel(interaction.guild, interaction.member);
    const nivelAlvo = await permissionService.getMemberLevel(interaction.guild, targetMember);
    if (nivelAlvo >= nivelExecutor) {
      return 'Voce nao pode moderar alguem com nivel de permissao igual ou superior ao seu.';
    }
  }

  return null;
}

async function subWarn(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');
  const motivo = interaction.options.getString('motivo');

  const erroAlvo = await validarAlvo(interaction, targetUser);
  if (erroAlvo) {
    await interaction.reply({ content: erroAlvo, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const punicao = await moderationService.aplicarWarn(interaction.guild, targetUser, interaction.user.id, motivo);
    await interaction.editReply(`${targetUser} foi advertido. Caso #${punicao.id}.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod warn', err);
    await interaction.editReply(`Ocorreu um erro ao advertir este membro: ${err.message}`);
  }
}

async function subUnwarn(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const caseId = interaction.options.getInteger('caso');
  const motivo = interaction.options.getString('motivo');

  await interaction.deferReply();

  try {
    const punicao = await moderationService.removerWarn(interaction.guild, caseId, interaction.user.id, motivo);
    if (!punicao) {
      await interaction.editReply(`Nenhuma advertencia ativa encontrada com o numero de caso #${caseId}.`);
      return;
    }
    await interaction.editReply(`Advertencia #${caseId} removida (usuario <@${punicao.discord_id}>).\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod unwarn', err);
    await interaction.editReply(`Ocorreu um erro ao remover a advertencia: ${err.message}`);
  }
}

async function subWarnings(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const warnings = await moderationService.listarWarningsAtivos(interaction.guild.id, targetUser.id);

    if (warnings.length === 0) {
      await interaction.editReply(`${targetUser} nao possui advertencias ativas.`);
      return;
    }

    const linhas = warnings.map(
      (w) => `Caso #${w.id} - ${new Date(w.created_at).toLocaleString('pt-BR')}\nModerador: <@${w.moderator_id}>\nMotivo: ${w.reason}`
    );

    const embed = new EmbedBuilder()
      .setTitle(`Advertencias ativas de ${targetUser.username}`)
      .setColor(0xfee75c)
      .setDescription(linhas.join('\n\n'));

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Falha ao executar /mod warnings', err);
    await interaction.editReply(`Ocorreu um erro ao consultar as advertencias: ${err.message}`);
  }
}

async function subMute(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');
  const minutos = interaction.options.getInteger('minutos');
  const motivo = interaction.options.getString('motivo');

  const erroAlvo = await validarAlvo(interaction, targetUser);
  if (erroAlvo) {
    await interaction.reply({ content: erroAlvo, flags: MessageFlags.Ephemeral });
    return;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Este usuario nao esta neste servidor.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!member.moderatable) {
    await interaction.reply({
      content: 'Nao foi possivel silenciar este membro (hierarquia de cargos ou permissoes do bot insuficientes).',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply();

  try {
    const punicao = await moderationService.aplicarMute(interaction.guild, member, interaction.user.id, motivo, minutos);
    await interaction.editReply(`${targetUser} foi silenciado por ${minutos} minuto(s). Caso #${punicao.id}.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod mute', err);
    await interaction.editReply(`Ocorreu um erro ao silenciar este membro: ${err.message}`);
  }
}

async function subUnmute(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');
  const motivo = interaction.options.getString('motivo');

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Este usuario nao esta neste servidor.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    await moderationService.removerMute(interaction.guild, member, interaction.user.id, motivo);
    await interaction.editReply(`${targetUser} nao esta mais silenciado.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod unmute', err);
    await interaction.editReply(`Ocorreu um erro ao remover o silenciamento: ${err.message}`);
  }
}

async function subKick(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');
  const motivo = interaction.options.getString('motivo');

  const erroAlvo = await validarAlvo(interaction, targetUser);
  if (erroAlvo) {
    await interaction.reply({ content: erroAlvo, flags: MessageFlags.Ephemeral });
    return;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Este usuario nao esta neste servidor.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!member.kickable) {
    await interaction.reply({
      content: 'Nao foi possivel expulsar este membro (hierarquia de cargos ou permissoes do bot insuficientes).',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply();

  try {
    const punicao = await moderationService.executarKick(interaction.guild, member, interaction.user.id, motivo);
    await interaction.editReply(`${targetUser.tag} foi expulso. Caso #${punicao.id}.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod kick', err);
    await interaction.editReply(`Ocorreu um erro ao expulsar este membro: ${err.message}`);
  }
}

async function subBan(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.ADMIN))) return;

  const targetUser = interaction.options.getUser('usuario');
  const motivo = interaction.options.getString('motivo');
  const dias = interaction.options.getInteger('dias_mensagens') || 0;

  const erroAlvo = await validarAlvo(interaction, targetUser);
  if (erroAlvo) {
    await interaction.reply({ content: erroAlvo, flags: MessageFlags.Ephemeral });
    return;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (member && !member.bannable) {
    await interaction.reply({
      content: 'Nao foi possivel banir este membro (hierarquia de cargos ou permissoes do bot insuficientes).',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply();

  try {
    const punicao = await moderationService.executarBan(
      interaction.guild,
      targetUser,
      interaction.user.id,
      motivo,
      dias * 24 * 60 * 60
    );
    await interaction.editReply(`${targetUser.tag} foi banido. Caso #${punicao.id}.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod ban', err);
    await interaction.editReply(`Ocorreu um erro ao banir este usuario: ${err.message}`);
  }
}

async function subUnban(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.ADMIN))) return;

  const discordId = interaction.options.getString('usuario_id').trim();
  const motivo = interaction.options.getString('motivo');

  if (!/^[0-9]{15,25}$/.test(discordId)) {
    await interaction.reply({ content: 'ID do Discord invalido.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const banido = await interaction.guild.bans.fetch(discordId).catch(() => null);
    if (!banido) {
      await interaction.editReply('Este usuario nao esta banido neste servidor.');
      return;
    }

    await moderationService.executarUnban(interaction.guild, discordId, interaction.user.id, motivo);
    await interaction.editReply(`Usuario <@${discordId}> foi desbanido.\nMotivo: ${motivo}`);
  } catch (err) {
    logger.error('Falha ao executar /mod unban', err);
    await interaction.editReply(`Ocorreu um erro ao desbanir este usuario: ${err.message}`);
  }
}

async function subHistory(interaction) {
  if (!(await permissionService.requireLevel(interaction, permissionService.LEVELS.MODERATOR))) return;

  const targetUser = interaction.options.getUser('membro');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const historico = await moderationService.listarHistorico(interaction.guild.id, targetUser.id, 10);
    const total = await moderationService.contarHistorico(interaction.guild.id, targetUser.id);

    if (historico.length === 0) {
      await interaction.editReply(`${targetUser} nao possui nenhum registro de moderacao.`);
      return;
    }

    const linhas = historico.map((p) => {
      const data = new Date(p.created_at).toLocaleString('pt-BR');
      const statusTexto = p.status === 'ativo' ? 'ativo' : p.status;
      return `**${p.type.toUpperCase()}** - Caso #${p.id} - ${data} - [${statusTexto}]\nModerador: <@${p.moderator_id}> - Motivo: ${p.reason}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Historico de moderacao de ${targetUser.username}`)
      .setColor(0x5865f2)
      .setDescription(linhas.join('\n\n'))
      .setFooter({ text: `Mostrando ${historico.length} de ${total} registro(s).` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Falha ao executar /mod history', err);
    await interaction.editReply(`Ocorreu um erro ao consultar o historico: ${err.message}`);
  }
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  const rotas = {
    warn: subWarn,
    unwarn: subUnwarn,
    warnings: subWarnings,
    mute: subMute,
    unmute: subUnmute,
    kick: subKick,
    ban: subBan,
    unban: subUnban,
    history: subHistory
  };

  const handler = rotas[sub];
  if (!handler) {
    await interaction.reply({ content: 'Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
    return;
  }

  await handler(interaction);
}

module.exports = { data, execute, validarAlvo };
