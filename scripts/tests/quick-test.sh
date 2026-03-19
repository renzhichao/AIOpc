#!/bin/bash
#==============================================================================
# Quick Deployment Test Suite
# (快速部署测试套件)
#
# Purpose: Quick validation of deployment scripts without complex test framework
#
# Usage: ./scripts/tests/quick-test.sh
#==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test result function
test_result() {
    local test_name="$1"
    local result="$2"

    if [[ "$result" == "0" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        ((TESTS_FAILED++))
    fi
}

echo "========================================"
echo "  Quick Deployment Test Suite"
echo "========================================"
echo

# Test 1: Scripts are executable
echo "Testing script executability..."
for script in scripts/deploy/*.sh scripts/tests/test-deploy-tenant.sh; do
    if [[ -x "$PROJECT_ROOT/$script" ]]; then
        test_result "$script is executable" 0
    else
        test_result "$script is executable" 1
    fi
done
echo

# Test 2: Configuration files exist
echo "Testing configuration files..."
if [[ -f "$PROJECT_ROOT/config/tenants/template.yml" ]]; then
    test_result "template.yml exists" 0
else
    test_result "template.yml exists" 1
fi

if [[ -f "$PROJECT_ROOT/config/tenants/test_tenant_alpha.yml" ]]; then
    test_result "test_tenant_alpha.yml exists" 0
else
    test_result "test_tenant_alpha.yml exists" 1
fi
echo

# Test 3: Libraries can be sourced
echo "Testing library imports..."
for lib in logging.sh config.sh validation.sh state.sh ssh.sh file.sh; do
    if bash -c "source $PROJECT_ROOT/scripts/lib/$lib" 2>/dev/null; then
        test_result "$lib can be sourced" 0
    else
        test_result "$lib can be sourced" 1
    fi
done
echo

# Test 4: Configuration validation
echo "Testing configuration validation..."
if command -v yq &>/dev/null; then
    if yq eval '.' "$PROJECT_ROOT/config/tenants/test_tenant_alpha.yml" &>/dev/null; then
        test_result "Test config is valid YAML" 0
    else
        test_result "Test config is valid YAML" 1
    fi
else
    echo "⊘ yq not installed, skipping YAML validation"
fi
echo

# Test 5: Help commands work
echo "Testing help commands..."
for script in scripts/deploy/deploy-tenant.sh scripts/deploy/pre-deploy.sh scripts/deploy/post-deploy.sh scripts/deploy/rollback-tenant.sh; do
    if bash "$PROJECT_ROOT/$script" --help &>/dev/null; then
        test_result "$script --help works" 0
    else
        test_result "$script --help works" 1
    fi
done
echo

# Summary
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
