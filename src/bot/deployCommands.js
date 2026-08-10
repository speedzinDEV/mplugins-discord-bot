'use strict';

// Mantido por compatibilidade: a implementacao real do deploy agora vive em
// src/deploy-commands.js (com validacao completa e output formatado).
// Este arquivo so existe para quem ainda chama `node src/bot/deployCommands.js`
// ou `require('./bot/deployCommands')` diretamente continuar funcionando.
const { deployCommands } = require('../deploy-commands');

if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
