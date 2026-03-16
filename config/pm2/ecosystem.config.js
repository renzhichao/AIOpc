/**
 * AIOpc Backend PM2 Ecosystem Configuration
 *
 * Purpose: Production process management configuration
 *
 * Features:
 * - Auto-restart on failure
 * - Memory and CPU limits
 * - Log management
 * - Environment-specific configuration
 * - Cluster mode support
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart opclaw-backend
 *   pm2 stop opclaw-backend
 *   pm2 delete opclaw-backend
 *   pm2 logs opclaw-backend
 *   pm2 show opclaw-backend
 *
 * Documentation: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'opclaw-backend',

      // Script to execute
      script: './dist/app.js',

      // Current working directory
      cwd: '/opt/opclaw/backend',

      // Number of instances (1 for now, can be increased for cluster mode)
      instances: 1,

      // Execution mode: 'fork' or 'cluster'
      // Use 'fork' for single instance, 'cluster' for multiple instances
      exec_mode: 'fork',

      // Auto-restart configuration
      autorestart: true,

      // Watch for file changes (disabled in production)
      watch: false,

      // Ignore files in watch mode
      ignore_watch: ['node_modules', 'logs', 'coverage', '.git', 'tmp'],

      // Maximum memory restart threshold
      max_memory_restart: '2G',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // Development environment (optional)
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },

      // Staging environment (optional)
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000
      },

      // Log configuration
      error_file: '/var/log/opclaw/pm2-error.log',
      out_file: '/var/log/opclaw/pm2-out.log',
      log_file: '/var/log/opclaw/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Merge logs from all instances
      merge_logs: true,

      // Log rotation
      // Requires pm2-logrotate module: pm2 install pm2-logrotate
      //
      // Configuration for pm2-logrotate:
      // pm2 set pm2-logrotate:max_size 100M
      // pm2 set pm2-logrotate:retain 7
      // pm2 set pm2-logrotate:compress true

      // Minimum uptime to consider app as started
      min_uptime: '10s',

      // Maximum restarts within time window before giving up
      max_restarts: 10,

      // Delay between restarts
      restart_delay: 4000,

      // Auto-exit if application throws or sends an error
      // kill_with_signal: 'SIGTERM',

      // Listen timeout before forcing restart
      // listen_timeout: 10000,

      // Kill timeout (graceful shutdown)
      // kill_timeout: 5000,

      // Wait for ready event before considering app as started
      // wait_ready: true,

      // Shutdown with message
      // shutdown_with_message: true,

      // Process management
      // exec_mode: 'cluster',
      // instances: 'max', // or specific number like 4

      // Instance variables (for cluster mode)
      instance_var: 'INSTANCE_ID',

      // Cron restart (disabled by default)
      // cron_restart: '0 3 * * *', // Restart daily at 3 AM

      // Interpreter (default: node)
      interpreter: 'node',

      // Interpreter arguments
      // interpreter_args: '--max-old-space-size=2048',

      // Node arguments
      node_args: [
        '--max-old-space-size=2048',
        '--enable-source-maps'
      ],

      // Error handling
      // autorestart: false,
      // max_restarts: 10,
      // min_uptime: '10s',

      // Monitoring
      // monitor: true,

      // PM2 Plus monitoring
      // pm2: true,

      // Deployment configuration (optional)
      // deploy: {
      //   production: {
      //     user: 'opclaw',
      //     host: '118.25.0.190',
      //     ref: 'origin/main',
      //     repo: 'git@github.com:username/AIOpc.git',
      //     path: '/opt/opclaw/backend',
      //     'post-deploy': 'pnpm install && pnpm run build && pm2 reload ecosystem.config.js --env production'
      //   }
      // }
    }
  ],

  /**
   * Deployment Configuration (Optional)
   *
   * Alternative deployment method using PM2 deploy
   *
   * Usage:
   *   pm2 deploy ecosystem.config.js production setup
   *   pm2 deploy ecosystem.config.js production update
   */
  // deploy: {
  //   production: {
  //     user: 'opclaw',
  //     host: '118.25.0.190',
  //     ref: 'origin/main',
  //     repo: 'git@github.com:username/AIOpc.git',
  //     path: '/opt/opclaw/backend',
  //     'pre-deploy-local': './scripts/cloud/test.sh',
  //     'post-setup': 'pnpm install',
  //     'post-deploy': 'pnpm run build && pm2 reload ecosystem.config.js --env production',
  //     'pre-setup': './scripts/cloud/init-server.sh'
  //   }
  // }
};
