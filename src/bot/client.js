'use strict';

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { loadCommands } = require('./loadCommands');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  client.commands = new Collection(loadCommands());

  return client;
}

module.exports = { createClient };
