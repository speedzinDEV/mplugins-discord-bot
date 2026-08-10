'use strict';

const fs = require('fs');
const path = require('path');

let falhas = 0;

function ok(msg) { console.log(`[OK] ${msg}`); }
function erro(msg) { console.log(`[ERRO] ${msg}`); falhas += 1; }

console.log('-- Node.js --');
ok(`Node.js ${process.version}`);

console.log('');
console.log('-- Arquivos necessarios --');
const ARQUIVOS_NECESSARIOS = [
  'package.json',
  'src/index.js',
  'src/config/constants.js',
  'src/db/migrate.js',
  'src/deploy-commands.js'
];
const RAIZ = path.join(__dirname, '..');
for (const rel of ARQUIVOS_NECESSARIOS) {
  if (fs.existsSync(path.join(RAIZ, rel))) {
    ok(rel);
  } else {
    erro(`Arquivo ausente: ${rel}`);
  }
}

console.log('');
console.log('-- Dependencias (node_modules) --');
const DEPENDENCIAS = ['dotenv', 'discord.js', 'express', 'pg'];
for (const dep of DEPENDENCIAS) {
  try {
    require.resolve(dep);
    ok(dep);
  } catch (err) {
    erro(`Dependencia nao instalada: ${dep} (rode npm install)`);
  }
}

// A partir daqui dependemos de 'dotenv' e 'discord.js' estarem instalados.
if (falhas > 0) {
  console.log('');
  console.log(`[ERRO] ${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}

let config;
try {
  config = require('./config/constants');
} catch (err) {
  erro(`Falha ao carregar src/config/constants.js: ${err.message}`);
  console.log('');
  console.log(`[ERRO] ${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}

console.log('');
console.log('-- Configuracao Discord (.env) --');
if (config.discord.token) ok('DISCORD_TOKEN definido.');
else erro('DISCORD_TOKEN ausente no .env.');

if (config.discord.clientId) ok('CLIENT_ID definido.');
else erro('CLIENT_ID ausente no .env.');

if (config.discord.guildId) ok('GUILD_ID definido.');
else erro('GUILD_ID ausente no .env.');

console.log('');
console.log('-- Configuracao PostgreSQL (.env) --');
const db = require('./services/database');
const erroBanco = db.validarConfiguracaoBanco();
if (erroBanco) {
  erro(erroBanco.replace(/^\[ERRO\]\s*/, ''));
} else if (config.database.url) {
  ok('DATABASE_URL definida.');
} else {
  ok(`DB_HOST=${config.database.host}`);
  ok(`DB_PORT=${config.database.port}`);
  ok(`DB_NAME=${config.database.name}`);
  ok('DB_USER definido.');
}
console.log('(nenhuma senha ou DATABASE_URL completa e exibida aqui - use "npm run db:test" para testar a conexao real)');

console.log('');
console.log('-- Comandos (src/commands) --');
const { loadCommandsWithReport } = require('./bot/loadCommands');
const { commands, errors: errosComandos } = loadCommandsWithReport();

console.log(`Comandos encontrados: ${commands.size + errosComandos.length}`);
console.log(`Comandos validos: ${commands.size}`);
for (const nome of commands.keys()) {
  ok(`/${nome}`);
}
if (errosComandos.length > 0) {
  console.log('');
  console.log(`[ERRO] ${errosComandos.length} comando(s) invalido(s):`);
  for (const e of errosComandos) {
    console.log(`  - ${e.arquivo}: ${e.motivo}`);
  }
  falhas += errosComandos.length;
}

console.log('');
if (falhas === 0) {
  console.log('[OK] Checks passaram.');
  process.exit(0);
} else {
  console.log(`[ERRO] ${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}
