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
      max_memory_restart: "400M",
    },
  ],
};
