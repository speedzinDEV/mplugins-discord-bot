'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { SETUP_ROLES } = require('../config/roles');
const { SETUP_STRUCTURE } = require('../config/channels');
const registryService = require('./registryService');
const db = require('./database');
const logger = require('./../utils/logger');
const ticketService = require('./ticketService');
const permissionService = require('./permissionService');

const TIPOS_CANAL = {
  text: ChannelType.GuildText,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum
};

/**
 * Monta os PermissionOverwrites de um canal de acordo com a visibilidade.
 */
function buildOverwrites(guild, visibility) {
  const everyoneId = guild.roles.everyone.id;

  if (visibility === 'read-only') {
    return [
      {
        id: everyoneId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ];
  }

  if (visibility === 'staff-only') {
    return [
      {
        id: everyoneId,
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ];
  }

  // 'community'
  return [
    {
      id: everyoneId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseApplicationCommands
      ]
    }
  ];
}

/**
 * Cria os cargos definidos em SETUP_ROLES, respeitando a ordem de hierarquia
 * e evitando duplicacao caso ja existam (verificado via registry).
 */
async function criarCargos(guild) {
  const criados = [];
  const existentes = await registryService.listar(guild.id, 'role');
  const nomesExistentes = new Set(existentes.map((r) => r.nome));

  for (const definicao of SETUP_ROLES) {
    if (nomesExistentes.has(definicao.name)) {
      continue;
    }

    const cargoAtual = guild.roles.cache.find((r) => r.name === definicao.name);
    if (cargoAtual) {
      await registryService.registrar(guild.id, 'role', definicao.name, cargoAtual.id);
      continue;
    }

    const role = await guild.roles.create({
      name: definicao.name,
      color: definicao.color,
      permissions: [],
      mentionable: false,
      reason: 'Criado automaticamente pelo /setup da mPlugins'
    });

    await registryService.registrar(guild.id, 'role', definicao.name, role.id);
    criados.push(role);
  }

  // Garante a ordem correta de hierarquia (do primeiro = mais baixo, ao ultimo = mais alto).
  if (criados.length > 0) {
    try {
      const botMember = await guild.members.fetchMe();
      const botTopPosition = botMember.roles.highest.position;

      const posicoes = SETUP_ROLES
        .map((definicao) => guild.roles.cache.find((r) => r.name === definicao.name))
        .filter(Boolean)
        .map((role, index) => ({
          role,
          position: Math.max(1, botTopPosition - (SETUP_ROLES.length - index))
        }));

      if (posicoes.length > 0) {
        await guild.roles.setPositions(posicoes);
      }
    } catch (err) {
      logger.warn(`Nao foi possivel reordenar a hierarquia dos cargos: ${err.message}`);
    }
  }

  return criados;
}

/**
 * Cria categorias e canais definidos em SETUP_STRUCTURE, evitando duplicacao.
 */
async function criarCategoriasECanais(guild) {
  const criados = { categorias: [], canais: [] };

  for (const bloco of SETUP_STRUCTURE) {
    let categoria = null;
    const registroCategoria = await registryService.existePorNome(guild.id, 'category', bloco.category);

    if (registroCategoria) {
      categoria = guild.channels.cache.get(registroCategoria.object_id) || null;
    }

    if (!categoria) {
      categoria = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === bloco.category
      );
    }

    if (!categoria) {
      categoria = await guild.channels.create({
        name: bloco.category,
        type: ChannelType.GuildCategory,
        permissionOverwrites: buildOverwrites(guild, bloco.visibility),
        reason: 'Criado automaticamente pelo /setup da mPlugins'
      });
      await registryService.registrar(guild.id, 'category', bloco.category, categoria.id);
      criados.categorias.push(categoria);
    } else {
      await registryService.registrar(guild.id, 'category', bloco.category, categoria.id);
    }

    for (const defCanal of bloco.channels) {
      const nomeBase = typeof defCanal === 'string' ? defCanal : defCanal.name;
      const emoji = typeof defCanal === 'string' ? null : defCanal.emoji;
      const tipoChave = typeof defCanal === 'string' ? 'text' : defCanal.type || 'text';
      const visibilidadeCanal = typeof defCanal === 'string' ? bloco.visibility : defCanal.visibility || bloco.visibility;
      const tipoDiscord = TIPOS_CANAL[tipoChave] || ChannelType.GuildText;

      // Nome final exibido no Discord, com o emoji prefixado (padrao usado
      // por praticamente todo servidor com categorias tematicas).
      const nomeExibido = emoji ? `${emoji}・${nomeBase}` : nomeBase;
      // Chave de registro estavel (nao muda se so o emoji for ajustado no futuro).
      const chaveRegistro = nomeBase;

      const registroCanal = await registryService.existePorNome(guild.id, 'channel', chaveRegistro);
      let canal = null;

      if (registroCanal) {
        canal = guild.channels.cache.get(registroCanal.object_id) || null;
      }

      if (!canal) {
        canal = guild.channels.cache.find(
          (c) => c.parentId === categoria.id && (c.name === nomeExibido || c.name === nomeBase)
        );
      }

      if (!canal) {
        canal = await guild.channels.create({
          name: nomeExibido,
          type: tipoDiscord,
          parent: categoria.id,
          permissionOverwrites: buildOverwrites(guild, visibilidadeCanal),
          reason: 'Criado automaticamente pelo /setup da mPlugins'
        });
        await registryService.registrar(guild.id, 'channel', chaveRegistro, canal.id);
        criados.canais.push(canal);
      } else {
        await registryService.registrar(guild.id, 'channel', chaveRegistro, canal.id);
      }

      if (chaveRegistro === 'tickets' && canal) {
        try {
          await ticketService.postarPainelSeNecessario(canal);
        } catch (err) {
          logger.warn(`Nao foi possivel publicar o painel de tickets: ${err.message}`);
        }
      }
    }
  }

  return criados;
}

async function executarSetup(guild) {
  const cargosCriados = await criarCargos(guild);
  const estrutura = await criarCategoriasECanais(guild);

  return {
    cargosCriados: cargosCriados.length,
    categoriasCriadas: estrutura.categorias.length,
    canaisCriados: estrutura.canais.length
  };
}

async function obterStatus(guild) {
  const status = { itens: [] };

  const dbCheck = await db.testConnection();
  status.itens.push({
    nome: 'Banco de dados',
    estado: dbCheck.ok ? 'OK' : 'ERROR',
    detalhe: dbCheck.ok ? 'Conexao ativa' : dbCheck.error
  });

  const botMember = await guild.members.fetchMe();
  status.itens.push({
    nome: 'Bot',
    estado: 'OK',
    detalhe: `Online como ${botMember.user.tag}`
  });

  status.itens.push({
    nome: 'Guild',
    estado: 'OK',
    detalhe: `${guild.name} (${guild.memberCount} membros)`
  });

  const cargosRegistrados = await registryService.listar(guild.id, 'role');
  const cargosFaltando = cargosRegistrados.filter((r) => !guild.roles.cache.has(r.object_id));
  status.itens.push({
    nome: 'Cargos',
    estado: cargosRegistrados.length === 0 ? 'WARN' : cargosFaltando.length > 0 ? 'WARN' : 'OK',
    detalhe:
      cargosRegistrados.length === 0
        ? 'Setup ainda nao foi executado'
        : `${cargosRegistrados.length - cargosFaltando.length}/${cargosRegistrados.length} presentes`
  });

  const categoriasRegistradas = await registryService.listar(guild.id, 'category');
  const categoriasFaltando = categoriasRegistradas.filter((c) => !guild.channels.cache.has(c.object_id));
  status.itens.push({
    nome: 'Categorias',
    estado: categoriasRegistradas.length === 0 ? 'WARN' : categoriasFaltando.length > 0 ? 'WARN' : 'OK',
    detalhe:
      categoriasRegistradas.length === 0
        ? 'Setup ainda nao foi executado'
        : `${categoriasRegistradas.length - categoriasFaltando.length}/${categoriasRegistradas.length} presentes`
  });

  const canaisRegistrados = await registryService.listar(guild.id, 'channel');
  const canaisFaltando = canaisRegistrados.filter((c) => !guild.channels.cache.has(c.object_id));
  status.itens.push({
    nome: 'Canais',
    estado: canaisRegistrados.length === 0 ? 'WARN' : canaisFaltando.length > 0 ? 'WARN' : 'OK',
    detalhe:
      canaisRegistrados.length === 0
        ? 'Setup ainda nao foi executado'
        : `${canaisRegistrados.length - canaisFaltando.length}/${canaisRegistrados.length} presentes`
  });

  const botTopRole = botMember.roles.highest;
  const cargoMaisAlto = SETUP_ROLES[SETUP_ROLES.length - 1];
  const roleMaisAlto = guild.roles.cache.find((r) => r.name === cargoMaisAlto.name);
  const hierarquiaOk = !roleMaisAlto || botTopRole.position > roleMaisAlto.position;
  status.itens.push({
    nome: 'Permissoes',
    estado: hierarquiaOk ? 'OK' : 'ERROR',
    detalhe: hierarquiaOk
      ? 'Bot esta acima dos cargos de recompensa'
      : 'Bot esta ABAIXO de algum cargo criado pelo setup. Mova o cargo do bot para cima.'
  });

  const botManager = await permissionService.verificarBotManagerRole(guild);
  status.itens.push({
    nome: 'Bot Manager',
    estado: !botManager.configurado ? 'WARN' : botManager.existe ? 'OK' : 'ERROR',
    detalhe: !botManager.configurado
      ? 'Nenhum cargo de Bot Manager configurado (use /setup manager-role). OWNER_ID e o dono do servidor continuam com acesso total.'
      : botManager.existe
        ? 'Cargo configurado e presente no servidor.'
        : 'O cargo configurado foi apagado do servidor. Configure novamente com /setup manager-role.'
  });

  return status;
}

async function executarCleanup(guild) {
  const removidos = { cargos: 0, categorias: 0, canais: 0 };

  const canais = await registryService.listar(guild.id, 'channel');
  for (const registro of canais) {
    const canal = guild.channels.cache.get(registro.object_id);
    if (canal) {
      await canal.delete('Cleanup executado via /setup cleanup');
    }
    await registryService.remover(guild.id, 'channel', registro.object_id);
    removidos.canais += 1;
  }

  const categorias = await registryService.listar(guild.id, 'category');
  for (const registro of categorias) {
    const categoria = guild.channels.cache.get(registro.object_id);
    if (categoria) {
      await categoria.delete('Cleanup executado via /setup cleanup');
    }
    await registryService.remover(guild.id, 'category', registro.object_id);
    removidos.categorias += 1;
  }

  const cargos = await registryService.listar(guild.id, 'role');
  for (const registro of cargos) {
    const cargo = guild.roles.cache.get(registro.object_id);
    if (cargo) {
      await cargo.delete('Cleanup executado via /setup cleanup');
    }
    await registryService.remover(guild.id, 'role', registro.object_id);
    removidos.cargos += 1;
  }

  return removidos;
}

module.exports = { executarSetup, obterStatus, executarCleanup };
