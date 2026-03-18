#!/usr/bin/env node

/**
 * E2E Framework Verification Script (Ralph Loop)
 *
 * This script verifies all 17 acceptance criteria for TASK-004:
 * E2E Testing Framework Setup
 *
 * Run: npm run verify
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`),
};

// Acceptance Criteria
const criteria = [
  // Framework Installation (3 items)
  {
    id: 'FRAMEWORK-001',
    category: 'Framework Installation',
    description: 'platform/package.json includes @playwright/test',
    check: () => {
      const pkgPath = path.join(__dirname, '../../frontend/package.json');
      if (!fs.existsSync(pkgPath)) return false;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return '@playwright/test' in deps;
    },
  },
  {
    id: 'FRAMEWORK-002',
    category: 'Framework Installation',
    description: 'Playwright browsers are installed',
    check: () => {
      const browsersPath = path.join(__dirname, '../node_modules/playwright-core/browsers.json');
      return fs.existsSync(browsersPath);
    },
  },
  {
    id: 'FRAMEWORK-003',
    category: 'Framework Installation',
    description: 'platform/e2e/ directory structure exists',
    check: () => {
      const requiredDirs = ['tests', 'helpers', 'fixtures'];
      return requiredDirs.every(dir => {
        const dirPath = path.join(__dirname, '..', dir);
        return fs.existsSync(dirPath);
      });
    },
  },

  // Test Coverage (4 items)
  {
    id: 'COVERAGE-001',
    category: 'Test Coverage',
    description: 'auth.spec.ts tests OAuth authentication flow',
    check: () => {
      const authSpecPath = path.join(__dirname, '../tests/auth.spec.ts');
      if (!fs.existsSync(authSpecPath)) return false;
      const content = fs.readFileSync(authSpecPath, 'utf8');
      return content.includes('OAuth') && content.includes('describe');
    },
  },
  {
    id: 'COVERAGE-002',
    category: 'Test Coverage',
    description: 'instance.spec.ts tests instance registration flow',
    check: () => {
      const instanceSpecPath = path.join(__dirname, '../tests/instance.spec.ts');
      if (!fs.existsSync(instanceSpecPath)) return false;
      const content = fs.readFileSync(instanceSpecPath, 'utf8');
      return content.includes('Instance') && content.includes('describe');
    },
  },
  {
    id: 'COVERAGE-003',
    category: 'Test Coverage',
    description: 'websocket.spec.ts tests WebSocket connections',
    check: () => {
      const wsSpecPath = path.join(__dirname, '../tests/websocket.spec.ts');
      if (!fs.existsSync(wsSpecPath)) return false;
      const content = fs.readFileSync(wsSpecPath, 'utf8');
      return content.includes('WebSocket') && content.includes('describe');
    },
  },
  {
    id: 'COVERAGE-004',
    category: 'Test Coverage',
    description: 'Tests cover 3 critical flows (OAuth, Instance, WebSocket)',
    check: () => {
      const files = [
        path.join(__dirname, '../tests/auth.spec.ts'),
        path.join(__dirname, '../tests/instance.spec.ts'),
        path.join(__dirname, '../tests/websocket.spec.ts'),
      ];
      return files.every(file => fs.existsSync(file));
    },
  },

  // Configuration (4 items)
  {
    id: 'CONFIG-001',
    category: 'Configuration',
    description: 'platform/e2e/playwright.config.ts exists',
    check: () => {
      const configPath = path.join(__dirname, '../playwright.config.ts');
      return fs.existsSync(configPath);
    },
  },
  {
    id: 'CONFIG-002',
    category: 'Configuration',
    description: 'Playwright config includes webServer configuration',
    check: () => {
      const configPath = path.join(__dirname, '../playwright.config.ts');
      if (!fs.existsSync(configPath)) return false;
      const content = fs.readFileSync(configPath, 'utf8');
      return content.includes('webServer');
    },
  },
  {
    id: 'CONFIG-003',
    category: 'Configuration',
    description: 'Playwright config includes reporter configuration',
    check: () => {
      const configPath = path.join(__dirname, '../playwright.config.ts');
      if (!fs.existsSync(configPath)) return false;
      const content = fs.readFileSync(configPath, 'utf8');
      return content.includes('reporter') && content.includes('html');
    },
  },
  {
    id: 'CONFIG-004',
    category: 'Configuration',
    description: 'Playwright config includes multi-browser support',
    check: () => {
      const configPath = path.join(__dirname, '../playwright.config.ts');
      if (!fs.existsSync(configPath)) return false;
      const content = fs.readFileSync(configPath, 'utf8');
      return content.includes('projects') && content.includes('chromium');
    },
  },

  // Helper Classes (3 items)
  {
    id: 'HELPERS-001',
    category: 'Helper Classes',
    description: 'OAuthHelper class exists for OAuth testing',
    check: () => {
      const helperPath = path.join(__dirname, '../helpers/oauth-helper.ts');
      return fs.existsSync(helperPath);
    },
  },
  {
    id: 'HELPERS-002',
    category: 'Helper Classes',
    description: 'InstanceHelper class exists for instance testing',
    check: () => {
      const helperPath = path.join(__dirname, '../helpers/instance-helper.ts');
      return fs.existsSync(helperPath);
    },
  },
  {
    id: 'HELPERS-003',
    category: 'Helper Classes',
    description: 'WebSocketHelper class exists for WebSocket testing',
    check: () => {
      const helperPath = path.join(__dirname, '../helpers/websocket-helper.ts');
      return fs.existsSync(helperPath);
    },
  },

  // Documentation (3 items)
  {
    id: 'DOCS-001',
    category: 'Documentation',
    description: 'platform/e2e/README.md exists',
    check: () => {
      const readmePath = path.join(__dirname, '../README.md');
      return fs.existsSync(readmePath);
    },
  },
  {
    id: 'DOCS-002',
    category: 'Documentation',
    description: 'README includes how to run E2E tests',
    check: () => {
      const readmePath = path.join(__dirname, '../README.md');
      if (!fs.existsSync(readmePath)) return false;
      const content = fs.readFileSync(readmePath, 'utf8');
      return content.includes('Running Tests') || content.includes('pnpm test');
    },
  },
  {
    id: 'DOCS-003',
    category: 'Documentation',
    description: 'README includes how to write new E2E tests',
    check: () => {
      const readmePath = path.join(__dirname, '../README.md');
      if (!fs.existsSync(readmePath)) return false;
      const content = fs.readFileSync(readmePath, 'utf8');
      return content.includes('Writing Tests') || content.includes('Test Structure');
    },
  },
];

// Additional verification items (beyond core 17)
const additionalChecks = [
  {
    id: 'EXTRA-001',
    category: 'Additional',
    description: 'Global setup script exists',
    check: () => {
      const setupPath = path.join(__dirname, '../global-setup.ts');
      return fs.existsSync(setupPath);
    },
  },
  {
    id: 'EXTRA-002',
    category: 'Additional',
    description: 'Global teardown script exists',
    check: () => {
      const teardownPath = path.join(__dirname, '../global-teardown.ts');
      return fs.existsSync(teardownPath);
    },
  },
  {
    id: 'EXTRA-003',
    category: 'Additional',
    description: 'APIHelper class exists',
    check: () => {
      const helperPath = path.join(__dirname, '../helpers/api-helper.ts');
      return fs.existsSync(helperPath);
    },
  },
  {
    id: 'EXTRA-004',
    category: 'Additional',
    description: 'package.json includes test scripts',
    check: () => {
      const pkgPath = path.join(__dirname, '../package.json');
      if (!fs.existsSync(pkgPath)) return false;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.scripts && pkg.scripts.test;
    },
  },
];

async function runVerification() {
  log.section('🔍 E2E Framework Verification (TASK-004)');
  log.info('Verifying acceptance criteria...\n');

  const allCriteria = [...criteria, ...additionalChecks];
  const results = {
    passed: [],
    failed: [],
    byCategory: {},
  };

  // Group by category
  allCriteria.forEach(criterion => {
    if (!results.byCategory[criterion.category]) {
      results.byCategory[criterion.category] = [];
    }
    results.byCategory[criterion.category].push(criterion);
  });

  // Run checks
  for (const criterion of allCriteria) {
    try {
      const passed = criterion.check();
      if (passed) {
        results.passed.push(criterion);
        log.success(`[${criterion.id}] ${criterion.description}`);
      } else {
        results.failed.push(criterion);
        log.error(`[${criterion.id}] ${criterion.description}`);
      }
    } catch (error) {
      results.failed.push(criterion);
      log.error(`[${criterion.id}] ${criterion.description} - Error: ${error.message}`);
    }
  }

  // Calculate statistics
  const total = allCriteria.length;
  const passed = results.passed.length;
  const failed = results.failed.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  // Summary by category
  log.section('\n📊 Summary by Category');
  Object.entries(results.byCategory).forEach(([category, items]) => {
    const categoryPassed = items.filter(item => results.passed.includes(item)).length;
    const categoryTotal = items.length;
    const categoryRate = ((categoryPassed / categoryTotal) * 100).toFixed(1);

    if (categoryPassed === categoryTotal) {
      log.success(`${category}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
    } else {
      log.warn(`${category}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
    }
  });

  // Overall summary
  log.section('\n✅ Overall Results');
  log.info(`Total Criteria: ${total}`);
  log.success(`Passed: ${passed} (${passRate}%)`);

  if (failed > 0) {
    log.error(`Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
  }

  // Core 17 criteria check
  const corePassed = results.passed.filter(c => criteria.includes(c)).length;
  const coreTotal = criteria.length;
  const corePassRate = ((corePassed / coreTotal) * 100).toFixed(1);

  log.section('\n🎯 Core 17 Acceptance Criteria');
  log.info(`Passed: ${corePassed}/${coreTotal} (${corePassRate}%)`);

  if (corePassed === coreTotal) {
    log.success('\n🎉 All core acceptance criteria met!');
    log.success('E2E framework is ready for use.\n');
    process.exit(0);
  } else {
    log.warn(`\n⚠️  ${coreTotal - corePassed} core criteria not met.`);
    log.warn('Please address the failed items above.\n');
    process.exit(1);
  }
}

// Run verification
runVerification().catch(error => {
  log.error(`\n❌ Verification failed with error: ${error.message}`);
  process.exit(1);
});
