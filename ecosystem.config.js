'use strict';

// Configuracao do PM2 para producao (Oracle Cloud).
//
// Regras seguidas de proposito:
//  - instances: 1 e exec_mode: 'fork' -> NUNCA cluster. Um bot Discord
//    rodando em mais de uma instancia ao mesmo tempo processaria cada
//    evento/interacao mais de uma vez (comandos duplicados, tickets
//    duplicados, etc).
//  - restart automatico, mas com min_uptime + max_restarts para evitar
//    um loop de reinicio rapido (crash loop) caso a configuracao esteja
//    quebrada (ex.: DISCORD_TOKEN invalido) - depois de 10 tentativas em
//    menos de 10s cada, o PM2 para de tentar e o healthcheck.sh vai
//    reportar erro em vez de ficar reiniciando para sempre.

module.exports = {
  apps: [
    {
      name: 'mplugins-discord-bot',
      script: 'src/index.js',
      cwd: __dirname,

      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      min_uptime: '15s',
      max_restarts: 10,
      restart_delay: 3000,

      max_memory_restart: '300M',

      // Graceful shutdown: da tempo do processo terminar conexoes com o
      // Discord/Postgres antes do PM2 forcar o encerramento.
      kill_timeout: 8000,
      wait_ready: false,

      watch: false,

      env: {
        NODE_ENV: 'production'
      },

      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      time: true
    }
  ]
};
