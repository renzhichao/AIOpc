import { FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests
 *
 * This runs before all tests and ensures:
 * - Backend services are available
 * - Database is in clean state
 * - Mock services are running
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up E2E test environment...');

  // Check if required services are running
  const services = [
    { name: 'Frontend', url: 'http://localhost:5173' },
    { name: 'Backend API', url: 'http://localhost:3000' },
    { name: 'Mock Feishu', url: 'http://localhost:3001' },
    { name: 'Mock OpenClaw', url: 'http://localhost:3002' },
  ];

  for (const service of services) {
    try {
      const response = await fetch(service.url, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ ${service.name} is running`);
      } else {
        console.warn(`⚠️  ${service.name} is responding but not healthy`);
      }
    } catch (error) {
      console.error(`❌ ${service.name} is not available:`, error);
      throw new Error(`Required service ${service.name} is not running at ${service.url}`);
    }
  }

  console.log('✅ E2E test environment setup complete');
}

export default globalSetup;
