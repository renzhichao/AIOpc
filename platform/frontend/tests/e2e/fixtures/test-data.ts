 
/**
 * Test data fixtures for E2E tests
 *
 * This file contains mock data and test fixtures used across E2E tests
 */

export interface TestUser {
  id: string;
  name: string;
  email: string;
  feishuUserId: string;
  accessToken: string;
}

export interface TestInstance {
  id: string;
  name: string;
  description: string;
  template: 'personal' | 'team';
  status: 'running' | 'stopped' | 'pending';
  createdAt: string;
}

/**
 * Mock user data for testing
 */
export const mockUsers: TestUser[] = [
  {
    id: 'user-001',
    name: 'Test User',
    email: 'test@example.com',
    feishuUserId: 'feishu-user-001',
    accessToken: 'mock-access-token-001',
  },
  {
    id: 'user-002',
    name: 'Another User',
    email: 'another@example.com',
    feishuUserId: 'feishu-user-002',
    accessToken: 'mock-access-token-002',
  },
];

/**
 * Mock instance data for testing
 */
export const mockInstances: TestInstance[] = [
  {
    id: 'instance-001',
    name: 'Personal Assistant',
    description: 'My personal AI assistant',
    template: 'personal',
    status: 'running',
    createdAt: '2024-03-15T10:00:00Z',
  },
  {
    id: 'instance-002',
    name: 'Team Workspace',
    description: 'Shared workspace for team',
    template: 'team',
    status: 'stopped',
    createdAt: '2024-03-14T15:30:00Z',
  },
  {
    id: 'instance-003',
    name: 'Dev Environment',
    description: 'Development and testing environment',
    template: 'personal',
    status: 'pending',
    createdAt: '2024-03-13T09:00:00Z',
  },
];

/**
 * Mock OAuth tokens
 */
export const mockOAuthTokens = {
  valid: 'valid-mock-token-123456',
  expired: 'expired-mock-token-789012',
  invalid: 'invalid-token-abcdef',
};

/**
 * Mock instance templates
 */
export const mockTemplates = [
  {
    id: 'personal',
    name: 'Personal Instance',
    description: 'Individual workspace for personal use',
    cpu: '2 cores',
    memory: '4GB',
    storage: '20GB',
  },
  {
    id: 'team',
    name: 'Team Instance',
    description: 'Collaborative workspace for teams',
    cpu: '4 cores',
    memory: '8GB',
    storage: '50GB',
  },
];

/**
 * Test data helper functions
 */
export const TestDataHelpers = {
  /**
   * Get a random test user
   */
  getRandomUser(): TestUser {
    return mockUsers[Math.floor(Math.random() * mockUsers.length)];
  },

  /**
   * Get a random instance
   */
  getRandomInstance(): TestInstance {
    return mockInstances[Math.floor(Math.random() * mockInstances.length)];
  },

  /**
   * Get user by ID
   */
  getUserById(id: string): TestUser | undefined {
    return mockUsers.find((user) => user.id === id);
  },

  /**
   * Get instance by ID
   */
  getInstanceById(id: string): TestInstance | undefined {
    return mockInstances.find((instance) => instance.id === id);
  },

  /**
   * Generate a unique instance name
   */
  generateInstanceName(): string {
    const timestamp = Date.now();
    return `Test Instance ${timestamp}`;
  },

  /**
   * Generate a unique instance description
   */
  generateInstanceDescription(): string {
    const adjectives = ['Amazing', 'Awesome', 'Fantastic', 'Incredible', 'Superb'];
    const purposes = ['Testing', 'Development', 'Experimentation', 'Exploration', 'Research'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const purpose = purposes[Math.floor(Math.random() * purposes.length)];
    return `${adj} instance for ${purpose}`;
  },
};
