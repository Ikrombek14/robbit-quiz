// PM2 konfiguratsiyasi — Robbit Quiz (serverda)
// Ishga tushirish: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "robbit-quiz",
      script: "dist/index.js",
      cwd: "/root/apps/robbit-quiz",
      instances: 1,
      exec_mode: "fork", // Socket.io uchun bitta instance (xotirada o'yin holati saqlanadi)
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      // --- Barqarorlik: kutilmagan to'xtashda avtomatik va xavfsiz tiklanish ---
      autorestart: true,                  // qulasa avtomatik qayta ishga tushadi
      exp_backoff_restart_delay: 200,     // qayta urinishlar orasida ortib boruvchi kechikish (tight loop yo'q)
      min_uptime: "10s",                  // 10s ishlamasa "barqaror" deb hisoblanmaydi
      // max_restarts qo'yilmagan (cheksiz) — pm2 hech qachon "voz kechmasin", doim tiklaydi
      kill_timeout: 7000,                 // graceful shutdown uchun 7s beradi (SIGTERM → toza yopilish)
      listen_timeout: 10000,
    },
  ],
};
