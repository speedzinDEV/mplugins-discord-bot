'use strict';

// Teste unitario offline do formatador de transcript (Fase 3 - tickets).
// Roda com: node test/ticketService.test.js

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

const settingsPath = require.resolve('../src/services/settingsService');
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: { async get(_k, fallback = null) { return fallback; }, async set() {} }
};

const databasePath = require.resolve('../src/services/database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: { async query() { throw new Error('db.query nao deveria ser chamado neste teste.'); } }
};

process.env.OWNER_ID = process.env.OWNER_ID || '1';
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'stub';
process.env.CLIENT_ID = process.env.CLIENT_ID || 'stub';
process.env.GUILD_ID = process.env.GUILD_ID || 'stub';

const { formatarTranscript } = require('../src/services/ticketService');

teste('formatarTranscript inclui autor, conteudo, anexos e cabecalho', () => {
  const canal = { name: 'ticket-fulano', id: '999' };
  const mensagens = [
    {
      author: { tag: 'Fulano#0001', id: '111' },
      createdTimestamp: Date.parse('2026-01-01T10:00:00Z'),
      content: 'Ola, preciso de ajuda',
      attachments: new Map()
    },
    {
      author: { tag: 'Suporte#0002', id: '222' },
      createdTimestamp: Date.parse('2026-01-01T10:05:00Z'),
      content: 'Claro, me conte mais',
      attachments: new Map([['a1', { url: 'https://exemplo.com/print.png' }]])
    }
  ];

  const texto = formatarTranscript(canal, mensagens);

  assert.ok(texto.includes('ticket-fulano'));
  assert.ok(texto.includes('Total de mensagens: 2'));
  assert.ok(texto.includes('Fulano#0001'));
  assert.ok(texto.includes('Ola, preciso de ajuda'));
  assert.ok(texto.includes('Suporte#0002'));
  assert.ok(texto.includes('https://exemplo.com/print.png'));
});

teste('formatarTranscript funciona com zero mensagens', () => {
  const canal = { name: 'ticket-vazio', id: '1' };
  const texto = formatarTranscript(canal, []);
  assert.ok(texto.includes('Total de mensagens: 0'));
});

console.log('');
console.log(`Total: ${total}  |  OK: ${total - falhas}  |  Falhas: ${falhas}`);
process.exit(falhas > 0 ? 1 : 0);
