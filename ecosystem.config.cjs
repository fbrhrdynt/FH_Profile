module.exports = {
  apps: [{
    name: 'febro',
    script: './server.js',
    cwd: '/opt/febro',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '250M',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3090',
      DATA_DIR: '/opt/febro/data',
      COOKIE_SECURE: '1'
    }
  }]
};
