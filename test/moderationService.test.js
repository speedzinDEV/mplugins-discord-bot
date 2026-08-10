'use strict';

// Teste unitario offline da Fase 2 (moderacao), sem Discord ou PostgreSQL
// reais. Roda com: node test/moderationService.test.js

const assert = require('assert');

let falhas = 0;
let total = 0;

function teste(nome, fn) {
  total += 1;
  try {
    fn();
    console.log(`[OK] ${nome}`);
  } catch (err) {
    falhas += 1;
    console.log(`[ERRO] ${nome}`);
    console.log(`       ${err.message}`);
  }
}

async function testeAsync(nome, fn) {
  total += 1;
  try {
    await fn();
    console.log(`[OK] ${nome}`);
  } catch (err) {
    falhas += 1;
    console.log(`[ERRO] ${nome}`);
    console.log(`       ${err.message}`);
  }
}

// ---- Mocks injetados no require.cache ANTES de carregar os modulos reais,
// para nao depender de PostgreSQL real. ----

const databasePath = require.resolve('../src/services/database');
let chamouQueryIndevidamente = false;
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    async query() {
      chamouQueryIndevidamente = true;
      throw new Error('db.query nao deveria ter sido chamado neste teste.');
    },
    getPool() {
      throw new Error('getPool nao deveria ter sido chamado neste teste.');
    }
  }
};

const settingsPath = require.resolve('../src/services/settingsService');
const configuracoesFalsas = {};
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    async get(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(configuracoesFalsas, key) ? configuracoesFalsas[key] : fallback;
    },
    async set(key, value) {
      configuracoesFalsas[key] = String(value);
    }
  }
};

process.env.OWNER_ID = process.env.OWNER_ID || '111111111111111111';
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'stub';
process.env.CLIENT_ID = process.env.CLIENT_ID || 'stub';
process.env.GUILD_ID = process.env.GUILD_ID || 'stub';

const moderationService = require('../src/services/moderationService');
const { validarAlvo } = require('../src/commands/mod');

// ---- Fakes minimos, sem depender de discord.js real ----
function criarCargo(id, nome) {
  return { id, name: nome, position: 0 };
}

function criarGuild({ ownerId = 'guild-owner-id', cargos = [] } = {}) {
  const rolesMap = new Map(cargos.map((c) => [c.id, c]));
  return {
    ownerId,
    roles: { cache: { has: (id) => rolesMap.has(id), find: (fn) => Array.from(rolesMap.values()).find(fn) } },
    members: {
      fetch: async (id) => guildMembersFake.get(id) || null
    }
  };
}

let guildMembersFake;

function criarMember({ id, temAdministrator = false, cargosIds = [] } = {}) {
  const setCargos = new Set(cargosIds);
  return {
    id,
    permissions: { has: () => temAdministrator },
    roles: { cache: { has: (roleId) => setCargos.has(roleId) } }
  };
}

async function rodarTestes() {
  await testeAsync('registrarPunicao rejeita tipo invalido sem tocar no banco', async () => {
    await assert.rejects(
      () => moderationService.registrarPunicao({ guildId: '1', discordId: '2', moderatorId: '3', type: 'invalido', reason: 'x' }),
      /Tipo de punicao invalido/
    );
    assert.strictEqual(chamouQueryIndevidamente, false, 'db.query foi chamado indevidamente para um tipo invalido');
  });

  await testeAsync('validarAlvo bloqueia auto-moderacao', async () => {
    const guild = criarGuild();
    guildMembersFake = new Map();
    const interaction = {
      user: { id: 'exec-1' },
      member: criarMember({ id: 'exec-1', temAdministrator: true }),
      guild,
      client: { user: { id: 'bot-id' } }
    };
    const alvo = { id: 'exec-1' };
    const erro = await validarAlvo(interaction, alvo);
    assert.ok(erro && /si mesmo/.test(erro));
  });

  await testeAsync('validarAlvo bloqueia moderar o proprio bot', async () => {
    const guild = criarGuild();
    guildMembersFake = new Map();
    const interaction = {
      user: { id: 'exec-1' },
      member: criarMember({ id: 'exec-1', temAdministrator: true }),
      guild,
      client: { user: { id: 'bot-id' } }
    };
    const alvo = { id: 'bot-id' };
    const erro = await validarAlvo(interaction, alvo);
    assert.ok(erro && /proprio bot/.test(erro));
  });

  await testeAsync('validarAlvo bloqueia moderar alguem de nivel igual ou superior', async () => {
    const guild = criarGuild();
    const execMember = criarMember({ id: 'moderador-1' }); // sem Administrator -> nivel USER
    const alvoMember = criarMember({ id: 'admin-alvo', temAdministrator: true }); // nivel ADMIN
    guildMembersFake = new Map([['admin-alvo', alvoMember]]);

    const interaction = {
      user: { id: 'moderador-1' },
      member: execMember,
      guild,
      client: { user: { id: 'bot-id' } }
    };
    const erro = await validarAlvo(interaction, { id: 'admin-alvo' });
    assert.ok(erro && /nivel de permissao/.test(erro));
  });

  await testeAsync('validarAlvo libera quando o alvo tem nivel inferior ao executor', async () => {
    const guild = criarGuild();
    const execMember = criarMember({ id: 'admin-exec', temAdministrator: true }); // ADMIN
    const alvoMember = criarMember({ id: 'usuario-comum' }); // USER
    guildMembersFake = new Map([['usuario-comum', alvoMember]]);

    const interaction = {
      user: { id: 'admin-exec' },
      member: execMember,
      guild,
      client: { user: { id: 'bot-id' } }
    };
    const erro = await validarAlvo(interaction, { id: 'usuario-comum' });
    assert.strictEqual(erro, null);
  });

  console.log('');
  console.log(`Total: ${total}  |  OK: ${total - falhas}  |  Falhas: ${falhas}`);
  process.exit(falhas > 0 ? 1 : 0);
}

rodarTestes();
