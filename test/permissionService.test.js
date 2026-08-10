'use strict';

// Teste unitario offline do PermissionService, sem Discord ou PostgreSQL
// reais (secao 31 do refinamento: "nao exigir Discord real para testes
// unitarios; utilizar mocks quando necessario").
//
// Roda com: node test/permissionService.test.js

const path = require('path');
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

// ---- Mock de settingsService, injetado no require.cache ANTES de carregar
// permissionService, para nao depender de PostgreSQL real. ----
const settingsPath = require.resolve('../src/services/settingsService');
const configuracoesFalsas = {};
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    async get(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(configuracoesFalsas, key)
        ? configuracoesFalsas[key]
        : fallback;
    },
    async set(key, value) {
      configuracoesFalsas[key] = String(value);
    }
  }
};

process.env.OWNER_ID = '111111111111111111';
process.env.DISCORD_TOKEN = 'stub';
process.env.CLIENT_ID = 'stub';
process.env.GUILD_ID = 'stub';

const permissionService = require('../src/services/permissionService');
const { LEVELS } = permissionService;

// ---- Fakes minimos de guild/member/role, sem depender de discord.js real ----
function criarCargo(id, nome) {
  return { id, name: nome, position: 0 };
}

function criarGuild({ ownerId = 'guild-owner-id', cargos = [] } = {}) {
  const rolesMap = new Map(cargos.map((c) => [c.id, c]));
  return {
    ownerId,
    roles: {
      cache: {
        has: (id) => rolesMap.has(id),
        find: (fn) => Array.from(rolesMap.values()).find(fn)
      }
    }
  };
}

function criarMember({ id, temAdministrator = false, cargosIds = [] } = {}) {
  const setCargos = new Set(cargosIds);
  return {
    id,
    permissions: { has: () => temAdministrator },
    roles: { cache: { has: (roleId) => setCargos.has(roleId) } }
  };
}

async function rodarTestes() {
  teste('LEVELS esta em ordem crescente correta', () => {
    assert.ok(LEVELS.USER < LEVELS.HELPER);
    assert.ok(LEVELS.HELPER < LEVELS.SUPPORT);
    assert.ok(LEVELS.SUPPORT < LEVELS.MODERATOR);
    assert.ok(LEVELS.MODERATOR < LEVELS.ADMIN);
    assert.ok(LEVELS.ADMIN < LEVELS.BOT_MANAGER);
    assert.ok(LEVELS.BOT_MANAGER < LEVELS.OWNER);
  });

  await testeAsync('OWNER_ID sempre resulta em nivel OWNER', async () => {
    const guild = criarGuild();
    const member = criarMember({ id: process.env.OWNER_ID });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.OWNER);
  });

  await testeAsync('Dono do servidor (guild.ownerId) resulta em nivel OWNER mesmo sem OWNER_ID', async () => {
    const guild = criarGuild({ ownerId: 'dono-do-servidor' });
    const member = criarMember({ id: 'dono-do-servidor' });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.OWNER);
  });

  await testeAsync('Membro comum sem cargos e nivel USER', async () => {
    const guild = criarGuild();
    const member = criarMember({ id: 'membro-comum' });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.USER);
  });

  await testeAsync('Permissao Administrator nativa do Discord conta como ADMIN', async () => {
    const guild = criarGuild();
    const member = criarMember({ id: 'admin-nativo', temAdministrator: true });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.ADMIN);
  });

  await testeAsync('Cargo com nome "Suporte" concede nivel SUPPORT (fallback por nome)', async () => {
    const cargoSuporte = criarCargo('role-suporte', 'Suporte');
    const guild = criarGuild({ cargos: [cargoSuporte] });
    const member = criarMember({ id: 'membro-suporte', cargosIds: ['role-suporte'] });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.SUPPORT);
  });

  await testeAsync('bot_manager_role_id configurado concede nivel BOT_MANAGER', async () => {
    const cargoManager = criarCargo('role-manager', 'Gerente do Bot');
    const guild = criarGuild({ cargos: [cargoManager] });
    await permissionService.hasBotManager; // no-op, so garante que o modulo carregou
    configuracoesFalsas.bot_manager_role_id = 'role-manager';

    const member = criarMember({ id: 'membro-manager', cargosIds: ['role-manager'] });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.BOT_MANAGER);

    delete configuracoesFalsas.bot_manager_role_id;
  });

  await testeAsync('Cargo de Bot Manager apagado do servidor NAO concede o nivel (sem travar acesso)', async () => {
    // Guild sem o cargo (foi apagado), mas settings ainda aponta pra ele.
    const guild = criarGuild({ cargos: [] });
    configuracoesFalsas.bot_manager_role_id = 'role-que-nao-existe-mais';

    const member = criarMember({ id: 'membro-x', cargosIds: ['role-que-nao-existe-mais'] });
    const nivel = await permissionService.getMemberLevel(guild, member);
    assert.strictEqual(nivel, LEVELS.USER);

    // Mas o dono do servidor continua com acesso total mesmo assim.
    const dono = criarMember({ id: guild.ownerId });
    const nivelDono = await permissionService.getMemberLevel(guild, dono);
    assert.strictEqual(nivelDono, LEVELS.OWNER);

    delete configuracoesFalsas.bot_manager_role_id;
  });

  await testeAsync('canManageSpent exige ADMIN ou superior (usuario comum nao pode)', async () => {
    const guild = criarGuild();
    const comum = criarMember({ id: 'usuario-comum' });
    const admin = criarMember({ id: 'admin', temAdministrator: true });

    assert.strictEqual(await permissionService.canManageSpent(guild, comum), false);
    assert.strictEqual(await permissionService.canManageSpent(guild, admin), true);
  });

  await testeAsync('canManageTickets exige SUPPORT ou superior', async () => {
    const cargoSuporte = criarCargo('role-suporte-2', 'Suporte');
    const guild = criarGuild({ cargos: [cargoSuporte] });
    const comum = criarMember({ id: 'usuario-comum-2' });
    const suporte = criarMember({ id: 'staff-suporte', cargosIds: ['role-suporte-2'] });

    assert.strictEqual(await permissionService.canManageTickets(guild, comum), false);
    assert.strictEqual(await permissionService.canManageTickets(guild, suporte), true);
  });

  await testeAsync('verificarBotManagerRole detecta configuracao ausente vs apagada vs valida', async () => {
    const guild = criarGuild({ cargos: [criarCargo('role-existe', 'Gerente')] });

    delete configuracoesFalsas.bot_manager_role_id;
    let r = await permissionService.verificarBotManagerRole(guild);
    assert.strictEqual(r.configurado, false);

    configuracoesFalsas.bot_manager_role_id = 'role-nao-existe';
    r = await permissionService.verificarBotManagerRole(guild);
    assert.strictEqual(r.configurado, true);
    assert.strictEqual(r.existe, false);

    configuracoesFalsas.bot_manager_role_id = 'role-existe';
    r = await permissionService.verificarBotManagerRole(guild);
    assert.strictEqual(r.configurado, true);
    assert.strictEqual(r.existe, true);

    delete configuracoesFalsas.bot_manager_role_id;
  });

  console.log('');
  console.log(`Total: ${total}  |  OK: ${total - falhas}  |  Falhas: ${falhas}`);
  process.exit(falhas > 0 ? 1 : 0);
}

rodarTestes();
