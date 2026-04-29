module.exports = {
  apps: [
    {
      name: "video-generator",
      script: "./scheduler.js",
      cwd: "./video_generator_service",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
