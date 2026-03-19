#!/bin/bash
##############################################################################
# CI Pipeline Verification Script
#
# Purpose: Verify CI pipeline configuration meets all acceptance criteria
# Usage: ./scripts/verify-ci-pipeline.sh
##############################################################################

set -eo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

##############################################################################
# Helper Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

print_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

check_file_exists() {
    local file=$1
    if [[ -f "$file" ]]; then
        return 0
    else
        return 1
    fi
}

##############################################################################
# Verification Functions
##############################################################################

verify_ci_workflow_file() {
    print_section "1. CI Workflow File"

    if check_file_exists ".github/workflows/ci.yml"; then
        log_success "CI workflow file exists"
    else
        log_error "CI workflow file not found"
    fi
}

verify_ci_jobs() {
    print_section "2. CI Jobs"

    local ci_file=".github/workflows/ci.yml"
    local job_count=0

    for job in "lint" "test" "build" "verify-config" "e2e" "quality-gate"; do
        if grep -q "^[[:space:]]*${job}:" "$ci_file"; then
            log_success "Job found: $job"
            job_count=$((job_count + 1))
        else
            log_error "Job not found: $job"
        fi
    done

    if [[ $job_count -eq 6 ]]; then
        log_success "All 6 CI jobs configured"
    else
        log_error "Expected 6 jobs, found $job_count"
    fi
}

verify_trigger_conditions() {
    print_section "3. Trigger Conditions"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "on:" "$ci_file" && grep -A 5 "on:" "$ci_file" | grep -q "push:"; then
        log_success "Push trigger configured"
    else
        log_error "Push trigger not configured"
    fi

    if grep -A 10 "on:" "$ci_file" | grep -q "pull_request:"; then
        log_success "Pull request trigger configured"
    else
        log_error "Pull request trigger not configured"
    fi

    if grep -A 5 "branches:" "$ci_file" | grep -q "main"; then
        log_success "Main branch trigger configured"
    else
        log_error "Main branch trigger not configured"
    fi

    if grep -A 5 "branches:" "$ci_file" | grep -q "develop"; then
        log_success "Develop branch trigger configured"
    else
        log_error "Develop branch trigger not configured"
    fi
}

verify_eslint_check() {
    print_section "4. ESLint Check"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "pnpm run lint" "$ci_file" || grep -q "npm run lint" "$ci_file"; then
        log_success "ESLint check configured"
    else
        log_error "ESLint check not configured"
    fi
}

verify_typescript_check() {
    print_section "5. TypeScript Check"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "tsc --noEmit" "$ci_file"; then
        log_success "TypeScript type check configured"
    else
        log_error "TypeScript type check not configured"
    fi
}

verify_prettier_check() {
    print_section "6. Prettier Check"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "format.*--check" "$ci_file"; then
        log_success "Prettier format check configured"
    else
        log_warning "Prettier format check not found - optional"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
}

verify_unit_tests() {
    print_section "7. Unit Tests"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  test:" "$ci_file" | grep -q "pnpm run test"; then
        log_success "Unit tests configured"
    else
        log_error "Unit tests not configured"
    fi
}

verify_coverage_report() {
    print_section "8. Coverage Report"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "test:coverage" "$ci_file"; then
        log_success "Test coverage report configured"
    else
        log_error "Test coverage report not configured"
    fi

    if grep -q "coverage.*80" "$ci_file" || grep -q "COVERAGE.*80" "$ci_file"; then
        log_success "Coverage threshold 80% or higher configured"
    else
        log_error "Coverage threshold 80% not configured"
    fi
}

verify_e2e_integration() {
    print_section "9. E2E Integration"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 50 "^  e2e:" "$ci_file" | grep -q "playwright test"; then
        log_success "E2E tests integrated - Playwright"
    else
        log_error "E2E tests not integrated"
    fi

    if grep -A 10 "matrix:" "$ci_file" | grep -q "chromium"; then
        log_success "Multiple browsers configured"
    else
        log_warning "Multiple browsers not fully configured"
    fi
}

verify_backend_build() {
    print_section "10. Backend Build"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  build:" "$ci_file" | grep -q "pnpm run build"; then
        log_success "Backend build verification configured"
    else
        log_error "Backend build verification not configured"
    fi
}

verify_frontend_build() {
    print_section "11. Frontend Build"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  build:" "$ci_file" | grep -q "pnpm run build"; then
        log_success "Frontend build verification configured"
    else
        log_error "Frontend build verification not configured"
    fi
}

verify_build_artifacts() {
    print_section "12. Build Artifacts"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "actions/upload-artifact" "$ci_file"; then
        log_success "Build artifacts upload configured"
    else
        log_error "Build artifacts upload not configured"
    fi

    if grep -q "retention-days: 7" "$ci_file"; then
        log_success "Build artifacts retention 7 days configured"
    else
        log_error "Build artifacts retention 7 days not configured"
    fi
}

verify_config_file_count() {
    print_section "13. Config File Count"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  verify-config:" "$ci_file" | grep -q "CONFIG_COUNT"; then
        log_success "Config file count check configured"
    else
        log_error "Config file count check not configured"
    fi
}

verify_placeholder_detection() {
    print_section "14. Placeholder Detection"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  verify-config:" "$ci_file" | grep -q "cli_xxxxxxxxxxxxx\|CHANGE_THIS\|placeholder"; then
        log_success "Placeholder detection configured"
    else
        log_error "Placeholder detection not configured"
    fi
}

verify_required_variables() {
    print_section "15. Required Variables"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 30 "^  verify-config:" "$ci_file" | grep -q "DB_HOST\|DB_PORT\|JWT_SECRET"; then
        log_success "Required variables detection configured"
    else
        log_error "Required variables detection not configured"
    fi
}

verify_quality_gate_job() {
    print_section "16. Quality Gate Job"

    local ci_file=".github/workflows/ci.yml"

    if grep -A 20 "^  quality-gate:" "$ci_file" | grep -q "quality-gate.sh"; then
        log_success "Quality gate job configured"
    else
        log_error "Quality gate job not configured"
    fi
}

verify_quality_gate_metrics() {
    print_section "17. Quality Gate Metrics"

    if check_file_exists "scripts/quality-gate.sh"; then
        log_success "Quality gate script exists"
    else
        log_error "Quality gate script not found"
    fi

    local quality_script="scripts/quality-gate.sh"
    if grep -q "COVERAGE_THRESHOLD=80" "$quality_script"; then
        log_success "Coverage threshold 80% in quality gate"
    else
        log_error "Coverage threshold 80% not in quality gate"
    fi
}

verify_parallel_execution() {
    print_section "18. Parallel Execution"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "strategy:" "$ci_file" && grep -q "matrix:" "$ci_file"; then
        log_success "Parallel execution configured"
    else
        log_error "Parallel execution not configured"
    fi
}

verify_caching() {
    print_section "19. Caching Strategy"

    local ci_file=".github/workflows/ci.yml"

    if grep -q "actions/cache" "$ci_file" && grep -q "pnpm" "$ci_file"; then
        log_success "pnpm cache configured"
    else
        log_error "pnpm cache not configured"
    fi

    if grep -q "ms-playwright" "$ci_file"; then
        log_success "Playwright browser cache configured"
    else
        log_error "Playwright browser cache not configured"
    fi

    if grep -q "k6" "$ci_file" && grep -q "cache" "$ci_file"; then
        log_success "k6 cache configured"
    else
        log_warning "k6 cache not found - optional"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
}

verify_pr_check_workflow() {
    print_section "20. PR Check Workflow"

    if check_file_exists ".github/workflows/pr-check.yml"; then
        log_success "PR check workflow exists"
    else
        log_error "PR check workflow not found"
    fi

    local pr_file=".github/workflows/pr-check.yml"

    if grep -q "pull_request:" "$pr_file"; then
        log_success "PR check trigger configured"
    else
        log_error "PR check trigger not configured"
    fi

    local found_jobs=0
    for job in "lint" "test" "build"; do
        if grep -q "job:${job}" "$pr_file" || grep -q "^[[:space:]]*${job}:" "$pr_file"; then
            found_jobs=$((found_jobs + 1))
        fi
    done

    if [[ $found_jobs -eq 3 ]]; then
        log_success "All critical PR check jobs configured"
    else
        log_error "Critical PR check jobs missing - found $found_jobs of 3"
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} CI Pipeline Verification - TASK-009  ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    verify_ci_workflow_file
    verify_ci_jobs
    verify_trigger_conditions
    verify_eslint_check
    verify_typescript_check
    verify_prettier_check
    verify_unit_tests
    verify_coverage_report
    verify_e2e_integration
    verify_backend_build
    verify_frontend_build
    verify_build_artifacts
    verify_config_file_count
    verify_placeholder_detection
    verify_required_variables
    verify_quality_gate_job
    verify_quality_gate_metrics
    verify_parallel_execution
    verify_caching
    verify_pr_check_workflow

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}         Verification Summary           ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Total Checks:  ${TOTAL_CHECKS}"
    echo -e "${GREEN}Passed:        ${PASSED_CHECKS}${NC}"
    echo -e "${RED}Failed:        ${FAILED_CHECKS}${NC}"
    echo ""

    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        local pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
        echo -e "Pass Rate:     ${pass_rate}%"
        echo ""

        if [[ $FAILED_CHECKS -eq 0 ]]; then
            echo -e "${GREEN}PASS All verification checks passed!${NC}"
            echo -e "${BLUE}========================================${NC}"
            echo ""
            return 0
        else
            echo -e "${RED}FAIL Verification failed with ${FAILED_CHECKS} errors${NC}"
            echo -e "${BLUE}========================================${NC}"
            echo ""
            log_info "Please review the failed checks above"
            return 1
        fi
    else
        echo -e "${RED}FAIL No verification checks were run${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        return 1
    fi
}

cd "$(dirname "$0")/.." || exit 2
main "$@"
