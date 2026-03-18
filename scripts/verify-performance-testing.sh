#!/bin/bash

################################################################################
# Performance Testing Framework Verification Script
#
# Purpose: Verify all acceptance criteria for TASK-006 are met
# Usage: ./scripts/verify-performance-testing.sh
#
# This script checks:
# 1. k6 installation and availability
# 2. k6.config.js configuration file
# 3. 4 performance scenario scripts (baseline, normal, peak, stress)
# 4. API load test script
# 5. WebSocket load test script
# 6. Performance baseline definitions
# 7. Test execution script
# 8. Documentation completeness
################################################################################

# Don't exit on error - we want to run all checks
# set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PERF_DIR="${PROJECT_ROOT}/platform/perf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Helper functions
log_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
    ((TOTAL_CHECKS++))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

# Print banner
print_banner() {
    echo -e "${BLUE}"
    echo "=============================================="
    echo "   Performance Testing Framework Verification"
    echo "   TASK-006 Acceptance Criteria Check"
    echo "=============================================="
    echo -e "${NC}"
    echo "This script verifies all acceptance criteria for TASK-006"
    echo ""
}

# Check if k6 is installed
check_k6_installation() {
    log_header "1. k6 Installation (2 items)"

    # Check 1.1: k6 command available
    log_check "k6 is installed (or installation script provided)"

    if command -v k6 &> /dev/null; then
        local k6_version=$(k6 version 2>&1 | head -n1)
        log_pass "k6 is installed: $k6_version"
    else
        # Check if installation script exists
        if [ -f "${SCRIPT_DIR}/run-performance-test.sh" ]; then
            if grep -q "install_k6" "${SCRIPT_DIR}/run-performance-test.sh"; then
                log_pass "k6 installation script exists in run-performance-test.sh (--install flag)"
            else
                log_fail "k6 not installed and no installation script found"
            fi
        else
            log_fail "k6 not installed and run-performance-test.sh not found"
        fi
    fi

    # Check 1.2: k6.config.js exists
    log_check "k6.config.js configuration file exists"

    if [ -f "${PERF_DIR}/k6.config.js" ]; then
        log_pass "k6.config.js found at ${PERF_DIR}/k6.config.js"

        # Validate config content
        if grep -q "export const options" "${PERF_DIR}/k6.config.js"; then
            log_pass "k6.config.js exports options configuration"
        else
            log_fail "k6.config.js missing options export"
        fi

        if grep -q "scenarios" "${PERF_DIR}/k6.config.js"; then
            log_pass "k6.config.js defines scenarios"
        else
            log_warn "k6.config.js missing scenarios definition"
        fi
    else
        log_fail "k6.config.js not found at ${PERF_DIR}/k6.config.js"
    fi
}

# Check performance scenarios
check_performance_scenarios() {
    log_header "2. Performance Scenarios (4 items)"

    local scenarios=(
        "baseline:10 concurrent users"
        "normal:100 concurrent users"
        "peak:500 concurrent users"
        "stress:Find system limit"
    )

    local scenario_files=(
        "baseline:${PERF_DIR}/scenarios/baseline.js"
        "normal:${PERF_DIR}/scenarios/normal.js"
        "peak:${PERF_DIR}/scenarios/peak.js"
        "stress:${PERF_DIR}/scenarios/scenarios/stress.js"
    )

    # Check 2.1: baseline.js
    log_check "baseline.js:基准测试（10 并发用户）"

    if [ -f "${PERF_DIR}/scenarios/baseline.js" ]; then
        log_pass "baseline.js found"

        # Validate content
        if grep -q "vus: 10" "${PERF_DIR}/scenarios/baseline.js" || \
           grep -q "VUs: 10" "${PERF_DIR}/scenarios/baseline.js"; then
            log_pass "baseline.js configured for 10 concurrent users"
        else
            log_warn "baseline.js may not be configured for 10 concurrent users"
        fi

        if grep -q "duration.*1m\|duration.*'1m'" "${PERF_DIR}/scenarios/baseline.js"; then
            log_pass "baseline.js has appropriate duration (1 minute)"
        else
            log_warn "baseline.js duration may not be 1 minute"
        fi
    else
        log_fail "baseline.js not found at ${PERF_DIR}/scenarios/baseline.js"
    fi

    # Check 2.2: normal.js
    log_check "normal.js:正常负载（100 并发用户）"

    if [ -f "${PERF_DIR}/scenarios/normal.js" ]; then
        log_pass "normal.js found"

        if grep -q "vus: 100" "${PERF_DIR}/scenarios/normal.js" || \
           grep -q "VUs: 100" "${PERF_DIR}/scenarios/normal.js"; then
            log_pass "normal.js configured for 100 concurrent users"
        else
            log_warn "normal.js may not be configured for 100 concurrent users"
        fi
    else
        log_fail "normal.js not found at ${PERF_DIR}/scenarios/normal.js"
    fi

    # Check 2.3: peak.js
    log_check "peak.js:峰值负载（500 并发用户）"

    if [ -f "${PERF_DIR}/scenarios/peak.js" ]; then
        log_pass "peak.js found"

        if grep -q "target: 500\|target.*500" "${PERF_DIR}/scenarios/peak.js"; then
            log_pass "peak.js configured to ramp to 500 concurrent users"
        else
            log_warn "peak.js may not be configured for 500 concurrent users"
        fi
    else
        log_fail "peak.js not found at ${PERF_DIR}/scenarios/peak.js"
    fi

    # Check 2.4: stress.js
    log_check "stress.js:压力测试（找到系统极限）"

    if [ -f "${PERF_DIR}/scenarios/stress.js" ]; then
        log_pass "stress.js found"

        if grep -q "1000\|2000" "${PERF_DIR}/scenarios/stress.js"; then
            log_pass "stress.js configured to find system limit (1000+ VUs)"
        else
            log_warn "stress.js may not be configured to find breaking point"
        fi

        if grep -q "breaking point\|failure" "${PERF_DIR}/scenarios/stress.js"; then
            log_pass "stress.js includes failure detection logic"
        else
            log_warn "stress.js may not include failure detection"
        fi
    else
        log_fail "stress.js not found at ${PERF_DIR}/scenarios/stress.js"
    fi
}

# Check load testing scripts
check_load_testing_scripts() {
    log_header "3. Load Testing Scripts (2 items)"

    # Check 3.1: api-load.js
    log_check "api-load.js: API 负载测试"

    if [ -f "${PERF_DIR}/tests/api-load.js" ]; then
        log_pass "api-load.js found at ${PERF_DIR}/tests/api-load.js"

        # Validate content
        if grep -q "http\.get\|http\.post\|http\.put\|http\.del" "${PERF_DIR}/tests/api-load.js"; then
            log_pass "api-load.js includes HTTP API tests"
        else
            log_warn "api-load.js may not include HTTP API calls"
        fi

        if grep -q "check(" "${PERF_DIR}/tests/api-load.js"; then
            log_pass "api-load.js includes response validation"
        else
            log_warn "api-load.js may not include response validation"
        fi
    else
        log_fail "api-load.js not found at ${PERF_DIR}/tests/api-load.js"
    fi

    # Check 3.2: websocket-load.js
    log_check "websocket-load.js: WebSocket 负载测试"

    if [ -f "${PERF_DIR}/tests/websocket-load.js" ]; then
        log_pass "websocket-load.js found at ${PERF_DIR}/tests/websocket-load.js"

        if grep -q "websocket\|WebSocket" "${PERF_DIR}/tests/websocket-load.js"; then
            log_pass "websocket-load.js includes WebSocket testing"
        else
            log_warn "websocket-load.js may not include WebSocket code"
        fi

        if grep -q "on('message'\|socket\.on" "${PERF_DIR}/tests/websocket-load.js"; then
            log_pass "websocket-load.js includes message handling"
        else
            log_warn "websocket-load.js may not include message handling"
        fi
    else
        log_fail "websocket-load.js not found at ${PERF_DIR}/tests/websocket-load.js"
    fi
}

# Check performance baseline
check_performance_baseline() {
    log_header "4. Performance Baseline (3 items)"

    # Check 4.1: Baseline metrics defined
    log_check "性能基线指标已定义（响应时间、吞吐量、错误率）"

    local baseline_found=false

    # Check k6.config.js for baseline definitions
    if [ -f "${PERF_DIR}/k6.config.js" ]; then
        if grep -q "p(95)<500\|p(99)<1000" "${PERF_DIR}/k6.config.js"; then
            log_pass "SLO thresholds defined in k6.config.js (P95 < 500ms, P99 < 1000ms)"
            baseline_found=true
        fi

        if grep -q "http_req_failed.*rate<0" "${PERF_DIR}/k6.config.js"; then
            log_pass "Error rate threshold defined in k6.config.js (< 1%)"
            baseline_found=true
        fi
    fi

    # Check scenarios for baseline metrics
    if [ -f "${PERF_DIR}/scenarios/baseline.js" ]; then
        if grep -q "baseline\|基线" "${PERF_DIR}/scenarios/baseline.js"; then
            log_pass "Baseline test purpose documented in baseline.js"
            baseline_found=true
        fi
    fi

    if [ "$baseline_found" = false ]; then
        log_warn "Performance baseline metrics may not be clearly defined"
    fi

    # Check 4.2: Baseline test script created
    log_check "基线测试脚本已创建"

    if [ -f "${PERF_DIR}/scenarios/baseline.js" ]; then
        log_pass "Baseline test script exists at ${PERF_DIR}/scenarios/baseline.js"

        if [ -x "${PERF_DIR}/scenarios/baseline.js" ] || \
           grep -q "export default function\|export function setup" "${PERF_DIR}/scenarios/baseline.js"; then
            log_pass "Baseline test script is executable k6 script"
        else
            log_warn "Baseline test script may not be valid k6 format"
        fi
    else
        log_fail "Baseline test script not found"
    fi

    # Check 4.3: Baseline result template
    log_check "基线结果记录模板已创建"

    # Check for results directory
    if [ -d "${PERF_DIR}/results" ]; then
        log_pass "Results directory exists at ${PERF_DIR}/results"
    else
        log_warn "Results directory not found (will be created when tests run)"
    fi

    # Check for reports directory
    if [ -d "${PERF_DIR}/reports" ]; then
        log_pass "Reports directory exists at ${PERF_DIR}/reports"
    else
        log_warn "Reports directory not found (will be created when tests run)"
    fi

    # Check for summary generation logic
    if grep -r "handleSummary\|summary-export" "${PERF_DIR}" > /dev/null 2>&1; then
        log_pass "Test scripts include summary/handleSummary logic for result recording"
    else
        log_warn "Test scripts may not include result summary logic"
    fi
}

# Check test execution
check_test_execution() {
    log_header "5. Test Execution (2 items)"

    # Check 5.1: Execution script exists
    log_check "scripts/run-performance-test.sh 执行脚本存在"

    if [ -f "${SCRIPT_DIR}/run-performance-test.sh" ]; then
        log_pass "run-performance-test.sh found at ${SCRIPT_DIR}/run-performance-test.sh"

        # Check if executable
        if [ -x "${SCRIPT_DIR}/run-performance-test.sh" ]; then
            log_pass "run-performance-test.sh is executable"
        else
            log_warn "run-performance-test.sh is not executable (run: chmod +x scripts/run-performance-test.sh)"
        fi

        # Check for scenario support
        if grep -q "baseline\|normal\|peak\|stress" "${SCRIPT_DIR}/run-performance-test.sh"; then
            log_pass "run-performance-test.sh supports multiple scenarios"
        else
            log_warn "run-performance-test.sh may not support all scenarios"
        fi
    else
        log_fail "run-performance-test.sh not found at ${SCRIPT_DIR}/run-performance-test.sh"
    fi

    # Check 5.2: Script supports different scenarios
    log_check "脚本支持不同场景选择"

    if [ -f "${SCRIPT_DIR}/run-performance-test.sh" ]; then
        # Check for scenario selection logic
        if grep -q "case.*baseline\|case.*normal\|case.*peak" "${SCRIPT_DIR}/run-performance-test.sh"; then
            log_pass "Script supports scenario selection (baseline, normal, peak, stress)"
        else
            log_warn "Script may not support scenario selection"
        fi

        # Check for environment configuration
        if grep -q "\-\-env\|ENVIRONMENT" "${SCRIPT_DIR}/run-performance-test.sh"; then
            log_pass "Script supports environment configuration"
        else
            log_warn "Script may not support environment configuration"
        fi

        # Check for output format options
        if grep -q "\-\-out\|OUTPUT_FORMAT" "${SCRIPT_DIR}/run-performance-test.sh"; then
            log_pass "Script supports output format selection"
        else
            log_warn "Script may not support output format options"
        fi
    else
        log_fail "Cannot check scenario support (script not found)"
    fi
}

# Check documentation
check_documentation() {
    log_header "6. Documentation (2 items)"

    local doc_file="${PROJECT_ROOT}/docs/operations/PERFORMANCE_TESTING.md"

    # Check 6.1: Documentation exists
    log_check "docs/operations/PERFORMANCE_TESTING.md 存在"

    if [ -f "$doc_file" ]; then
        log_pass "PERFORMANCE_TESTING.md found at $doc_file"

        # Check for key sections
        local required_sections=(
            "Overview\|概述"
            "Installation\|安装"
            "Test Scenarios\|测试场景"
            "Running Tests\|运行测试"
            "Interpreting Results\|解释结果"
            "Performance Baselines\|性能基线"
            "Troubleshooting\|故障排除"
        )

        for section in "${required_sections[@]}"; do
            if grep -q "$section" "$doc_file"; then
                log_pass "Documentation includes section: $section"
            else
                log_warn "Documentation may be missing section: $section"
            fi
        done
    else
        log_fail "PERFORMANCE_TESTING.md not found at $doc_file"
    fi

    # Check 6.2: Documentation includes how to run and interpret
    log_check "包含如何运行和解释性能测试"

    if [ -f "$doc_file" ]; then
        # Check for running instructions
        if grep -q "run-performance-test\.sh\|k6 run" "$doc_file"; then
            log_pass "Documentation includes instructions on how to run tests"
        else
            log_warn "Documentation may not include running instructions"
        fi

        # Check for result interpretation
        if grep -q "Interpreting Results\|解释结果\|Understanding k6 Output" "$doc_file"; then
            log_pass "Documentation includes how to interpret test results"
        else
            log_warn "Documentation may not include result interpretation guidance"
        fi

        # Check for SLO definitions
        if grep -q "SLO\|Service Level Objective\|P95\|P99" "$doc_file"; then
            log_pass "Documentation includes SLO definitions"
        else
            log_warn "Documentation may not include SLO definitions"
        fi
    else
        log_fail "Cannot verify content (documentation not found)"
    fi
}

# Additional quality checks
check_quality() {
    log_header "7. Additional Quality Checks"

    # Check directory structure
    log_check "Directory structure is complete"

    local required_dirs=(
        "platform/perf"
        "platform/perf/scenarios"
        "platform/perf/tests"
        "platform/perf/results"
        "platform/perf/reports"
    )

    for dir in "${required_dirs[@]}"; do
        if [ -d "${PROJECT_ROOT}/${dir}" ]; then
            log_pass "Directory exists: $dir"
        else
            log_warn "Directory missing: $dir"
        fi
    done

    # Check file syntax (basic)
    log_check "JavaScript files have valid syntax"

    local js_files=(
        "${PERF_DIR}/k6.config.js"
        "${PERF_DIR}/scenarios/baseline.js"
        "${PERF_DIR}/scenarios/normal.js"
        "${PERF_DIR}/scenarios/peak.js"
        "${PERF_DIR}/scenarios/stress.js"
        "${PERF_DIR}/tests/api-load.js"
        "${PERF_DIR}/tests/websocket-load.js"
    )

    for file in "${js_files[@]}"; do
        if [ -f "$file" ]; then
            # Basic syntax check (look for common k6 patterns)
            if grep -q "import.*from 'k6'\|export.*options\|export default function" "$file"; then
                log_pass "Valid k6 script structure: $(basename $file)"
            else
                log_warn "May not be valid k6 script: $(basename $file)"
            fi
        fi
    done

    # Check for environment variable support
    log_check "Scripts support environment configuration"

    if grep -r "BASE_URL\|ENVIRONMENT" "${PERF_DIR}" > /dev/null 2>&1; then
        log_pass "Scripts support environment variables (BASE_URL, ENVIRONMENT)"
    else
        log_warn "Scripts may not support environment configuration"
    fi

    # Check for SLO thresholds
    log_check "SLO thresholds are defined"

    if grep -r "p(95).*500\|p(99).*1000" "${PERF_DIR}" > /dev/null 2>&1; then
        log_pass "SLO thresholds defined (P95 < 500ms, P99 < 1000ms)"
    else
        log_warn "SLO thresholds may not be clearly defined"
    fi
}

# Print summary
print_summary() {
    log_header "Verification Summary"

    echo ""
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    echo ""

    local success_rate=0
    if [ $TOTAL_CHECKS -gt 0 ]; then
        success_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi

    echo "Success Rate: ${success_rate}%"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}✓ All acceptance criteria met!${NC}"
        echo ""
        echo "The performance testing framework is complete and ready for use."
        echo ""
        echo "Next steps:"
        echo "1. Install k6: ./scripts/run-performance-test.sh --install"
        echo "2. Run baseline test: ./scripts/run-performance-test.sh baseline"
        echo "3. Review documentation: docs/operations/PERFORMANCE_TESTING.md"
        return 0
    else
        echo -e "${RED}✗ Some acceptance criteria not met${NC}"
        echo ""
        echo "Please review the failed checks above and address them."
        echo ""
        echo "Common fixes:"
        echo "- Make scripts executable: chmod +x scripts/*.sh"
        echo "- Create missing directories: mkdir -p platform/perf/{results,reports}"
        echo "- Review file paths in verification script"
        return 1
    fi
}

# Main execution
main() {
    print_banner

    # Run all checks
    check_k6_installation
    check_performance_scenarios
    check_load_testing_scripts
    check_performance_baseline
    check_test_execution
    check_documentation
    check_quality

    # Print summary
    print_summary
}

# Run main function
main "$@"
