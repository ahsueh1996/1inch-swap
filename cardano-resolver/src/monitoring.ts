/**
 * Monitoring Service for Cardano Resolver
 *
 * Provides comprehensive monitoring, metrics, and health checks:
 * - Real-time performance metrics
 * - Health status monitoring
 * - Error tracking and alerting
 * - Performance analytics
 */

import { EventEmitter } from 'events';
import { createServer, Server } from 'http';
import { createLogger } from 'winston';

const logger = createLogger({
  level: 'info',
  format: require('winston').format.json(),
  transports: [
    new require('winston').transports.Console()
  ]
});

export interface MonitoringConfig {
  port: number;
  enabled: boolean;
}

export interface HealthMetrics {
  isRunning: boolean;
  pendingEscrows: number;
  deployedEscrows: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  avgCompletionTime: number;
  avgGasCost: number;
  successRate: number;
  uptime: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  recentErrors: Array<{
    timestamp: number;
    message: string;
    type: string;
    orderHash?: string;
  }>;
}

/**
 * MonitoringService provides comprehensive monitoring and metrics collection
 */
export class MonitoringService extends EventEmitter {
  private config: MonitoringConfig;
  private server?: Server;
  private startTime: number;
  private healthMetrics: HealthMetrics;
  private performanceMetrics: PerformanceMetrics;
  private errorMetrics: ErrorMetrics;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();

    // Initialize metrics
    this.healthMetrics = {
      isRunning: false,
      pendingEscrows: 0,
      deployedEscrows: 0,
      timestamp: Date.now()
    };

    this.performanceMetrics = {
      totalOrders: 0,
      completedOrders: 0,
      failedOrders: 0,
      avgCompletionTime: 0,
      avgGasCost: 0,
      successRate: 0,
      uptime: 0
    };

    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {},
      recentErrors: []
    };
  }

  /**
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('📊 Monitoring service disabled');
      return;
    }

    logger.info(`📊 Starting monitoring service on port ${this.config.port}...`);

    this.server = createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        logger.info(`✅ Monitoring service started on http://localhost:${this.config.port}`);
        this.healthMetrics.isRunning = true;
        resolve();
      });

      this.server!.on('error', (error) => {
        logger.error('❌ Monitoring service error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    logger.info('🛑 Stopping monitoring service...');

    return new Promise((resolve) => {
      this.server!.close(() => {
        logger.info('✅ Monitoring service stopped');
        this.healthMetrics.isRunning = false;
        resolve();
      });
    });
  }

  /**
   * Update health metrics
   */
  updateHealthMetrics(metrics: Partial<HealthMetrics>): void {
    this.healthMetrics = {
      ...this.healthMetrics,
      ...metrics,
      timestamp: Date.now()
    };

    this.emit('healthMetricsUpdated', this.healthMetrics);
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(metrics: Partial<PerformanceMetrics>): void {
    this.performanceMetrics = {
      ...this.performanceMetrics,
      ...metrics,
      uptime: Date.now() - this.startTime
    };

    // Calculate success rate
    if (this.performanceMetrics.totalOrders > 0) {
      this.performanceMetrics.successRate =
        this.performanceMetrics.completedOrders / this.performanceMetrics.totalOrders;
    }

    this.emit('performanceMetricsUpdated', this.performanceMetrics);
  }

  /**
   * Record an error
   */
  recordError(error: {
    message: string;
    type: string;
    orderHash?: string;
  }): void {
    this.errorMetrics.totalErrors++;
    this.errorMetrics.errorsByType[error.type] = (this.errorMetrics.errorsByType[error.type] || 0) + 1;

    this.errorMetrics.recentErrors.push({
      timestamp: Date.now(),
      ...error
    });

    // Keep only last 100 errors
    if (this.errorMetrics.recentErrors.length > 100) {
      this.errorMetrics.recentErrors = this.errorMetrics.recentErrors.slice(-100);
    }

    this.emit('errorRecorded', error);
  }

  /**
   * Get current metrics summary
   */
  getMetrics(): {
    health: HealthMetrics;
    performance: PerformanceMetrics;
    errors: ErrorMetrics;
  } {
    return {
      health: { ...this.healthMetrics },
      performance: { ...this.performanceMetrics },
      errors: { ...this.errorMetrics }
    };
  }

  /**
   * Handle HTTP requests for monitoring endpoints
   */
  private handleHttpRequest(req: any, res: any): void {
    const url = req.url;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      switch (url) {
        case '/health':
          res.writeHead(200);
          res.end(JSON.stringify({
            status: this.healthMetrics.isRunning ? 'healthy' : 'unhealthy',
            ...this.healthMetrics
          }));
          break;

        case '/metrics':
          res.writeHead(200);
          res.end(JSON.stringify(this.getMetrics()));
          break;

        case '/metrics/prometheus':
          res.setHeader('Content-Type', 'text/plain');
          res.writeHead(200);
          res.end(this.generatePrometheusMetrics());
          break;

        case '/status':
          res.writeHead(200);
          res.end(JSON.stringify({
            service: 'Cardano Resolver',
            version: '1.0.0',
            uptime: Date.now() - this.startTime,
            ...this.healthMetrics
          }));
          break;

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    } catch (error) {
      logger.error('Error handling monitoring request:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Generate Prometheus-format metrics
   */
  private generatePrometheusMetrics(): string {
    const metrics = [];

    // Health metrics
    metrics.push(`# HELP cardano_resolver_running Whether the resolver is running`);
    metrics.push(`# TYPE cardano_resolver_running gauge`);
    metrics.push(`cardano_resolver_running ${this.healthMetrics.isRunning ? 1 : 0}`);

    metrics.push(`# HELP cardano_resolver_pending_escrows Number of pending escrows`);
    metrics.push(`# TYPE cardano_resolver_pending_escrows gauge`);
    metrics.push(`cardano_resolver_pending_escrows ${this.healthMetrics.pendingEscrows}`);

    metrics.push(`# HELP cardano_resolver_deployed_escrows Number of deployed escrows`);
    metrics.push(`# TYPE cardano_resolver_deployed_escrows gauge`);
    metrics.push(`cardano_resolver_deployed_escrows ${this.healthMetrics.deployedEscrows}`);

    // Performance metrics
    metrics.push(`# HELP cardano_resolver_total_orders Total number of orders processed`);
    metrics.push(`# TYPE cardano_resolver_total_orders counter`);
    metrics.push(`cardano_resolver_total_orders ${this.performanceMetrics.totalOrders}`);

    metrics.push(`# HELP cardano_resolver_completed_orders Number of completed orders`);
    metrics.push(`# TYPE cardano_resolver_completed_orders counter`);
    metrics.push(`cardano_resolver_completed_orders ${this.performanceMetrics.completedOrders}`);

    metrics.push(`# HELP cardano_resolver_failed_orders Number of failed orders`);
    metrics.push(`# TYPE cardano_resolver_failed_orders counter`);
    metrics.push(`cardano_resolver_failed_orders ${this.performanceMetrics.failedOrders}`);

    metrics.push(`# HELP cardano_resolver_success_rate Success rate of orders`);
    metrics.push(`# TYPE cardano_resolver_success_rate gauge`);
    metrics.push(`cardano_resolver_success_rate ${this.performanceMetrics.successRate}`);

    metrics.push(`# HELP cardano_resolver_avg_completion_time Average completion time in ms`);
    metrics.push(`# TYPE cardano_resolver_avg_completion_time gauge`);
    metrics.push(`cardano_resolver_avg_completion_time ${this.performanceMetrics.avgCompletionTime}`);

    metrics.push(`# HELP cardano_resolver_uptime Uptime in milliseconds`);
    metrics.push(`# TYPE cardano_resolver_uptime counter`);
    metrics.push(`cardano_resolver_uptime ${this.performanceMetrics.uptime}`);

    // Error metrics
    metrics.push(`# HELP cardano_resolver_total_errors Total number of errors`);
    metrics.push(`# TYPE cardano_resolver_total_errors counter`);
    metrics.push(`cardano_resolver_total_errors ${this.errorMetrics.totalErrors}`);

    // Error by type
    for (const [type, count] of Object.entries(this.errorMetrics.errorsByType)) {
      metrics.push(`# HELP cardano_resolver_errors_by_type{type="${type}"} Errors by type`);
      metrics.push(`# TYPE cardano_resolver_errors_by_type counter`);
      metrics.push(`cardano_resolver_errors_by_type{type="${type}"} ${count}`);
    }

    return metrics.join('\\n') + '\\n';
  }
}

export default MonitoringService;