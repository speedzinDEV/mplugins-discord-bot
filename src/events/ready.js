'use strict';

const { Events } = require('discord.js');
const logger = require('../utils/logger');

const name = Events.ClientReady;
const once = true;

async function execute(client) {
  logger.ok(`Bot conectado como ${client.user.tag} (${client.user.id})`);
  logger.info(`Presente em ${client.guilds.cache.size} guild(s).`);
  client.user.setActivity('mPlugins | /setup help', { type: 3 }); // 3 = Watching
}

module.exports = { name, once, execute };
