import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { useContainer, useExpressServer } from 'routing-controllers';
import { Container } from 'typedi';
import { logger } from './config/logger';
import { AppDataSource } from './config/database';
import { redis } from './config/redis';
import { OAuthController } from './controllers/OAuthController';
import { InstanceController } from './controllers/InstanceController';
import { UserController } from './controllers/UserController';
import { MonitoringController } from './controllers/MonitoringController';
import { ApiKeyController } from './controllers/ApiKeyController';
import { HealthCheckController } from './controllers/HealthCheckController';
import { FeishuWebhookController } from './controllers/FeishuWebhookController';
import { ScheduledHealthCheckService } from './services/ScheduledHealthCheckService';
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
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeMiddlewares();
    this.initializeControllers();
    this.initializeRoutes();
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
    // Set TypeDI container for routing-controllers
    useContainer(Container);

    // Configure routing-controllers
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
      ],
      middlewares: [],
      defaultErrorHandler: true,
      validation: true,
    });

    logger.info('All controllers initialized (OAuth, Instance, User, Monitoring, ApiKey, HealthCheck, FeishuWebhook)');
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

const app = new Application();
app.listen();

// Export the express app for testing
export const expressApp = app.app;
export default app;
