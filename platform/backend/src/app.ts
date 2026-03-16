import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量 - 根据NODE_ENV选择不同的环境文件
const NODE_ENV = process.env.NODE_ENV || 'development';
let envPath: string;

if (NODE_ENV === 'production') {
  // 生产环境：优先使用容器环境变量，如果没有则查找.env文件
  // 在Docker环境中，环境变量已经通过docker-compose设置
  envPath = path.resolve(__dirname, '../.env');
} else {
  // 开发环境：使用.env.development
  envPath = path.resolve(__dirname, '../.env.development');
}

// 尝试加载环境文件（如果存在）
dotenv.config({ path: envPath });
// 同时也尝试加载默认的.env文件
dotenv.config();

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
import { ChatController } from './controllers/ChatController';
import { RemoteInstanceController } from './controllers/RemoteInstanceController';
import { ScheduledHealthCheckService } from './services/ScheduledHealthCheckService';
import { MetricsCollectionService } from './services/MetricsCollectionService';
import { WebSocketGateway } from './services/WebSocketGateway';
import { InstanceRegistry } from './services/InstanceRegistry';
import { RemoteHeartbeatMonitorService } from './services/RemoteHeartbeatMonitor';
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
    // Note: Error handlers are added by routing-controllers automatically
    // We don't add custom error handlers to prevent double response issues
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

    // Initialize scheduled tasks
    this.initializeScheduledTasks();

    // Initialize WebSocket Gateway (TASK-006)
    await this.initializeWebSocketGateway();

    // Initialize Instance Registry (TASK-007)
    this.initializeInstanceRegistry();
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

    // Security (disable HSTS until SSL is configured)
    this.app.use(
      helmet({
        hsts: false, // Disable HSTS until SSL certificate is configured
      })
    );
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
        ChatController,
        RemoteInstanceController,
      ],
      middlewares: [],
      defaultErrorHandler: true, // Enable routing-controllers default error handling
      validation: true,
    });

    logger.info('All controllers initialized (OAuth, Instance, User, Monitoring, ApiKey, HealthCheck, FeishuWebhook, Metrics, Chat, RemoteInstance)');
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

    try {
      const remoteHeartbeatMonitor = Container.get(RemoteHeartbeatMonitorService);

      // Start remote instance heartbeat monitor
      const heartbeatEnabled = process.env.REMOTE_HEARTBEAT_MONITOR_ENABLED !== 'false';

      if (heartbeatEnabled) {
        remoteHeartbeatMonitor.start();
        logger.info('Remote instance heartbeat monitor started');
      } else {
        logger.info('Remote instance heartbeat monitor disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize remote heartbeat monitor service', error);
    }
  }

  /**
   * Initialize WebSocket Gateway (TASK-006)
   * Starts the WebSocket server on port 3001 for real-time communication
   */
  private async initializeWebSocketGateway() {
    try {
      const wsGateway = Container.get(WebSocketGateway);

      // Check if WebSocket is enabled
      const wsEnabled = process.env.WS_ENABLED !== 'false';

      if (wsEnabled) {
        await wsGateway.start();
        logger.info('WebSocket Gateway initialized successfully');
      } else {
        logger.info('WebSocket Gateway disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize WebSocket Gateway', error);
      // Don't fail the entire application if WebSocket fails to start
      if (process.env.NODE_ENV === 'production') {
        logger.warn('WebSocket Gateway failed to start, continuing without it');
      } else {
        logger.warn('WebSocket Gateway failed to start in development mode');
      }
    }
  }

  /**
   * Initialize Instance Registry (TASK-007)
   * Starts the in-memory instance registry with health check monitoring
   */
  private initializeInstanceRegistry() {
    try {
      const instanceRegistry = Container.get(InstanceRegistry);

      // Get configuration from environment
      const healthCheckInterval = parseInt(
        process.env.REGISTRY_HEALTH_CHECK_INTERVAL || '15000',
        10
      );
      const healthCheckEnabled = process.env.REGISTRY_HEALTH_CHECK_ENABLED !== 'false';

      if (healthCheckEnabled) {
        instanceRegistry.startHealthCheck(healthCheckInterval);
        logger.info('Instance Registry initialized with health check', {
          intervalMs: healthCheckInterval,
          interval: `${healthCheckInterval / 1000}s`,
        });
      } else {
        logger.info('Instance Registry initialized without health check');
      }
    } catch (error) {
      logger.error('Failed to initialize Instance Registry', error);
      // Don't fail the entire application if registry fails to start
      logger.warn('Instance Registry failed to start, continuing without it');
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
