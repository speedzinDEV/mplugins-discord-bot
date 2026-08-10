'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('./database');
const settingsService = require('./settingsService');
const logService = require('./logService');
const { RANK_THRESHOLDS } = require('../config/ranks');

const NOMES_RANK = RANK_THRESHOLDS.map((r) => r.name);
const RANK_INICIAL = RANK_THRESHOLDS[0].name;

/**
 * Determina o rank correspondente a um total acumulado.
 * RANK_THRESHOLDS esta em ordem crescente de valor minimo.
 */
function determinarRankPorTotal(total) {
  let atual = RANK_INICIAL;
  for (const limite of RANK_THRESHOLDS) {
    if (total >= limite.min) {
      atual = limite.name;
    } else {
      break;
    }
  }
  return atual;
}

/**
 * Retorna o proximo rank e quanto falta para alcanca-lo.
 * Se o usuario ja estiver no rank maximo, proximo sera null.
 */
function calcularProximoRank(total) {
  for (const limite of RANK_THRESHOLDS) {
    if (total < limite.min) {
      return { proximo: limite.name, faltam: Number((limite.min - total).toFixed(2)) };
    }
  }
  return { proximo: null, faltam: 0 };
}

async function obterUsuario(discordId) {
  const result = await db.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
  return result.rows[0] || null;
}

async function obterOuCriarUsuario(discordId) {
  const existente = await obterUsuario(discordId);
  if (existente) return existente;

  const result = await db.query(
    `INSERT INTO users (discord_id, total_spent, current_rank)
     VALUES ($1, 0, $2)
     ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id
     RETURNING *`,
    [discordId, RANK_INICIAL]
  );
  return result.rows[0];
}

/**
 * Remove todos os cargos de recompensa que o membro possua (exceto o alvo,
 * se informado) e adiciona o cargo do rank alvo. Nunca toca em nenhum
 * outro cargo (administrativo ou nao), pois so conhece os nomes de
 * RANK_THRESHOLDS.
 */
async function aplicarRankNoDiscord(guild, member, rankAlvo) {
  if (!member) return null;

  for (const nome of NOMES_RANK) {
    if (nome === rankAlvo) continue;
    const role = guild.roles.cache.find((r) => r.name === nome);
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Atualizacao de rank mPlugins').catch(() => {});
    }
  }

  const roleAlvo = guild.roles.cache.find((r) => r.name === rankAlvo);
  if (roleAlvo && !member.roles.cache.has(roleAlvo.id)) {
    await member.roles.add(roleAlvo, 'Atualizacao de rank mPlugins');
  }

  return roleAlvo || null;
}

async function registrarHistorico(discordId, rankAnterior, rankNovo, totalSpent) {
  await db.query(
    'INSERT INTO rank_history (discord_id, old_rank, new_rank, total_spent) VALUES ($1, $2, $3, $4)',
    [discordId, rankAnterior, rankNovo, totalSpent]
  );
}

async function enviarMensagemPromocao(guild, member, rankNovo) {
  try {
    const canalIdConfigurado = await settingsService.get('canal_promocao', null);
    let canal = canalIdConfigurado ? guild.channels.cache.get(canalIdConfigurado) : null;

    if (!canal) {
      canal = guild.channels.cache.find(
        (c) => c.name === 'anuncios' && typeof c.isTextBased === 'function' && c.isTextBased()
      );
    }

    if (!canal) return;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setDescription(`Parabens ${member} voce alcancou o rank **${rankNovo}**!`);

    await canal.send({ embeds: [embed] });
  } catch (err) {
    await logService.registrar(guild, 'erro', `Falha ao enviar mensagem de promocao: ${err.message}`);
  }
}

/**
 * Ajusta o total gasto de um usuario (delta pode ser positivo ou negativo).
 * O total nunca fica negativo. Executado dentro de uma transacao para
 * evitar condicoes de corrida em ajustes concorrentes.
 */
async function ajustarGasto(discordId, delta) {
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');

    let result = await client.query('SELECT * FROM users WHERE discord_id = $1 FOR UPDATE', [discordId]);
    if (result.rowCount === 0) {
      result = await client.query(
        'INSERT INTO users (discord_id, total_spent, current_rank) VALUES ($1, 0, $2) RETURNING *',
        [discordId, RANK_INICIAL]
      );
    }

    const linha = result.rows[0];
    const totalAnterior = Number(linha.total_spent);
    const rankAnterior = linha.current_rank || RANK_INICIAL;
    const totalNovo = Math.max(0, Number((totalAnterior + delta).toFixed(2)));
    const rankNovo = determinarRankPorTotal(totalNovo);

    await client.query(
      'UPDATE users SET total_spent = $1, current_rank = $2, updated_at = NOW() WHERE discord_id = $3',
      [totalNovo, rankNovo, discordId]
    );

    await client.query('COMMIT');

    return { totalAnterior, totalNovo, rankAnterior, rankNovo, mudouRank: rankAnterior !== rankNovo };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fluxo completo de alteracao de gasto: ajusta no banco, aplica cargo no
 * Discord se o rank mudou, registra historico, log e mensagem de promocao.
 */
async function alterarGastoCompleto(guild, member, discordId, delta, quemExecutou) {
  const resultado = await ajustarGasto(discordId, delta);

  await logService.registrar(
    guild,
    'gasto',
    `${quemExecutou} alterou o gasto de ${discordId} em ${delta >= 0 ? '+' : ''}${delta}. ` +
      `Total: ${resultado.totalAnterior} -> ${resultado.totalNovo}.`
  );

  if (resultado.mudouRank) {
    await aplicarRankNoDiscord(guild, member, resultado.rankNovo);
    await registrarHistorico(discordId, resultado.rankAnterior, resultado.rankNovo, resultado.totalNovo);
    await logService.registrar(
      guild,
      'promocao',
      `${discordId} mudou de rank: ${resultado.rankAnterior} -> ${resultado.rankNovo}.`
    );

    const subiu = NOMES_RANK.indexOf(resultado.rankNovo) > NOMES_RANK.indexOf(resultado.rankAnterior);
    if (subiu && member) {
      await enviarMensagemPromocao(guild, member, resultado.rankNovo);
    }
  }

  return resultado;
}

/**
 * Define manualmente o rank de um usuario (sem alterar o total gasto).
 */
async function definirRankManual(guild, member, discordId, rankNome, quemExecutou) {
  if (!NOMES_RANK.includes(rankNome)) {
    throw new Error(`Rank invalido: ${rankNome}`);
  }

  const usuario = await obterOuCriarUsuario(discordId);
  const rankAnterior = usuario.current_rank || RANK_INICIAL;

  await db.query(
    'UPDATE users SET current_rank = $1, updated_at = NOW() WHERE discord_id = $2',
    [rankNome, discordId]
  );

  await aplicarRankNoDiscord(guild, member, rankNome);
  await registrarHistorico(discordId, rankAnterior, rankNome, Number(usuario.total_spent));

  await logService.registrar(
    guild,
    'admin',
    `${quemExecutou} definiu manualmente o rank de ${discordId}: ${rankAnterior} -> ${rankNome}.`
  );

  return { rankAnterior, rankNovo: rankNome };
}

async function topRanking(limit = 10) {
  const result = await db.query(
    'SELECT discord_id, total_spent, current_rank FROM users ORDER BY total_spent DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Percorre os usuarios registrados no banco e corrige qualquer divergencia
 * entre o rank calculado a partir do total gasto e o cargo real no Discord.
 */
async function sincronizarTodos(guild, quemExecutou) {
  await guild.members.fetch();

  const result = await db.query('SELECT * FROM users');
  let verificados = 0;
  let corrigidos = 0;

  for (const linha of result.rows) {
    verificados += 1;
    const member = guild.members.cache.get(linha.discord_id);
    if (!member) continue;

    const rankEsperado = determinarRankPorTotal(Number(linha.total_spent));
    const roleEsperado = guild.roles.cache.find((r) => r.name === rankEsperado);
    const possuiRoleCorreto = roleEsperado ? member.roles.cache.has(roleEsperado.id) : false;
    const possuiOutroRoleDeRank = NOMES_RANK.some((nome) => {
      if (nome === rankEsperado) return false;
      const role = guild.roles.cache.find((r) => r.name === nome);
      return role && member.roles.cache.has(role.id);
    });

    const precisaCorrigir = !possuiRoleCorreto || possuiOutroRoleDeRank || linha.current_rank !== rankEsperado;

    if (precisaCorrigir) {
      await aplicarRankNoDiscord(guild, member, rankEsperado);

      if (linha.current_rank !== rankEsperado) {
        await registrarHistorico(linha.discord_id, linha.current_rank, rankEsperado, Number(linha.total_spent));
      }

      await db.query(
        'UPDATE users SET current_rank = $1, updated_at = NOW() WHERE discord_id = $2',
        [rankEsperado, linha.discord_id]
      );

      corrigidos += 1;
    }
  }

  await logService.registrar(
    guild,
    'sincronizacao',
    `${quemExecutou} executou /syncroles. Verificados: ${verificados}. Corrigidos: ${corrigidos}.`
  );

  return { verificados, corrigidos };
}

module.exports = {
  determinarRankPorTotal,
  calcularProximoRank,
  obterUsuario,
  obterOuCriarUsuario,
  aplicarRankNoDiscord,
  registrarHistorico,
  ajustarGasto,
  alterarGastoCompleto,
  definirRankManual,
  topRanking,
  sincronizarTodos,
  NOMES_RANK,
  RANK_INICIAL
};
