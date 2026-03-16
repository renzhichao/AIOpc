/**
 * Monitoring Configuration
 *
 * Production monitoring settings for:
 * - Metrics collection
 * - Health checks
 * - Performance monitoring
 * - Alerting thresholds
 */

export const monitoringConfig = {
  // Enable/disable monitoring
  enabled: process.env.ENABLE_METRICS === 'true' || process.env.NODE_ENV === 'production',

  // Metrics collection interval (ms)
  collectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL || '30000'),

  // Metrics retention period (days)
  retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),

  // Health check configuration
  healthCheck: {
    // Health check interval (ms)
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'),

    // Health check timeout (ms)
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '10000'),

    // Failure threshold before marking as unhealthy
    failureThreshold: parseInt(process.env.HEALTH_CHECK_FAILURE_THRESHOLD || '3'),

    // Services to check
    services: {
      database: true,
      redis: true,
      docker: true,
      deepseek: true,
    },
  },

  // Performance monitoring
  performance: {
    // Enable performance monitoring
    enabled: process.env.PERFORMANCE_MONITORING_ENABLED === 'true',

    // Slow query threshold (ms)
    slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD || '1000'),

    // Slow API call threshold (ms)
    slowApiThreshold: parseInt(process.env.SLOW_API_THRESHOLD || '5000'),

    // Enable request timing
    trackRequestTiming: true,

    // Enable database query timing
    trackQueryTiming: true,

    // Enable external API timing
    trackExternalApiTiming: true,
  },

  // Metrics to collect
  metrics: {
    // System metrics
    system: {
      cpu: true,
      memory: true,
      disk: true,
      network: true,
    },

    // Application metrics
    application: {
      requestCount: true,
      responseTime: true,
      errorRate: true,
      activeConnections: true,
    },

    // Business metrics
    business: {
      activeInstances: true,
      totalUsers: true,
      apiUsage: true,
      containerOperations: true,
    },
  },

  // Alerting thresholds
  alerts: {
    // Error rate threshold (percentage)
    errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5.0'),

    // Response time threshold (ms)
    responseTimeThreshold: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000'),

    // Memory usage threshold (percentage)
    memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD || '80.0'),

    // CPU usage threshold (percentage)
    cpuThreshold: parseFloat(process.env.CPU_THRESHOLD || '80.0'),

    // Disk usage threshold (percentage)
    diskThreshold: parseFloat(process.env.DISK_THRESHOLD || '80.0'),

    // Database connection pool threshold (percentage)
    dbPoolThreshold: parseFloat(process.env.DB_POOL_THRESHOLD || '80.0'),
  },

  // Logging configuration
  logging: {
    // Log slow queries
    logSlowQueries: true,

    // Log slow API calls
    logSlowApiCalls: true,

    // Log errors
    logErrors: true,

    // Log performance metrics
    logPerformanceMetrics: true,

    // Log interval (ms)
    logInterval: parseInt(process.env.METRICS_LOG_INTERVAL || '60000'),
  },
};

/**
 * Health check status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: Date;
  checks: {
    database: { status: HealthStatus; latency?: number; error?: string };
    redis: { status: HealthStatus; latency?: number; error?: string };
    docker: { status: HealthStatus; latency?: number; error?: string };
    deepseek?: { status: HealthStatus; latency?: number; error?: string };
  };
}

/**
 * Metrics data interface
 */
export interface MetricsData {
  timestamp: Date;
  system: {
    cpu: number;
    memory: number;
    disk: number;
  };
  application: {
    requestCount: number;
    avgResponseTime: number;
    errorRate: number;
    activeConnections: number;
  };
  business: {
    activeInstances: number;
    totalUsers: number;
    apiCalls: number;
  };
}

/**
 * Performance alert interface
 */
export interface PerformanceAlert {
  type: 'error_rate' | 'response_time' | 'memory' | 'cpu' | 'disk' | 'db_pool';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

/**
 * Get monitoring configuration for a specific environment
 */
export function getMonitoringConfig(env: string = process.env.NODE_ENV || 'development') {
  if (env === 'production') {
    return {
      ...monitoringConfig,
      enabled: true,
      performance: {
        ...monitoringConfig.performance,
        enabled: true,
      },
    };
  }

  if (env === 'test') {
    return {
      ...monitoringConfig,
      enabled: false,
      performance: {
        ...monitoringConfig.performance,
        enabled: false,
      },
    };
  }

  return monitoringConfig;
}

/**
 * Validate monitoring configuration
 */
export function validateMonitoringConfig(): boolean {
  const config = getMonitoringConfig();

  if (config.collectionInterval < 1000) {
    console.warn('Monitoring collection interval too low (min 1000ms)');
    return false;
  }

  if (config.healthCheck.timeout < 1000) {
    console.warn('Health check timeout too low (min 1000ms)');
    return false;
  }

  if (config.performance.slowQueryThreshold < 100) {
    console.warn('Slow query threshold too low (min 100ms)');
    return false;
  }

  return true;
}
