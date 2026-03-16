import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
const envPath = path.resolve(__dirname, '../.env.development');
dotenv.config({ path: envPath });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { useContainer, useExpressServer } from 'routing-controllers';
import { Container } from 'typedi';
import { useContainer as useTypeOrmContainer } from 'typeorm';
import { logger } from './config/logger';

// IMPORTANT: Set up TypeDI container for TypeORM BEFORE importing database
// This is critical because the DataSource is created at module load time
useTypeOrmContainer(Container);
logger.info('TypeDI container initialized for TypeORM');

// Now we can safely import the database (DataSource will be created with container awareness)
import { AppDataSource } from './config/database';
import { redis } from './config/redis';
import { OAuthController } from './controllers/OAuthController';
import { MockOAuthController } from './controllers/MockOAuthController';
import { InstanceController } from './controllers/InstanceController';
import { UserController } from './controllers/UserController';
import { MonitoringController } from './controllers/MonitoringController';
import { ApiKeyController } from './controllers/ApiKeyController';
import { HealthCheckController } from './controllers/HealthCheckController';
import { FeishuWebhookController } from './controllers/FeishuWebhookController';
import { MetricsController } from './controllers/MetricsController';
import { ScheduledHealthCheckService } from './services/ScheduledHealthCheckService';
import { MetricsCollectionService } from './services/MetricsCollectionService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { sanitizeInput, preventSQLInjection } from './middleware/validate';
import {
  requestId,
  requestLogger,
  errorLogger,
  authenticate,
  rateLimit,
} from './middleware';

class Application {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.setupRoutingControllersContainer(); // Setup TypeDI for routing-controllers early
    this.initializeMiddlewares();
    this.initializeRoutes();
    // Note: Error handlers are added AFTER controllers in initialize()
  }

  private setupRoutingControllersContainer() {
    // Set up TypeDI container for routing-controllers
    useContainer(Container);
    logger.info('TypeDI container initialized for routing-controllers');
  }

  public async initialize() {
    // Initialize database FIRST (must complete before controllers)
    await this.initializeDatabase();

    // Initialize Redis
    this.initializeRedis();

    // Initialize controllers AFTER database is ready
    // This is important because controllers depend on repositories
    this.initializeControllers();

    // Add error handlers AFTER all routes (both manual and routing-controllers)
    this.initializeErrorHandlers();

    // Initialize scheduled tasks
    this.initializeScheduledTasks();
  }

  private async initializeDatabase() {
    try {
      await AppDataSource.initialize();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed', error);
      // 在开发环境中，如果数据库未连接，仍然启动服务器
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('Starting server without database connection (development mode)');
      }
    }
  }

  private initializeRedis() {
    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });
  }

  private initializeMiddlewares() {
    // Request ID (must be first)
    this.app.use(requestId);

    // Rate limiting
    this.app.use(
      rateLimit({
        windowMs: 60000, // 1 minute
        maxRequests: 100, // 100 requests per minute
      })
    );

    // Security
    this.app.use(helmet());
    this.app.use(cors());

    // Body parsing
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Security validation
    this.app.use(sanitizeInput);
    this.app.use(preventSQLInjection);

    // Logging
    this.app.use(requestLogger);
  }

  private initializeErrorHandlers() {
    // Error handling middleware (must be after routes)
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private initializeRoutes() {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
        redis: redis.status === 'ready' ? 'connected' : 'disconnected',
      };
      res.json(health);
    });

    // API routes placeholder
    this.app.get('/api', (_req, res) => {
      res.json({
        message: 'AIOpc Platform API',
        version: '1.0.0',
      });
    });
  }

  private initializeControllers() {
    logger.info('Initializing routing-controllers...');

    // Configure routing-controllers with class-based controller registration
    useExpressServer(this.app, {
      routePrefix: '/api',
      controllers: [
        OAuthController,
        InstanceController,
        UserController,
        MonitoringController,
        ApiKeyController,
        HealthCheckController,
        FeishuWebhookController,
        MetricsController,
      ],
      middlewares: [],
      defaultErrorHandler: false, // We use our own error handlers
      validation: true,
    });

    logger.info('All controllers initialized (OAuth, Instance, User, Monitoring, ApiKey, HealthCheck, FeishuWebhook, Metrics)');
    logger.info('Routing-controllers routes registered successfully');
  }

  private initializeScheduledTasks() {
    try {
      const scheduledHealthCheckService = Container.get(ScheduledHealthCheckService);

      // Start scheduled health checks
      const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000');
      const enabled = process.env.HEALTH_CHECK_ENABLED !== 'false';

      scheduledHealthCheckService.start({
        enabled,
        interval,
        recovery: {
          maxRestartAttempts: 3,
          restartDelay: 5000,
          enabled: true,
          httpCheckEnabled: process.env.HTTP_HEALTH_CHECK_ENABLED !== 'false',
        },
      });

      logger.info('Scheduled health check service initialized', {
        interval: `${interval / 1000}s`,
        enabled,
      });
    } catch (error) {
      logger.error('Failed to initialize scheduled health check service', error);
    }

    try {
      const metricsCollectionService = Container.get(MetricsCollectionService);

      // Start metrics collection scheduler
      const metricsEnabled = process.env.METRICS_COLLECTION_ENABLED !== 'false';

      if (metricsEnabled) {
        metricsCollectionService.startScheduler();
        logger.info('Metrics collection scheduler started (every 5 minutes)');
      } else {
        logger.info('Metrics collection scheduler disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize metrics collection service', error);
    }
  }

  public listen() {
    const PORT = process.env.PORT || 3000;
    this.app.listen(PORT, () => {
      logger.info(`🚀 Server started on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  }
}

async function main() {
  const app = new Application();

  // Initialize database and controllers BEFORE listening
  await app.initialize();

  // Start listening for requests
  app.listen();
}

main().catch((error) => {
  logger.error('Failed to start application', error);
  process.exit(1);
});

// Export the express app for testing
export const expressApp = new Application().app;
export default Application;
