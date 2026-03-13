import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './config/logger';
import { AppDataSource } from './config/database';
import { redis } from './config/redis';

class Application {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeMiddlewares();
    this.initializeRoutes();
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
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.body,
      });
      next();
    });
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

export default app;
