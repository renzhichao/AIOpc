#!/bin/bash
#==============================================================================
# Backend Deployment Scripts Test Suite
#==============================================================================
# Purpose: Validate all deployment scripts before production use

set -e

echo "============================================================"
echo "  Backend Deployment Scripts Test Suite"
echo "============================================================"
echo

PASS_COUNT=0
FAIL_COUNT=0

test_syntax() {
    local script=$1
    echo -n "Testing $script syntax... "
    if bash -n "$script" 2>/dev/null; then
        echo "✓ PASS"
        ((PASS_COUNT++))
    else
        echo "✗ FAIL"
        ((FAIL_COUNT++))
    fi
}

test_exists() {
    local file=$1
    echo -n "Testing $file exists... "
    if [ -f "$file" ]; then
        echo "✓ PASS"
        ((PASS_COUNT++))
    else
        echo "✗ FAIL"
        ((FAIL_COUNT++))
    fi
}

test_executable() {
    local file=$1
    echo -n "Testing $file executable... "
    if [ -x "$file" ]; then
        echo "✓ PASS"
        ((PASS_COUNT++))
    else
        echo "✗ FAIL"
        ((FAIL_COUNT++))
    fi
}

# Test deployment scripts
echo "1. Deployment Scripts"
echo "------------------------------------------------------------"
test_syntax "scripts/cloud/deploy-backend.sh"
test_executable "scripts/cloud/deploy-backend.sh"
echo

echo "2. Environment Configuration Scripts"
echo "------------------------------------------------------------"
test_syntax "scripts/cloud/configure-backend-env.sh"
test_executable "scripts/cloud/configure-backend-env.sh"
echo

echo "3. Health Check Scripts"
echo "------------------------------------------------------------"
test_syntax "scripts/cloud/health-check.sh"
test_executable "scripts/cloud/health-check.sh"
echo

echo "4. Configuration Files"
echo "------------------------------------------------------------"
test_exists "config/pm2/ecosystem.config.js"
test_exists "config/systemd/opclaw-backend.service"
echo

echo "5. Documentation"
echo "------------------------------------------------------------"
test_exists "docs/BACKEND_DEPLOYMENT.md"
echo

echo "============================================================"
echo "  Test Results"
echo "============================================================"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo

if [ $FAIL_COUNT -eq 0 ]; then
    echo "✓ All tests passed!"
    echo "Scripts are ready for deployment."
    exit 0
else
    echo "✗ Some tests failed!"
    echo "Please fix the issues before deploying."
    exit 1
fi
