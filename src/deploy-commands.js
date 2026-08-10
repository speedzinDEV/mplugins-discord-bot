'use strict';

const { REST, Routes } = require('discord.js');
const config = require('./config/constants');
const logger = require('./utils/logger');
const { loadCommandsWithReport } = require('./bot/loadCommands');

const LINHA = '========================================';

/**
 * Formata um comando (incluindo subcomandos, quando existirem) para o
 * log de saida, ex: "setup", "setup status", "setup cleanup".
 */
function listarLinhasDoComando(json) {
  const SUBCOMMAND = 1;
  const SUBCOMMAND_GROUP = 2;

  const subcomandos = (json.options || []).filter(
    (opt) => opt.type === SUBCOMMAND || opt.type === SUBCOMMAND_GROUP
  );

  if (subcomandos.length === 0) {
    return [json.name];
  }

  const linhas = [];
  for (const sub of subcomandos) {
    if (sub.type === SUBCOMMAND_GROUP) {
      for (const inner of sub.options || []) {
        linhas.push(`${json.name} ${sub.name} ${inner.name}`);
      }
    } else {
      linhas.push(`${json.name} ${sub.name}`);
    }
  }
  return linhas;
}

function validarVariaveisDeAmbiente() {
  const faltando = [];
  if (!config.discord.token) faltando.push('DISCORD_TOKEN');
  if (!config.discord.clientId) faltando.push('CLIENT_ID');
  if (!config.discord.guildId) faltando.push('GUILD_ID');

  if (faltando.length > 0) {
    logger.error(`Variavel(is) de ambiente ausente(s) no .env: ${faltando.join(', ')}`);
    logger.error('Configure o arquivo .env (veja .env.example) antes de rodar o deploy.');
    return false;
  }
  return true;
}

async function verificarGuild(rest, guildId) {
  try {
    const guilds = await rest.get(Routes.userGuilds());
    const encontrada = Array.isArray(guilds) && guilds.some((g) => g.id === guildId);
    if (!encontrada) {
      logger.warn(
        `O bot nao encontrou a guild ${guildId} (GUILD_ID do .env). ` +
          'Verifique se o GUILD_ID esta correto e se o bot foi convidado para esse servidor ' +
          'com os escopos "bot" e "applications.commands".'
      );
    }
    return encontrada;
  } catch (err) {
    // Nao bloqueia o deploy por causa disso - e apenas um aviso extra.
    logger.warn(`Nao foi possivel verificar se o bot esta na guild configurada: ${err.message}`);
    return null;
  }
}

async function deployCommands() {
  console.log(LINHA);
  console.log('mPlugins Discord Bot');
  console.log('Command Deployment');
  console.log(LINHA);

  if (!validarVariaveisDeAmbiente()) {
    process.exitCode = 1;
    return;
  }

  const guildIdOculto = config.discord.guildId.length > 4
    ? `${config.discord.guildId.slice(0, 2)}${'*'.repeat(config.discord.guildId.length - 4)}${config.discord.guildId.slice(-2)}`
    : config.discord.guildId;

  console.log('');
  console.log('Guild:');
  console.log(guildIdOculto);

  const { commands, errors } = loadCommandsWithReport();

  console.log('');
  console.log('Commands found:');
  console.log(String(commands.size));

  if (errors.length > 0) {
    console.log('');
    console.log(`[WARN] ${errors.length} arquivo(s) com problema (ignorado(s)):`);
    for (const erro of errors) {
      console.log(`  [ERRO] ${erro.arquivo}: ${erro.motivo}`);
    }
  }

  if (commands.size === 0) {
    console.log('');
    logger.error('Nenhum comando valido encontrado em src/commands. Nada para registrar.');
    process.exitCode = 1;
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  await verificarGuild(rest, config.discord.guildId);

  console.log('');
  console.log('Deploying...');
  console.log('');

  const body = [];
  for (const comando of commands.values()) {
    const json = comando.data.toJSON();
    body.push(json);
    for (const linha of listarLinhasDoComando(json)) {
      console.log(`[OK] ${linha}`);
    }
  }

  try {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
  } catch (err) {
    console.log('');
    logger.error('Falha ao registrar comandos na API do Discord', err);
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(LINHA);
  console.log('[OK] Slash Commands registrados');
  console.log(LINHA);
}

if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
