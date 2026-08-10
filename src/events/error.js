'use strict';

const { Events } = require('discord.js');
const logger = require('../utils/logger');

const name = Events.Error;
const once = false;

async function execute(err) {
  logger.error('Erro no client do Discord', err);
}

module.exports = { name, once, execute };
