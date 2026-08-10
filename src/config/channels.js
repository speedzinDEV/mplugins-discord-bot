'use strict';

/**
 * Estrutura de categorias e canais criados automaticamente pelo /setup.
 *
 * visibility (a nivel de categoria, pode ser sobrescrita por canal):
 *  - 'read-only'  -> @everyone ve e le historico, mas nao envia mensagens
 *  - 'community'  -> membros veem, enviam mensagens, leem historico e usam comandos
 *  - 'staff-only' -> @everyone nao pode visualizar
 *
 * type (por canal):
 *  - 'text'         -> canal de texto normal
 *  - 'announcement' -> canal de anuncios (icone de megafone)
 *  - 'forum'        -> canal de forum (com topicos)
 *
 * emoji -> prefixado no nome do canal (ex.: "📢・anuncios"). Um icone de
 * canal "nativo" (o avatar redondo do canal) exige boost level alto do
 * servidor e nao e algo que a API publica cria de forma confiavel, entao
 * usamos o padrao de prefixo de emoji, que e o mais usado e compativel.
 */
const SETUP_STRUCTURE = [
  {
    category: 'INFORMAÇÕES',
    visibility: 'read-only',
    channels: [
      { name: 'anuncios', emoji: '📢', type: 'announcement' },
      { name: 'promocoes', emoji: '🏷️', type: 'announcement' },
      { name: 'spoilers', emoji: '🔍', type: 'announcement' },
      { name: 'tutoriais', emoji: '📝', type: 'forum', visibility: 'community' },
      { name: 'logs', emoji: '📋', type: 'announcement' }
    ]
  },
  {
    category: 'EVENTOS',
    visibility: 'read-only',
    channels: [
      { name: 'sorteios', emoji: '🎉', type: 'text' },
      { name: 'boost', emoji: '🚀', type: 'text' },
      { name: 'eventos', emoji: '🎁', type: 'text' }
    ]
  },
  {
    category: 'PLUGINS',
    visibility: 'read-only',
    channels: [
      { name: 'produtos', emoji: '📦', type: 'announcement' },
      { name: 'atualizacoes', emoji: '📚', type: 'announcement' }
    ]
  },
  {
    category: 'PLUS',
    visibility: 'read-only',
    channels: [
      { name: 'novidades', emoji: '📢', type: 'announcement' },
      { name: 'updates', emoji: '📬', type: 'text' },
      { name: 'dicas-de-uso', emoji: '📚', type: 'forum', visibility: 'community' }
    ]
  },
  {
    category: 'GERAL',
    visibility: 'community',
    channels: [{ name: 'chat', emoji: '💬', type: 'text' }]
  },
  {
    category: 'SUPORTE',
    visibility: 'community',
    channels: [{ name: 'tickets', emoji: '🎫', type: 'text' }]
  }
];

module.exports = { SETUP_STRUCTURE };
