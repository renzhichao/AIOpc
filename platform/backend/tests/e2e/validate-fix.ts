#!/usr/bin/env node

/**
 * Docker Initialization Fix Validation Script
 *
 * Validates that the E2E orchestrator fix resolves the
 * "Docker not initialized" error without requiring actual Docker daemon.
 */

const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_FILE = path.join(__dirname, 'orchestrator.ts');
const TEST_FILE = path.join(__dirname, 'scenarios/complete-user-journey.e2e.test.ts');

console.log('=== Validating TASK-053 Docker Initialization Fix ===\n');

// Validation checks
const checks = [
  {
    name: 'Constructor does not call getDocker()',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      const constructorMatch = content.match(/private constructor\(\)\s*{[\s\S]*?^    }/m);
      if (!constructorMatch) return false;
      const constructorBody = constructorMatch[0];
      // Should NOT have getDocker() call
      return !constructorBody.includes('getDocker()');
    }
  },
  {
    name: 'Docker property is nullable',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      return content.includes('private docker: Docker | null') ||
             content.includes('private docker: Docker|null');
    }
  },
  {
    name: 'isDockerConnected flag exists',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      return content.includes('isDockerConnected') &&
             content.includes('boolean');
    }
  },
  {
    name: 'initializeDocker sets Docker after connect',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      const initMatch = content.match(/private async initializeDocker[\s\S]*?^  }/m);
      if (!initMatch) return false;
      const initBody = initMatch[0];
      // Should call connect() BEFORE getDocker()
      const connectPos = initBody.indexOf('await DockerHelper.connect()');
      const getDockerPos = initBody.indexOf('this.docker = DockerHelper.getDocker()');
      return connectPos > 0 && getDockerPos > connectPos;
    }
  },
  {
    name: 'ensureDockerConnected method exists',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      return content.includes('ensureDockerConnected()') &&
             content.includes('Docker not connected');
    }
  },
  {
    name: 'Public getDocker() method exists',
    file: ORCHESTRATOR_FILE,
    test: (content) => {
      return content.match(/getDocker\(\):\s*Docker/) !== null;
    }
  },
  {
    name: 'Test uses getDocker() not private property',
    file: TEST_FILE,
    test: (content) => {
      return content.includes('orchestrator.getDocker()') &&
             !content.includes("orchestrator['docker']");
    }
  }
];

// Run checks
let passed = 0;
let failed = 0;

checks.forEach(check => {
  try {
    const content = fs.readFileSync(check.file, 'utf8');
    const result = check.test(content);

    if (result) {
      console.log(`✓ ${check.name}`);
      passed++;
    } else {
      console.log(`✗ ${check.name}`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ ${check.name} - Error: ${error.message}`);
    failed++;
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
