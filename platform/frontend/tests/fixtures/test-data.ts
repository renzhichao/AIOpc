/**
 * Test Data Fixtures
 *
 * This file provides mock data and utilities for E2E testing.
 */

/**
 * Mock users for testing
 */
export const mockUsers = {
  authenticatedUser: {
    id: 'test-user-1',
    name: '开发测试用户',
    email: 'dev@example.com',
    accessToken: 'mock-access-token-1',
    refreshToken: 'mock-refresh-token-1',
  },
  secondUser: {
    id: 'test-user-2',
    name: '第二测试用户',
    email: 'test2@example.com',
    accessToken: 'mock-access-token-2',
    refreshToken: 'mock-refresh-token-2',
  },
  adminUser: {
    id: 'admin-user',
    name: '管理员用户',
    email: 'admin@example.com',
    accessToken: 'mock-admin-token',
    refreshToken: 'mock-admin-refresh',
  },
};

/**
 * Mock users as array for indexed access in tests
 */
export const mockUsersArray = [
  mockUsers.authenticatedUser,
  mockUsers.secondUser,
  mockUsers.adminUser,
];

/**
 * Mock instances for testing
 */
export const mockInstances = {
  runningInstance: {
    id: 'test-instance-1',
    name: '运行中的实例',
    status: 'active',
    template: 'personal',
    createdAt: new Date('2026-03-15T00:00:00Z'),
    expiresAt: new Date('2026-04-15T00:00:00Z'),
  },
  stoppedInstance: {
    id: 'test-instance-2',
    name: '已停止的实例',
    status: 'stopped',
    template: 'team',
    createdAt: new Date('2026-03-10T00:00:00Z'),
    expiresAt: new Date('2026-04-10T00:00:00Z'),
  },
  pendingInstance: {
    id: 'test-instance-3',
    name: '等待中的实例',
    status: 'pending',
    template: 'personal',
    createdAt: new Date('2026-03-15T08:00:00Z'),
    expiresAt: new Date('2026-04-15T08:00:00Z'),
  },
};

/**
 * Instance templates for testing
 */
export const instanceTemplates = {
  personal: {
    id: 'personal',
    name: '个人体验版',
    description: '适合个人用户的基本配置',
    maxMessages: 100,
    maxStorage: 100,
  },
  team: {
    id: 'team',
    name: '团队协作版',
    description: '适合小团队协作的增强配置',
    maxMessages: 1000,
    maxStorage: 1000,
  },
  enterprise: {
    id: 'enterprise',
    name: '企业版',
    description: '企业级完整配置',
    maxMessages: 10000,
    maxStorage: 10000,
  },
};

/**
 * Alias for instanceTemplates - used in tests
 */
export const mockTemplates = instanceTemplates;

/**
 * Valid test data for form inputs
 */
export const validFormData = {
  instanceNames: [
    '我的第一只龙虾',
    '工作助手',
    'AI助理',
    '数据分析助手',
    '客服机器人',
  ],
  instanceDescriptions: [
    '用于日常工作的AI助手',
    '帮助处理数据分析任务',
    '自动化客服回复',
  ],
};

/**
 * Invalid test data for validation testing
 */
export const invalidFormData = {
  tooShortName: '',
  tooLongName: 'a'.repeat(101),
  specialCharsName: '<script>alert("xss")</script>',
};

/**
 * Generate unique test data
 */
export function generateUniqueId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTestInstanceName(): string {
  return `测试实例-${Date.now()}`;
}

export function generateTestInstanceDescription(): string {
  return `自动化测试创建于 ${new Date().toISOString()}`;
}

/**
 * Mock API responses
 */
export const mockApiResponses = {
  healthCheck: {
    status: 'ok',
    timestamp: '2026-03-15T00:00:00Z',
    uptime: 3600,
  },
  authorizeResponse: {
    url: 'http://localhost:3001/authen/v1/authorize?app_id=mock_app_id&redirect_uri=http://localhost:5173/oauth/callback&state=test-state',
  },
  tokenResponse: {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    user: mockUsers.authenticatedUser,
  },
  createInstanceResponse: {
    id: 'new-instance-id',
    name: '新创建的实例',
    status: 'pending',
    template: 'personal',
    createdAt: new Date().toISOString(),
  },
  instanceListResponse: {
    instances: [
      mockInstances.runningInstance,
      mockInstances.stoppedInstance,
      mockInstances.pendingInstance,
    ],
    total: 3,
  },
};

/**
 * Test timeouts
 */
export const testTimeouts = {
  short: 5000,
  medium: 10000,
  long: 30000,
  veryLong: 60000,
};

/**
 * Test selectors
 */
export const selectors = {
  // Login page
  loginPage: '/login',
  qrCode: '[data-testid="qr-code"]',
  logoutButton: '[data-testid="logout-button"]',

  // Dashboard
  dashboard: '/dashboard',
  instanceList: '[data-testid="instance-list"]',
  createButton: '[data-testid="create-instance-button"]',

  // Instance cards
  instanceCard: '[data-testid="instance-card"]',
  instanceName: '[data-testid="instance-name"]',
  instanceStatus: '[data-testid="instance-status"]',
  startButton: '[data-testid="start-button"]',
  stopButton: '[data-testid="stop-button"]',
  deleteButton: '[data-testid="delete-button"]',

  // Forms
  instanceNameInput: '#instance-name',
  instanceTemplateSelect: '#instance-template',
  submitButton: 'button[type="submit"]',

  // Modals
  confirmModal: '[data-testid="confirm-modal"]',
  confirmButton: '[data-testid="confirm-button"]',
  cancelButton: '[data-testid="cancel-button"]',
};

/**
 * Utility functions for test data generation
 */
export const testDataUtils = {
  /**
   * Create a test user with unique ID
   */
  createTestUser(overrides = {}) {
    return {
      id: generateUniqueId(),
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
      accessToken: `token-${Date.now()}`,
      refreshToken: `refresh-${Date.now()}`,
      ...overrides,
    };
  },

  /**
   * Create a test instance with unique ID
   */
  createTestInstance(overrides = {}) {
    return {
      id: generateUniqueId(),
      name: generateTestInstanceName(),
      status: 'active',
      template: 'personal',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  },

  /**
   * Wait for a specific condition
   */
  async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = testTimeouts.medium,
    message = 'Condition not met'
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${message} after ${timeout}ms`);
  },
};

/**
 * Export all utilities
 */
export default {
  mockUsers,
  mockUsersArray,
  mockInstances,
  instanceTemplates,
  validFormData,
  invalidFormData,
  generateUniqueId,
  generateTestInstanceName,
  generateTestInstanceDescription,
  mockApiResponses,
  testTimeouts,
  selectors,
  testDataUtils,
};

/**
 * TestDataHelpers - Alias for testDataUtils for backward compatibility
 */
export const TestDataHelpers = {
  generateInstanceName: generateTestInstanceName,
  generateInstanceDescription: generateTestInstanceDescription,
  generateUniqueId: generateUniqueId,
  createTestUser: testDataUtils.createTestUser,
  createTestInstance: testDataUtils.createTestInstance,
  waitForCondition: testDataUtils.waitForCondition,
};
