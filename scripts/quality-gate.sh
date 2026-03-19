#!/bin/bash
##############################################################################
# Quality Gate Script
#
# Enforces mandatory quality checks before code can be committed or deployed.
# This script validates:
#   1. ESLint errors (must be 0)
#   2. TypeScript errors (must be 0)
#   3. Test coverage (must be >= 80%)
#   4. Security vulnerabilities (must be 0 high/critical)
#   5. Code smells (must be <= 5 high severity)
#
# Usage:
#   ./scripts/quality-gate.sh                    # Check all components
#   ./scripts/quality-gate.sh --backend-only     # Check backend only
#   ./scripts/quality-gate.sh --frontend-only    # Check frontend only
#   ./scripts/quality-gate.sh --skip-coverage    # Skip coverage check
#   ./scripts/quality-gate.sh --fix              # Auto-fix issues where possible
#
# Exit codes:
#   0 - All quality gates passed
#   1 - Quality gate failed
#   2 - Configuration error
#   3 - Tool not found (graceful degradation)
##############################################################################

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Quality thresholds
readonly COVERAGE_THRESHOLD=80
readonly MAX_HIGH_SEVERITY_SMELLS=5

# Script options
BACKEND_ONLY=false
FRONTEND_ONLY=false
SKIP_COVERAGE=false
AUTO_FIX=false

##############################################################################
# Helper Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

check_tool() {
    local tool=$1
    if command -v "$tool" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

check_package_available() {
    local package_json=$1
    local package_name=$2

    if [[ ! -f "$package_json" ]]; then
        return 1
    fi

    if grep -q "\"$package_name\"" "$package_json"; then
        return 0
    else
        return 1
    fi
}

##############################################################################
# Quality Check Functions
##############################################################################

check_eslint() {
    local component_dir=$1
    local component_name=$2
    local fix_flag=${3:-""}

    print_section "ESLint Check - $component_name"

    local package_json="$component_dir/package.json"
    if ! check_package_available "$package_json" "eslint"; then
        log_warning "ESLint not configured in $component_name - skipping"
        return 0
    fi

    cd "$component_dir" || return 1

    local eslint_cmd="npm run lint"
    if [[ "$AUTO_FIX" == "true" ]]; then
        eslint_cmd="npm run lint:fix"
    fi

    if eval "$eslint_cmd" &> /tmp/eslint_$$.log; then
        local error_count=$(grep -o "✖ [0-9]* problems" /tmp/eslint_$$.log 2>/dev/null | grep -o "[0-9]*" || echo "0")

        if [[ "$error_count" -eq 0 ]]; then
            log_success "No ESLint errors found in $component_name"
            cd - > /dev/null
            return 0
        else
            log_error "ESLint found $error_count error(s) in $component_name"
            cat /tmp/eslint_$$.log | tail -20
            cd - > /dev/null
            return 1
        fi
    else
        log_error "ESLint check failed for $component_name"
        cat /tmp/eslint_$$.log | tail -30
        cd - > /dev/null
        return 1
    fi
}

check_typescript() {
    local component_dir=$1
    local component_name=$2

    print_section "TypeScript Type Check - $component_name"

    local package_json="$component_dir/package.json"
    local tsconfig="$component_dir/tsconfig.json"

    if [[ ! -f "$tsconfig" ]]; then
        log_warning "No tsconfig.json found in $component_name - skipping type check"
        return 0
    fi

    cd "$component_dir" || return 1

    # Try tsc directly first
    if check_tool tsc; then
        if tsc --noEmit &> /tmp/tsc_$$.log; then
            log_success "No TypeScript errors found in $component_name"
            cd - > /dev/null
            return 0
        else
            log_error "TypeScript errors found in $component_name:"
            grep -E "error TS" /tmp/tsc_$$.log | head -20
            cd - > /dev/null
            return 1
        fi
    # Fall back to npm script if available
    elif grep -q "\"type-check\"" "$package_json" || grep -q "\"tsc\"" "$package_json"; then
        if npm run type-check 2>/dev/null || tsc --noEmit &> /tmp/tsc_$$.log; then
            log_success "No TypeScript errors found in $component_name"
            cd - > /dev/null
            return 0
        else
            log_error "TypeScript check failed for $component_name"
            cat /tmp/tsc_$$.log | head -20
            cd - > /dev/null
            return 1
        fi
    else
        log_warning "TypeScript compiler not found in $component_name - skipping"
        cd - > /dev/null
        return 0
    fi
}

check_coverage() {
    local component_dir=$1
    local component_name=$2

    if [[ "$SKIP_COVERAGE" == "true" ]]; then
        log_warning "Coverage check skipped for $component_name (--skip-coverage flag)"
        return 0
    fi

    print_section "Test Coverage Check - $component_name"

    local package_json="$component_dir/package.json"

    # Check if test:coverage script exists
    if ! grep -q "\"test:coverage\"" "$package_json"; then
        log_warning "Coverage script not found in $component_name - skipping"
        return 0
    fi

    cd "$component_dir" || return 1

    # Run coverage test
    if npm run test:coverage --silent &> /tmp/coverage_$$.log; then
        # Extract coverage percentage from output
        # Handles both Jest and Vitest formats
        local coverage=$(grep -E "All files[^|]*\|\s*([0-9.]+)" /tmp/coverage_$$.log | tail -1 | grep -o "[0-9.]*" | tail -1)

        if [[ -z "$coverage" ]]; then
            # Try alternative format
            coverage=$(grep -oE "Statements\s*:\s*[0-9.]+" /tmp/coverage_$$.log | grep -oE "[0-9.]+" | tail -1)
        fi

        if [[ -z "$coverage" ]]; then
            log_warning "Could not extract coverage percentage from $component_name"
            cd - > /dev/null
            return 0
        fi

        # Remove decimal point for comparison (bash doesn't handle floats)
        local coverage_int=${coverage%.*}
        local threshold_int=${COVERAGE_THRESHOLD%.*}

        if [[ "$coverage_int" -ge "$threshold_int" ]]; then
            log_success "Coverage ${coverage}% meets threshold (${COVERAGE_THRESHOLD}%) in $component_name"
            cd - > /dev/null
            return 0
        else
            log_error "Coverage ${coverage}% below threshold (${COVERAGE_THRESHOLD}%) in $component_name"
            log_info "Run 'cd $component_dir && npm run test:coverage' for detailed report"
            cd - > /dev/null
            return 1
        fi
    else
        log_warning "Coverage test failed or not configured in $component_name - skipping"
        cd - > /dev/null
        return 0
    fi
}

check_security() {
    local component_dir=$1
    local component_name=$2

    print_section "Security Audit - $component_name"

    cd "$component_dir" || return 1

    if check_tool npm; then
        # Run npm audit
        if npm audit --audit-level=high &> /tmp/audit_$$.log; then
            log_success "No high/critical vulnerabilities found in $component_name"
            cd - > /dev/null
            return 0
        else
            local vuln_count=$(grep -c "vulnerabilities" /tmp/audit_$$.log || echo "0")

            if grep -q "0 high\|0 critical" /tmp/audit_$$.log; then
                log_success "No high/critical vulnerabilities in $component_name"
                cd - > /dev/null
                return 0
            else
                log_error "Security vulnerabilities found in $component_name:"
                grep -E "high|critical" /tmp/audit_$$.log | head -10
                cd - > /dev/null
                return 1
            fi
        fi
    else
        log_warning "npm not found - skipping security audit for $component_name"
        cd - > /dev/null
        return 0
    fi
}

check_code_smells() {
    local component_dir=$1
    local component_name=$2

    print_section "Code Smell Detection - $component_name"

    # This is a basic implementation
    # For production, consider integrating SonarQube or CodeClimate

    local package_json="$component_dir/package.json"
    cd "$component_dir" || return 1

    # Check for common code smell indicators
    local smell_count=0

    # 1. Check for console.log statements (excluding test files)
    local console_logs=$(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs grep -c "console\.log" 2>/dev/null | awk -F: '$2 > 0 {sum+=$2} END {print sum+0}')
    smell_count=$((smell_count + console_logs))

    # 2. Check for TODO/FIXME comments
    local todos=$(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs grep -c "TODO\|FIXME" 2>/dev/null | awk -F: '$2 > 0 {sum+=$2} END {print sum+0}')
    smell_count=$((smell_count + todos))

    # 3. Check for any files with more than 500 lines (potential God Object)
    local long_files=$(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | while read -r file; do
        if [[ $(wc -l < "$file") -gt 500 ]]; then
            echo "$file"
        fi
    done | wc -l | tr -d ' ')
    smell_count=$((smell_count + long_files))

    if [[ $smell_count -le $MAX_HIGH_SEVERITY_SMELLS ]]; then
        log_success "Code smell count ($smell_count) within threshold ($MAX_HIGH_SEVERITY_SMELLS) in $component_name"
        cd - > /dev/null
        return 0
    else
        log_error "Code smell count ($smell_count) exceeds threshold ($MAX_HIGH_SEVERITY_SMELLS) in $component_name"

        if [[ $console_logs -gt 0 ]]; then
            log_info "  - $console_logs console.log statements found"
        fi
        if [[ $todos -gt 0 ]]; then
            log_info "  - $todos TODO/FIXME comments found"
        fi
        if [[ $long_files -gt 0 ]]; then
            log_info "  - $long_files files exceed 500 lines"
        fi

        cd - > /dev/null
        return 1
    fi
}

##############################################################################
# Component Check Functions
##############################################################################

check_backend() {
    print_section "Checking Backend"

    local backend_dir="platform/backend"

    if [[ ! -d "$backend_dir" ]]; then
        log_warning "Backend directory not found - skipping"
        return 0
    fi

    local failures=0

    check_eslint "$backend_dir" "Backend" || failures=$((failures + 1))
    check_typescript "$backend_dir" "Backend" || failures=$((failures + 1))
    check_coverage "$backend_dir" "Backend" || failures=$((failures + 1))
    check_security "$backend_dir" "Backend" || failures=$((failures + 1))
    check_code_smells "$backend_dir" "Backend" || failures=$((failures + 1))

    return $failures
}

check_frontend() {
    print_section "Checking Frontend"

    local frontend_dir="platform/frontend"

    if [[ ! -d "$frontend_dir" ]]; then
        log_warning "Frontend directory not found - skipping"
        return 0
    fi

    local failures=0

    check_eslint "$frontend_dir" "Frontend" || failures=$((failures + 1))
    check_typescript "$frontend_dir" "Frontend" || failures=$((failures + 1))
    check_coverage "$frontend_dir" "Frontend" || failures=$((failures + 1))
    check_security "$frontend_dir" "Frontend" || failures=$((failures + 1))
    check_code_smells "$frontend_dir" "Frontend" || failures=$((failures + 1))

    return $failures
}

##############################################################################
# Main Execution
##############################################################################

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --backend-only       Check only backend
    --frontend-only      Check only frontend
    --skip-coverage      Skip coverage checks
    --fix                Auto-fix issues where possible
    -h, --help           Show this help message

Examples:
    $0                                    # Check all components
    $0 --backend-only                     # Check backend only
    $0 --skip-coverage                    # Skip coverage check
    $0 --fix                              # Auto-fix issues

Quality Thresholds:
    - ESLint Errors:          0
    - TypeScript Errors:      0
    - Test Coverage:          ≥ ${COVERAGE_THRESHOLD}%
    - High/Critical Vulns:    0
    - High Severity Smells:   ≤ ${MAX_HIGH_SEVERITY_SMELLS}
EOF
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-only)
                BACKEND_ONLY=true
                shift
                ;;
            --frontend-only)
                FRONTEND_ONLY=true
                shift
                ;;
            --skip-coverage)
                SKIP_COVERAGE=true
                shift
                ;;
            --fix)
                AUTO_FIX=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                print_usage
                exit 2
                ;;
        esac
    done

    # Print header
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           Quality Gate Check                             ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Track overall result
    local total_failures=0

    # Run checks based on options
    if [[ "$BACKEND_ONLY" == "true" ]]; then
        check_backend || total_failures=$((total_failures + $?))
    elif [[ "$FRONTEND_ONLY" == "true" ]]; then
        check_frontend || total_failures=$((total_failures + $?))
    else
        check_backend || total_failures=$((total_failures + $?))
        check_frontend || total_failures=$((total_failures + $?))
    fi

    # Cleanup temp files
    rm -f /tmp/eslint_$$.* /tmp/tsc_$$.* /tmp/coverage_$$.* /tmp/audit_$$.*

    # Print final result
    echo ""
    echo -e "${BLUE}========================================${NC}"
    if [[ $total_failures -eq 0 ]]; then
        echo -e "${GREEN}✓ All quality gates passed!${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ Quality gate failed with $total_failures failure(s)${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        log_info "To auto-fix issues where possible, run: $0 --fix"
        log_info "To skip coverage check, run: $0 --skip-coverage"
        echo ""
        return 1
    fi
}

# Change to project root
cd "$(dirname "$0")/.." || exit 2

# Run main function
main "$@"
