'use strict';

const { SETUP_ROLES } = require('./roles');

/**
 * Valor minimo acumulado (em reais) para cada rank.
 * A ordem segue SETUP_ROLES (do menor para o maior).
 * Estes valores sao os padroes; podem ser sobrescritos futuramente
 * via a tabela "settings" (chave "rank_threshold_<nome>").
 */
const RANK_THRESHOLDS = [
  { name: 'Pintinho', min: 0 },
  { name: 'Galinha', min: 25 },
  { name: 'Galo', min: 75 },
  { name: 'Frango', min: 150 },
  { name: 'Galinha Dourada', min: 300 },
  { name: 'Galo de Ouro', min: 600 },
  { name: 'Rei do Galinheiro', min: 1000 }
];

// Verificacao de consistencia com config/roles.js (mesmos nomes, mesma ordem).
if (RANK_THRESHOLDS.length !== SETUP_ROLES.length) {
  throw new Error('RANK_THRESHOLDS e SETUP_ROLES estao dessincronizados.');
}

module.exports = { RANK_THRESHOLDS };
