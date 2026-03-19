# Quality Gate Quick Start Guide

## Installation

### 1. Install Pre-commit Hook (One-time setup)

```bash
./scripts/install-pre-commit-hook.sh
```

This enables automatic quality checks before every commit.

## Usage

### Run Quality Gate Manually

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
```

## Quality Metrics

| Metric | Threshold | How to Fix |
|--------|-----------|------------|
| **Test Coverage** | ≥ 80% | Write more tests, run `npm run test:coverage` |
| **ESLint Errors** | 0 | Run `npm run lint:fix` in component directory |
| **TypeScript Errors** | 0 | Fix type errors, run `tsc --noEmit` |
| **Security Vulnerabilities** | 0 (High/Critical) | Run `npm audit fix` |
| **Code Smells** | ≤ 5 (High Severity) | Remove console.logs, fix TODOs, refactor long files |

## Common Issues

### Issue: Quality gate fails on commit

**Solution**:
```bash
# See what failed
./scripts/quality-gate.sh

# Auto-fix what you can
./scripts/quality-gate.sh --fix

# If still failing, fix remaining issues manually
```

### Issue: Need to bypass quality gate temporarily

**Solution**:
```bash
git commit --no-verify -m "WIP: temporary bypass"
```

**Warning**: Use sparingly and only in emergencies.

### Issue: Coverage check takes too long

**Solution**:
```bash
# Skip coverage check during development
./scripts/quality-gate.sh --skip-coverage
```

## Component-Specific Commands

### Backend

```bash
cd platform/backend

# Fix ESLint errors
npm run lint:fix

# Check TypeScript types
npx tsc --noEmit

# Run tests with coverage
npm run test:coverage

# Fix security vulnerabilities
npm audit fix
```

### Frontend

```bash
cd platform/frontend

# Fix ESLint errors
npm run lint:fix

# Check TypeScript types
npx tsc --noEmit

# Run tests with coverage
npm run test:coverage

# Fix security vulnerabilities
npm audit fix
```

## Verification

### Verify Quality Gate Installation

```bash
# Check all acceptance criteria
./scripts/verify-quality-gate.sh
```

Expected output: 90%+ pass rate

## CI Integration

Quality gates run automatically in CI for:
- Pull requests to main/develop
- Pushes to main/develop

Check CI logs for detailed quality reports.

## Documentation

Full documentation: `docs/operations/QUALITY_GATE.md`

## Support

If you encounter issues:
1. Check the troubleshooting section in the full documentation
2. Run the quality gate script directly for debugging
3. Check CI logs for detailed error messages

---

**Quick Reference Card** - Keep this handy!
