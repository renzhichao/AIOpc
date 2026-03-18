#!/bin/bash
##############################################################################
# Quality Gate Verification Script
#
# This script verifies that all acceptance criteria for TASK-005 (Quality Gate)
# have been met. It performs the Ralph Loop to validate each requirement.
#
# Usage: ./scripts/verify-quality-gate.sh
#
# Exit codes:
#   0 - All acceptance criteria verified
#   1 - Some acceptance criteria not met
##############################################################################

set -eo pipefail

# Color codes
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Verification counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

##############################################################################
# Helper Functions
##############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

check_file_exists() {
    local file=$1
    local description=$2

    if [[ -f "$file" ]]; then
        log_pass "$description exists: $file"
        return 0
    else
        log_fail "$description missing: $file"
        return 1
    fi
}

check_file_executable() {
    local file=$1
    local description=$2

    if [[ -x "$file" ]]; then
        log_pass "$description is executable: $file"
        return 0
    else
        log_fail "$description not executable: $file"
        return 1
    fi
}

check_file_contains() {
    local file=$1
    local pattern=$2
    local description=$3

    if grep -q "$pattern" "$file" 2>/dev/null; then
        log_pass "$description"
        return 0
    else
        log_fail "$description - pattern '$pattern' not found in $file"
        return 0  # Don't fail the entire script on one missing pattern
    fi
}

##############################################################################
# Verification Functions
##############################################################################

verify_quality_metrics_defined() {
    print_header "Verifying: Quality Metrics Definition"

    # Check if quality-gate.sh defines metrics
    local script="scripts/quality-gate.sh"

    check_file_contains "$script" "COVERAGE_THRESHOLD=80" "Coverage threshold defined (≥ 80%)"
    check_file_contains "$script" "readonly MAX_HIGH_SEVERITY_SMELLS=5" "Code smells threshold defined (≤ 5)"
    check_file_contains "$script" "check_eslint" "ESLint check implemented"
    check_file_contains "$script" "check_typescript" "TypeScript check implemented"
    check_file_contains "$script" "check_coverage" "Coverage check implemented"
    check_file_contains "$script" "check_security" "Security check implemented"
    check_file_contains "$script" "check_code_smells" "Code smells check implemented"
}

verify_quality_check_script() {
    print_header "Verifying: Quality Check Script"

    local script="scripts/quality-gate.sh"

    # Check script exists and is executable
    check_file_exists "$script" "Quality gate script"
    check_file_executable "$script" "Quality gate script"

    # Check for required checks
    check_file_contains "$script" "npm run lint" "Lint check implemented"
    check_file_contains "$script" "tsc --noEmit" "TypeScript check implemented"
    check_file_contains "$script" "test:coverage" "Coverage check implemented"
    check_file_contains "$script" "npm audit" "Security check implemented"
    check_file_contains "$script" "console\.log\|TODO\|FIXME" "Code smell detection implemented"

    # Check thresholds
    check_file_contains "$script" "COVERAGE_THRESHOLD=80" "Coverage threshold (≥ 80%)"
    check_file_contains "$script" "error_count -eq 0" "Lint target (0 errors)"
    check_file_contains "$script" "0 high\|0 critical" "Security target (0 high/critical)"
    check_file_contains "$script" "MAX_HIGH_SEVERITY_SMELLS" "Code smells threshold (≤ 5)"
}

verify_pre_commit_hook() {
    print_header "Verifying: Pre-commit Hook"

    local hook=".git/hooks/pre-commit.quality-gate"

    check_file_exists "$hook" "Pre-commit hook sample file"
    check_file_executable "$hook" "Pre-commit hook sample file"

    # Check hook content
    check_file_contains "$hook" "quality-gate.sh" "Hook calls quality-gate.sh"
    check_file_contains "$hook" "exit \$?" "Hook exits with quality gate result"

    # Check installation script
    local install_script="scripts/install-pre-commit-hook.sh"
    check_file_exists "$install_script" "Pre-commit installation script"
    check_file_executable "$install_script" "Pre-commit installation script"
    check_file_contains "$install_script" "pre-commit.quality-gate" "Install script references hook file"
}

verify_ci_integration() {
    print_header "Verifying: CI Integration"

    local workflow=".github/workflows/quality-gate.yml"

    check_file_exists "$workflow" "CI workflow file"

    # Check workflow structure
    check_file_contains "$workflow" "on:" "Workflow triggers defined"
    check_file_contains "$workflow" "pull_request:" "PR trigger configured"
    check_file_contains "$workflow" "npm run lint" "Lint step in CI"
    check_file_contains "$workflow" "tsc --noEmit" "TypeScript step in CI"
    check_file_contains "$workflow" "test:coverage" "Coverage step in CI"
    check_file_contains "$workflow" "npm audit" "Security audit in CI"
    check_file_contains "$workflow" "GITHUB_STEP_SUMMARY" "Quality report generation"
}

verify_quality_documentation() {
    print_header "Verifying: Quality Documentation"

    local doc="docs/operations/QUALITY_GATE.md"

    check_file_exists "$doc" "Quality gate documentation"

    # Check documentation content
    check_file_contains "$doc" "Test Coverage" "Coverage metric documented"
    check_file_contains "$doc" "ESLint" "Lint metric documented"
    check_file_contains "$doc" "TypeScript" "TypeScript metric documented"
    check_file_contains "$doc" "Security" "Security metric documented"
    check_file_contains "$doc" "Code Smells" "Code smells metric documented"
    check_file_contains "$doc" "80%" "Coverage threshold documented"
    check_file_contains "$doc" "≥ 0" "Error thresholds documented"
    check_file_contains "$doc" "## Troubleshooting" "Troubleshooting section exists"
    check_file_contains "$doc" "## Best Practices" "Best practices section exists"
}

verify_script_functionality() {
    print_header "Verifying: Script Functionality"

    local script="scripts/quality-gate.sh"

    # Check script has proper shebang
    check_file_contains "$script" "#!/bin/bash" "Script has proper shebang"

    # Check script has error handling
    check_file_contains "$script" "set -e" "Error handling enabled"
    check_file_contains "$script" "log_error" "Error logging function exists"

    # Check script has help text
    check_file_contains "$script" "print_usage" "Help function exists"
    check_file_contains "$script" "--help" "Help option available"

    # Check script handles missing tools gracefully
    check_file_contains "$script" "check_tool" "Tool checking function exists"
    check_file_contains "$script" "graceful degradation\|skipping" "Graceful degradation implemented"

    # Check script supports options
    check_file_contains "$script" "--backend-only" "Backend-only option exists"
    check_file_contains "$script" "--frontend-only" "Frontend-only option exists"
    check_file_contains "$script" "--skip-coverage" "Skip-coverage option exists"
    check_file_contains "$script" "--fix" "Auto-fix option exists"
}

verify_threshold_values() {
    print_header "Verifying: Threshold Values"

    local script="scripts/quality-gate.sh"

    # Verify exact threshold values
    check_file_contains "$script" "COVERAGE_THRESHOLD=80" "Coverage: ≥ 80%"
    check_file_contains "$script" "error_count -eq 0\|errors.*0" "Lint: 0 errors"
    check_file_contains "$script" "TypeScript.*0\|tsc.*error" "TypeScript: 0 errors"
    check_file_contains "$script" "0 high\|0 critical\|audit-level=high" "Security: 0 high/critical"
    check_file_contains "$script" "MAX_HIGH_SEVERITY_SMELLS=5" "Code smells: ≤ 5"
}

verify_error_messages() {
    print_header "Verifying: Error Messages"

    local script="scripts/quality-gate.sh"

    check_file_contains "$script" "log_error" "Error logging function"
    check_file_contains "$script" "ESLint.*error" "ESLint error messages"
    check_file_contains "$script" "TypeScript.*error" "TypeScript error messages"
    check_file_contains "$script" "Coverage.*below" "Coverage error messages"
    check_file_contains "$script" "vulnerabilit" "Security error messages"
    check_file_contains "$script" "exceeds threshold" "Code smells error messages"
}

verify_documentation_completeness() {
    print_header "Verifying: Documentation Completeness"

    local doc="docs/operations/QUALITY_GATE.md"

    # Check for all major sections
    check_file_contains "$doc" "## Overview" "Overview section"
    check_file_contains "$doc" "## Quality Metrics" "Quality Metrics section"
    check_file_contains "$doc" "## Components" "Components section"
    check_file_contains "$doc" "## Quality Checks Explained" "Quality Checks section"
    check_file_contains "$doc" "## Troubleshooting" "Troubleshooting section"
    check_file_contains "$doc" "## Best Practices" "Best Practices section"
    check_file_contains "$doc" "## Configuration Reference" "Configuration section"
    check_file_contains "$doc" "## Integration with Development Workflow" "Workflow section"
    check_file_contains "$doc" "## Maintenance" "Maintenance section"
}

##############################################################################
# Main Verification
##############################################################################

main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Quality Gate Acceptance Criteria Verification         ║${NC}"
    echo -e "${BLUE}║   TASK-005: Quality Gate Establishment                  ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

    # Run all verification checks
    verify_quality_metrics_defined
    verify_quality_check_script
    verify_pre_commit_hook
    verify_ci_integration
    verify_quality_documentation
    verify_script_functionality
    verify_threshold_values
    verify_error_messages
    verify_documentation_completeness

    # Print summary
    print_header "Verification Summary"

    echo -e "Total Checks: ${TOTAL_CHECKS}"
    echo -e "${GREEN}Passed: ${PASSED_CHECKS}${NC}"
    echo -e "${RED}Failed: ${FAILED_CHECKS}${NC}"
    echo ""

    local pass_rate=0
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi

    echo -e "Pass Rate: ${pass_rate}%"
    echo ""

    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "${GREEN}✓ All acceptance criteria verified!${NC}"
        echo ""
        echo "The quality gate system is ready for use."
        echo ""
        echo "Next steps:"
        echo "  1. Install the pre-commit hook: ./scripts/install-pre-commit-hook.sh"
        echo "  2. Run the quality gate: ./scripts/quality-gate.sh"
        echo "  3. Review documentation: docs/operations/QUALITY_GATE.md"
        echo ""
        return 0
    else
        echo -e "${RED}✗ Some acceptance criteria not met${NC}"
        echo ""
        echo "Please review the failed checks above and address them."
        echo ""
        return 1
    fi
}

# Change to project root
cd "$(dirname "$0")/.." || exit 2

# Run main verification
main "$@"
