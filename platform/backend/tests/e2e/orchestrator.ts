/**
 * E2E Test Orchestrator
 *
 * Coordinates end-to-end test execution with proper setup/teardown,
 * environment management, and test isolation.
 *
 * Features:
 * - Test environment setup and teardown
 * - Database initialization and cleanup
 * - Docker environment verification
 * - Test scenario execution
 * - Comprehensive cleanup and reporting
 */

import { AppDataSource } from '../../src/config/database';
import { DatabaseHelper } from '../integration/helpers/database.helper';
import { DockerHelper } from '../integration/helpers/docker.helper';
import { TestFixtures } from '../integration/helpers/fixtures';
import Docker from 'dockerode';

export interface TestEnvironment {
  database: {
    connected: boolean;
    host: string;
    port: number;
    database: string;
  };
  docker: {
    connected: boolean;
    version: string;
    containers: number;
    images: number;
  };
  test: {
    startTime: Date;
    testRunId: string;
    isolationLevel: 'process' | 'container' | 'database';
  };
}

export interface TestResult {
  scenario: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface TestReport {
  runId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  environment: TestEnvironment;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    successRate: number;
  };
  coverage?: {
    scenarios: number;
    userJourneys: number;
    edgeCases: number;
  };
}

export class E2EOrchestrator {
  private static instance: E2EOrchestrator;
  private docker: Docker | null = null;
  private isDockerConnected: boolean = false;
  private environment: TestEnvironment | null = null;
  private testResults: TestResult[] = [];
  private currentTestRunId: string | null = null;
  private testStartTime: Date | null = null;

  private constructor() {
    // Docker will be initialized in setup() after connection
  }

  /**
   * Get singleton instance
   */
  static getInstance(): E2EOrchestrator {
    if (!E2EOrchestrator.instance) {
      E2EOrchestrator.instance = new E2EOrchestrator();
    }
    return E2EOrchestrator.instance;
  }

  /**
   * Setup test environment
   */
  async setup(options?: {
    isolationLevel?: 'process' | 'container' | 'database';
    skipDockerVerification?: boolean;
  }): Promise<TestEnvironment> {
    console.log('\n=== E2E Test Environment Setup ===\n');

    const startTime = Date.now();

    // Generate test run ID
    this.currentTestRunId = `e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.testStartTime = new Date();

    // Configure test environment
    this.configureTestEnvironment();

    // Initialize database
    console.log('1/4 Initializing database...');
    await this.initializeDatabase();
    console.log('✓ Database initialized\n');

    // Initialize Docker
    console.log('2/4 Verifying Docker environment...');
    await this.initializeDocker(options?.skipDockerVerification);
    console.log('✓ Docker verified\n');

    // Clean up any previous test artifacts
    console.log('3/4 Cleaning up previous test artifacts...');
    await this.cleanupTestArtifacts();
    console.log('✓ Cleanup completed\n');

    // Collect environment information
    console.log('4/4 Collecting environment information...');
    this.environment = await this.collectEnvironmentInfo(options?.isolationLevel);
    this.printEnvironmentInfo();
    console.log('✓ Environment information collected\n');

    const setupDuration = Date.now() - startTime;
    console.log(`=== Setup completed in ${setupDuration}ms ===\n`);

    return this.environment;
  }

  /**
   * Configure test environment variables
   */
  private configureTestEnvironment(): void {
    // Set test-specific environment variables
    process.env.NODE_ENV = 'test';
    process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-deepseek-api-key-e2e';
    process.env.FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'test_feishu_app_id_e2e';
    process.env.FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'test_feishu_app_secret_e2e';
    process.env.FEISHU_REDIRECT_URI = process.env.FEISHU_REDIRECT_URI || 'http://localhost:5173/oauth/callback';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-e2e';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    // Database configuration
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

    // Docker configuration
    process.env.DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    process.env.DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'opclaw-network';
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    try {
      await DatabaseHelper.connect();

      // Run migrations if needed
      // await this.runMigrations();

      // Clean database
      await DatabaseHelper.clean();
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  /**
   * Initialize and verify Docker environment
   */
  private async initializeDocker(skipVerification = false): Promise<void> {
    try {
      // Connect to Docker daemon
      await DockerHelper.connect();

      // Get Docker instance after connection is established
      this.docker = DockerHelper.getDocker();
      this.isDockerConnected = true;

      if (!skipVerification) {
        // Verify required image exists
        const imageExists = await DockerHelper.verifyImage('openclaw/agent:latest');
        if (!imageExists) {
          throw new Error(
            'Required image openclaw/agent:latest not found. ' +
            'Please build the image first: docker build -t openclaw/agent:latest .'
          );
        }

        // Create Docker network if it doesn't exist
        await this.ensureDockerNetwork();
      }
    } catch (error) {
      this.isDockerConnected = false;
      throw new Error(`Failed to initialize Docker: ${error}`);
    }
  }

  /**
   * Ensure Docker network exists
   */
  private async ensureDockerNetwork(): Promise<void> {
    try {
      if (!this.docker) {
        throw new Error('Docker not initialized');
      }

      const networks = await this.docker.listNetworks();
      const networkName = process.env.DOCKER_NETWORK || 'opclaw-network';
      const networkExists = networks.some((n: any) => n.Name === networkName);

      if (!networkExists) {
        console.log(`Creating Docker network: ${networkName}`);
        await this.docker.createNetwork({
          Name: networkName,
          Driver: 'bridge',
        });
        console.log(`✓ Network created: ${networkName}`);
      } else {
        console.log(`✓ Network exists: ${networkName}`);
      }
    } catch (error) {
      console.warn(`Failed to ensure Docker network: ${error}`);
    }
  }

  /**
   * Ensure Docker is connected before operations
   */
  private ensureDockerConnected(): void {
    if (!this.isDockerConnected || !this.docker) {
      throw new Error('Docker not connected. Call setup() first.');
    }
  }

  /**
   * Get Docker instance (with connection check)
   */
  getDocker(): Docker {
    this.ensureDockerConnected();
    return this.docker!;
  }

  /**
   * Clean up previous test artifacts
   */
  private async cleanupTestArtifacts(): Promise<void> {
    try {
      // Remove all test containers
      await DockerHelper.removeAllTestContainers();

      // Clean database
      await DatabaseHelper.clean();
    } catch (error) {
      console.warn(`Failed to cleanup test artifacts: ${error}`);
    }
  }

  /**
   * Collect environment information
   */
  private async collectEnvironmentInfo(
    isolationLevel: 'process' | 'container' | 'database' = 'database'
  ): Promise<TestEnvironment> {
    // Database info
    const database = {
      connected: AppDataSource.isInitialized,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'opclaw',
    };

    // Docker info
    const dockerInfo = await DockerHelper.getSystemInfo();
    const docker = {
      connected: true,
      version: dockerInfo.version,
      containers: dockerInfo.containers,
      images: dockerInfo.images,
    };

    // Test info
    const test = {
      startTime: this.testStartTime!,
      testRunId: this.currentTestRunId!,
      isolationLevel,
    };

    return { database, docker, test };
  }

  /**
   * Print environment information
   */
  private printEnvironmentInfo(): void {
    if (!this.environment) return;

    console.log('Test Environment:');
    console.log(`  Run ID: ${this.environment.test.testRunId}`);
    console.log(`  Start Time: ${this.environment.test.startTime.toISOString()}`);
    console.log(`  Isolation Level: ${this.environment.test.isolationLevel}`);
    console.log('');
    console.log('Database:');
    console.log(`  Host: ${this.environment.database.host}:${this.environment.database.port}`);
    console.log(`  Database: ${this.environment.database.database}`);
    console.log(`  Connected: ${this.environment.database.connected}`);
    console.log('');
    console.log('Docker:');
    console.log(`  Version: ${this.environment.docker.version}`);
    console.log(`  Containers: ${this.environment.docker.containers}`);
    console.log(`  Images: ${this.environment.docker.images}`);
    console.log(`  Connected: ${this.environment.docker.connected}`);
    console.log('');
  }

  /**
   * Execute a test scenario
   */
  async executeScenario(
    scenarioName: string,
    testFn: () => Promise<void>,
    metadata?: Record<string, any>
  ): Promise<TestResult> {
    const startTime = Date.now();
    console.log(`\n=== Executing: ${scenarioName} ===`);

    try {
      await testFn();

      const duration = Date.now() - startTime;
      const result: TestResult = {
        scenario: scenarioName,
        status: 'passed',
        duration,
        metadata,
      };

      this.testResults.push(result);
      console.log(`✓ ${scenarioName} passed (${duration}ms)\n`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: TestResult = {
        scenario: scenarioName,
        status: 'failed',
        duration,
        error: error as Error,
        metadata,
      };

      this.testResults.push(result);
      console.error(`✗ ${scenarioName} failed (${duration}ms)`);
      console.error(`  Error: ${(error as Error).message}\n`);

      return result;
    }
  }

  /**
   * Teardown test environment
   */
  async teardown(): Promise<TestReport> {
    console.log('\n=== E2E Test Environment Teardown ===\n');

    const endTime = new Date();
    const duration = this.testStartTime ? endTime.getTime() - this.testStartTime.getTime() : 0;

    // Clean up test artifacts
    console.log('1/3 Cleaning up test artifacts...');
    await this.cleanupTestArtifacts();
    console.log('✓ Cleanup completed\n');

    // Disconnect database
    console.log('2/3 Disconnecting database...');
    await DatabaseHelper.disconnect();
    console.log('✓ Database disconnected\n');

    // Generate report
    console.log('3/3 Generating test report...');
    const report = this.generateReport(endTime);
    console.log('✓ Report generated\n');

    console.log(`=== Teardown completed (Total: ${duration}ms) ===\n`);

    return report;
  }

  /**
   * Generate test report
   */
  private generateReport(endTime: Date): TestReport {
    const summary = {
      total: this.testResults.length,
      passed: this.testResults.filter(r => r.status === 'passed').length,
      failed: this.testResults.filter(r => r.status === 'failed').length,
      skipped: this.testResults.filter(r => r.status === 'skipped').length,
      successRate: 0,
    };

    summary.successRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;

    return {
      runId: this.currentTestRunId!,
      startTime: this.testStartTime!,
      endTime,
      duration: endTime.getTime() - this.testStartTime!.getTime(),
      environment: this.environment!,
      results: this.testResults,
      summary,
    };
  }

  /**
   * Get current test results
   */
  getTestResults(): TestResult[] {
    return [...this.testResults];
  }

  /**
   * Get test run ID
   */
  getTestRunId(): string {
    return this.currentTestRunId!;
  }

  /**
   * Reset test results (useful between test suites)
   */
  resetResults(): void {
    this.testResults = [];
  }

  /**
   * Wait for condition with timeout
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 30000,
    interval = 500,
    timeoutMessage?: string
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(
      timeoutMessage || `Condition not met within ${timeout}ms`
    );
  }

  /**
   * Retry operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000,
    operationName?: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.warn(
            `${operationName || 'Operation'} failed (attempt ${attempt}/${maxAttempts}), ` +
            `retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
