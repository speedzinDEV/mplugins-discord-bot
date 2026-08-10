'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  return value === undefined ? '' : value;
}

const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('CLIENT_ID'),
    guildId: required('GUILD_ID'),
    // Dono do bot: sempre tem acesso total, mesmo sem nenhum cargo
    // configurado. Garante que o servidor nunca fique sem ninguem
    // capaz de configurar o bot (ver PermissionService).
    ownerId: required('OWNER_ID')
  },
  database: {
    url: required('DATABASE_URL'),
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'mplugins',
    user: required('DB_USER'),
    password: required('DB_PASSWORD')
  },
  panel: {
    host: process.env.PANEL_HOST || '127.0.0.1',
    port: Number(process.env.PANEL_PORT || 3000),
    username: required('PANEL_USERNAME'),
    password: required('PANEL_PASSWORD')
  },
  webhookSecret: required('WEBHOOK_SECRET'),
  ticketPanel: {
    // Todas opcionais: se nao existirem no .env, os defaults abaixo sao usados.
    // Nao e necessario editar o .env atual para o bot continuar funcionando.
    titulo: process.env.TICKET_PANEL_TITULO || '🎫 | MPLUGINS - SUPORTE & ATENDIMENTO',
    horario: process.env.TICKET_PANEL_HORARIO || 'Todos os dias, das 10h às 20h30 (UTC-3).',
    tempoResposta: process.env.TICKET_PANEL_TEMPO_RESPOSTA || 'Normalmente, respondemos em até 1 hora.',
    bannerUrl: process.env.TICKET_PANEL_BANNER_URL || '',
    rodape: process.env.TICKET_PANEL_RODAPE || 'mPlugins - Atendimento Oficial',
    cor: process.env.TICKET_PANEL_COR || '0x9B59D0'
  }
};

module.exports = config;
