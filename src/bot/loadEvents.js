'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const EVENTS_DIR = path.join(__dirname, '..', 'events');

function loadEvents(client) {
  const arquivos = fs.readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.js'));
  let total = 0;

  for (const arquivo of arquivos) {
    const caminho = path.join(EVENTS_DIR, arquivo);
    const evento = require(caminho);

    if (!evento || !evento.name || typeof evento.execute !== 'function') {
      logger.warn(`Evento invalido ignorado: ${arquivo}`);
      continue;
    }

    if (evento.once) {
      client.once(evento.name, (...args) => evento.execute(...args));
    } else {
      client.on(evento.name, (...args) => evento.execute(...args));
    }

    total += 1;
  }

  logger.info(`${total} evento(s) carregado(s) de src/events.`);
}

module.exports = { loadEvents };
