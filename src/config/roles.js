'use strict';

/**
 * Cargos criados automaticamente pelo /setup.
 * A ordem do array define a ordem de criacao (do mais baixo para o mais alto).
 * Nenhum destes cargos pode receber a permissao Administrator.
 */
const SETUP_ROLES = [
  { name: 'Pintinho', color: 'Default' },
  { name: 'Galinha', color: 'Yellow' },
  { name: 'Galo', color: 'Orange' },
  { name: 'Frango', color: 'Gold' },
  { name: 'Galinha Dourada', color: 'DarkGold' },
  { name: 'Galo de Ouro', color: 'LuminousVividPink' },
  { name: 'Rei do Galinheiro', color: 'DarkRed' }
];

module.exports = { SETUP_ROLES };
