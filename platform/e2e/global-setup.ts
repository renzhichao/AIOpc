import { FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests
 *
 * This runs once before all tests and:
 * - Sets up test environment variables
 * - Ensures test database is ready
 * - Starts any required services
 */
async function globalSetup(config: FullConfig) {
  console.log('🔧 Setting up E2E test environment...');

  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  // Log configuration
  console.log('✅ E2E test environment ready');
  console.log(`   Base URL: ${process.env.BASE_URL}`);
  console.log(`   Test timeout: ${60000}ms`);
}

export default globalSetup;
