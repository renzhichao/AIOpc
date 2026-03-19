# Quality Gate Documentation

## Overview

The Quality Gate is a mandatory quality checkpoint that prevents low-quality code from entering the production environment. It enforces specific quality standards for code coverage, linting, type safety, security, and code maintainability.

## Quality Metrics

The following quality metrics are enforced:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| **Test Coverage** | ≥ 80% | Percentage of code covered by automated tests |
| **ESLint Errors** | 0 | Zero ESLint errors allowed |
| **TypeScript Errors** | 0 | Zero type errors allowed |
| **Security Vulnerabilities** | 0 (High/Critical) | No high or critical security vulnerabilities |
| **Code Smells** | ≤ 5 (High Severity) | Maximum 5 high-severity code smells |

## Components

### 1. Quality Gate Script (`scripts/quality-gate.sh`)

The main quality gate script that performs all quality checks.

#### Usage

```bash
# Check all components
./scripts/quality-gate.sh

# Check only backend
./scripts/quality-gate.sh --backend-only

# Check only frontend
./scripts/quality-gate.sh --frontend-only

# Skip coverage check (for rapid development)
./scripts/quality-gate.sh --skip-coverage

# Auto-fix issues where possible
./scripts/quality-gate.sh --fix

# Show help
./scripts/quality-gate.sh --help
```

#### Exit Codes

- `0` - All quality gates passed
- `1` - Quality gate failed
- `2` - Configuration error
- `3` - Tool not found (graceful degradation)

### 2. Pre-commit Hook

Automatically runs quality checks before each commit, preventing low-quality code from being committed.

#### Installation

```bash
# Install the pre-commit hook
./scripts/install-pre-commit-hook.sh
```

This copies `.git/hooks/pre-commit.quality-gate` to `.git/hooks/pre-commit`.

#### Bypassing the Hook

In rare cases where you need to bypass the quality gate:

```bash
git commit --no-verify -m "WIP: temporary bypass"
```

**Warning**: Use `--no-verify` sparingly and only in emergency situations.

#### Uninstallation

```bash
rm .git/hooks/pre-commit
```

### 3. CI Integration (GitHub Actions)

The quality gate is automatically run in CI for all pull requests and pushes to main/develop branches.

**Workflow File**: `.github/workflows/quality-gate.yml`

#### CI Behavior

1. Triggers on:
   - Push to `main` or `develop` branches
   - Pull requests targeting `main` or `develop`

2. Checks:
   - Backend quality gate
   - Frontend quality gate

3. Generates:
   - Quality report in PR comments
   - Coverage artifacts
   - Security audit reports

## Quality Checks Explained

### 1. ESLint Check

**Tool**: ESLint

**Purpose**: Enforces code style and best practices.

**Threshold**: 0 errors

**Common Issues**:

- Unused variables
- Missing semicolons
- Inconsistent quotes
- Improper imports

**How to Fix**:

```bash
# Auto-fix issues
cd platform/backend
npm run lint:fix

# Or manually fix reported issues
npm run lint
```

**Configuration**:
- Backend: `platform/backend/.eslintrc.json`
- Frontend: `platform/frontend/.eslintrc.json`

### 2. TypeScript Check

**Tool**: TypeScript Compiler (`tsc`)

**Purpose**: Ensure type safety and catch type-related errors.

**Threshold**: 0 errors

**Common Issues**:

- Type mismatches
- Missing type definitions
- Implicit any types
- Incorrect prop types

**How to Fix**:

```bash
# Run type check
cd platform/backend
npx tsc --noEmit

# Or use npm script
npm run type-check
```

**Configuration**:
- Backend: `platform/backend/tsconfig.json`
- Frontend: `platform/frontend/tsconfig.json`

### 3. Test Coverage Check

**Tools**: Jest (backend), Vitest (frontend)

**Purpose**: Ensure sufficient test coverage.

**Threshold**: ≥ 80%

**What's Measured**:

- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

**How to Fix**:

```bash
# Generate coverage report
cd platform/backend
npm run test:coverage

# View detailed report
open coverage/lcov-report/index.html
```

**Tips for Improving Coverage**:

1. Write tests for uncovered code paths
2. Test edge cases and error conditions
3. Use test coverage reports to identify gaps
4. Aim for meaningful tests, not just high numbers

### 4. Security Audit

**Tool**: npm audit

**Purpose**: Detect known security vulnerabilities in dependencies.

**Threshold**: 0 high/critical vulnerabilities

**How to Fix**:

```bash
# Check for vulnerabilities
cd platform/backend
npm audit

# Fix automatically (when possible)
npm audit fix

# Force fix (may break dependencies)
npm audit fix --force
```

**Note**: Some vulnerabilities may require manual updates or package replacements.

### 5. Code Smell Detection

**Tool**: Custom analysis

**Purpose**: Detect maintainability issues.

**Threshold**: ≤ 5 high-severity smells

**What's Checked**:

1. **Console.log statements**: Debugging code left in production
2. **TODO/FIXME comments**: Unfinished work
3. **Long files**: Files exceeding 500 lines (potential God Objects)

**How to Fix**:

```bash
# Find all console.log statements
find platform/backend/src -name "*.ts" | xargs grep "console\.log"

# Find TODO/FIXME comments
find platform/backend/src -name "*.ts" | xargs grep "TODO\|FIXME"

# Find long files
find platform/backend/src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500'
```

**Best Practices**:

- Remove debugging code before committing
- Address TODO comments or create issues for them
- Break large files into smaller, focused modules

## Troubleshooting

### Issue: Quality gate fails but local tests pass

**Possible Causes**:

1. Different Node.js versions
2. Different dependency versions
3. Environment-specific issues

**Solutions**:

```bash
# Ensure consistent Node.js version
node --version  # Should be v22

# Clean install dependencies
cd platform/backend
rm -rf node_modules package-lock.json
npm install

# Run quality gate script directly for debugging
./scripts/quality-gate.sh --backend-only
```

### Issue: Pre-commit hook doesn't run

**Possible Causes**:

1. Hook not executable
2. Hook not installed
3. Git configuration bypasses hooks

**Solutions**:

```bash
# Check if hook exists and is executable
ls -la .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit

# Reinstall hook
./scripts/install-pre-commit-hook.sh

# Check Git configuration
git config --get core.hooksPath
```

### Issue: Coverage check fails intermittently

**Possible Causes**:

1. Flaky tests
2. Race conditions
3. Environment timing issues

**Solutions**:

```bash
# Run tests multiple times to identify flakiness
cd platform/backend
npm run test:coverage -- --runInBand

# Increase test timeout
# Add to jest.config.js: testTimeout: 10000

# Skip coverage check temporarily
./scripts/quality-gate.sh --skip-coverage
```

### Issue: ESLint errors after merging

**Possible Causes**:

1. Different ESLint configurations
2. Editor auto-formatting conflicts
3. Outdated ESLint version

**Solutions**:

```bash
# Clear ESLint cache
cd platform/backend
npx eslint --clear-cache

# Run with auto-fix
npm run lint:fix

# Verify configuration
cat .eslintrc.json
```

## Best Practices

### 1. Run Quality Gates Frequently

```bash
# Run before pushing
./scripts/quality-gate.sh

# Run in watch mode during development
cd platform/backend
npm run test:watch
```

### 2. Fix Issues Immediately

Don't accumulate quality issues. Fix them as they occur to prevent technical debt.

### 3. Write Tests First

Adopt Test-Driven Development (TDD) to maintain high coverage from the start.

### 4. Use Auto-fix Where Possible

```bash
# Auto-fix ESLint issues
npm run lint:fix

# Auto-fix Prettier issues
npm run format
```

### 5. Review Coverage Reports

Regularly review coverage reports to identify untested code:

```bash
cd platform/backend
npm run test:coverage
open coverage/lcov-report/index.html
```

## Configuration Reference

### Quality Thresholds

Edit `scripts/quality-gate.sh` to adjust thresholds:

```bash
readonly COVERAGE_THRESHOLD=80
readonly MAX_HIGH_SEVERITY_SMELLS=5
```

### ESLint Configuration

Edit `.eslintrc.json` in each component:

```json
{
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error"
  }
}
```

### TypeScript Configuration

Edit `tsconfig.json` in each component:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}
```

## Integration with Development Workflow

### Recommended Git Workflow

1. Create feature branch
2. Make changes
3. Run quality gate locally
4. Fix any issues
5. Commit (pre-commit hook runs automatically)
6. Push to remote
7. Create pull request
8. CI runs quality gate
9. Address any CI failures
10. Merge when all gates pass

### IDE Integration

**VS Code**:

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "typescript"
  ]
}
```

**WebStorm/IntelliJ**:

- Enable ESLint plugin
- Enable TypeScript inspection
- Configure save actions to run formatting

## Maintenance

### Updating Quality Thresholds

Before changing thresholds, consider:

1. Why is the current threshold insufficient?
2. What impact will the change have?
3. Can code be improved to meet current threshold?
4. Is there consensus among the team?

### Adding New Quality Checks

To add a new quality check:

1. Add check function to `scripts/quality-gate.sh`
2. Add threshold constant
3. Integrate into main execution flow
4. Update this documentation

### Removing Deprecated Checks

Before removing a check:

1. Document why it's no longer needed
2. Ensure no team members rely on it
3. Update CI configuration
4. Update documentation

## References

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Vitest Documentation](https://vitest.dev/)
- [npm Audit Documentation](https://docs.npmjs.com/cli/v9/commands/npm-audit)

## Support

If you encounter issues with the quality gate:

1. Check this documentation first
2. Run the quality gate script directly for debugging
3. Check CI logs for detailed error messages
4. Consult the troubleshooting section above
5. Contact the DevOps team for persistent issues

---

**Last Updated**: 2026-03-18
**Version**: 1.0.0
**Maintained By**: DevOps Team
