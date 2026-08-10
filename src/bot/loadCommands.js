'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/**
 * Carrega e valida todos os comandos de src/commands.
 *
 * Retorna um relatorio completo:
 *  - commands: Map<nomeComando, modulo>  (apenas comandos validos)
 *  - errors:   array de { arquivo, motivo } para comandos invalidos/ignorados
 *
 * Isso e usado tanto pelo bot em runtime (que so precisa dos comandos validos)
 * quanto pelo deploy/check (que precisam saber exatamente o que deu errado e onde).
 */
function loadCommandsWithReport() {
  const commands = new Map();
  const errors = [];

  let arquivos;
  try {
    arquivos = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));
  } catch (err) {
    errors.push({ arquivo: COMMANDS_DIR, motivo: `Nao foi possivel ler o diretorio de comandos: ${err.message}` });
    return { commands, errors };
  }

  for (const arquivo of arquivos) {
    const caminho = path.join(COMMANDS_DIR, arquivo);

    let comando;
    try {
      delete require.cache[require.resolve(caminho)];
      comando = require(caminho);
    } catch (err) {
      errors.push({ arquivo, motivo: `Erro ao importar o arquivo: ${err.message}` });
      continue;
    }

    if (!comando || !comando.data) {
      errors.push({ arquivo, motivo: 'Arquivo nao exporta "data" (esperado: { data, execute }).' });
      continue;
    }

    if (typeof comando.execute !== 'function') {
      errors.push({ arquivo, motivo: 'Arquivo nao exporta uma funcao "execute".' });
      continue;
    }

    if (typeof comando.data.toJSON !== 'function') {
      errors.push({ arquivo, motivo: '"data" nao possui o metodo toJSON() (nao parece ser um SlashCommandBuilder valido).' });
      continue;
    }

    let json;
    try {
      json = comando.data.toJSON();
    } catch (err) {
      errors.push({ arquivo, motivo: `Falha ao chamar data.toJSON(): ${err.message}` });
      continue;
    }

    if (!json.name) {
      errors.push({ arquivo, motivo: 'Comando sem "name" definido.' });
      continue;
    }

    if (!json.description) {
      errors.push({ arquivo, motivo: `Comando "${json.name}" sem "description" definida.` });
      continue;
    }

    if (commands.has(json.name)) {
      const primeiroArquivo = commands.get(json.name).__arquivo;
      errors.push({
        arquivo,
        motivo: `Comando duplicado: "/${json.name}" ja foi registrado em ${primeiroArquivo}.`
      });
      continue;
    }

    // marca de onde veio, usada so para a mensagem de duplicado acima.
    Object.defineProperty(comando, '__arquivo', { value: arquivo, enumerable: false });
    commands.set(json.name, comando);
  }

  return { commands, errors };
}

/**
 * Compatibilidade com o restante do projeto: apenas o Map de comandos validos.
 * Comandos invalidos sao avisados no log, mas nao derrubam o carregamento.
 */
function loadCommands() {
  const { commands, errors } = loadCommandsWithReport();

  for (const erro of errors) {
    logger.warn(`Comando invalido ignorado (${erro.arquivo}): ${erro.motivo}`);
  }

  logger.info(`${commands.size} comando(s) carregado(s) de src/commands.`);
  return commands;
}

module.exports = { loadCommands, loadCommandsWithReport, COMMANDS_DIR };
