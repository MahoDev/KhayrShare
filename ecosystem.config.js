module.exports = {
  apps: [
    {
      name: "khayr-suggester",
      script: "./src/services/content-suggester/scheduler.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "khayr-media-gen",
      script: "./src/services/media-generator/scheduler.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
