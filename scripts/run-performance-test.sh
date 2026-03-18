#!/bin/bash

################################################################################
# Performance Test Execution Script
#
# Purpose: Run k6 performance tests for AIOpc platform
# Usage: ./scripts/run-performance-test.sh [scenario] [options]
#
# Scenarios:
#   baseline  - Baseline performance test (10 VUs, 1 min)
#   normal    - Normal load test (100 VUs, 5 min)
#   peak      - Peak load test (500 VUs, 5 min)
#   stress    - Stress test to find breaking point (2000+ VUs)
#   api-load  - Comprehensive API load test
#   ws-load   - WebSocket load test
#   all       - Run all scenarios sequentially
#
# Options:
#   --env ENVIRONMENT    Set environment (dev, staging, prod)
#   --url BASE_URL       Set base URL for testing
#   --out FORMAT         Output format (json, html)
#   --no-cleanup         Don't clean up results after test
#   --install            Install k6 if not present
################################################################################

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PERF_DIR="${PROJECT_ROOT}/platform/perf"
RESULTS_DIR="${PERF_DIR}/results"
REPORTS_DIR="${PERF_DIR}/reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-json}"
CLEANUP=true
INSTALL_K6=false
SCENARIO=""
VERBOSE=false

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${BLUE}"
    echo "=============================================="
    echo "   AIOpc Performance Testing Framework"
    echo "=============================================="
    echo -e "${NC}"
}

print_usage() {
    cat << EOF
Usage: $0 [scenario] [options]

Scenarios:
  baseline    Baseline performance test (10 VUs, 1 min)
  normal      Normal load test (100 VUs, 5 min)
  peak        Peak load test (500 VUs, 5 min)
  stress      Stress test to find breaking point (2000+ VUs)
  api-load    Comprehensive API load test
  ws-load     WebSocket load test
  all         Run all scenarios sequentially

Options:
  --env ENVIRONMENT     Set environment (default: dev)
  --url BASE_URL        Set base URL for testing (default: http://localhost:3000)
  --out FORMAT          Output format: json, html, both (default: json)
  --no-cleanup          Don't clean up results after test
  --install             Install k6 if not present
  --verbose             Enable verbose output
  -h, --help            Show this help message

Examples:
  # Run baseline test against localhost
  $0 baseline

  # Run peak test against staging environment
  $0 peak --env staging --url https://staging.aiopclaw.com

  # Run all tests with HTML output
  $0 all --out html

  # Install k6 and run stress test
  $0 stress --install

Environment Variables:
  BASE_URL              Base URL for testing
  ENVIRONMENT           Environment name (dev, staging, prod)
  K6_OPTIONS            Additional k6 options

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            baseline|normal|peak|stress|api-load|ws-load|all)
                SCENARIO="$1"
                shift
                ;;
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --url)
                BASE_URL="$2"
                shift 2
                ;;
            --out)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --no-cleanup)
                CLEANUP=false
                shift
                ;;
            --install)
                INSTALL_K6=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# Check if k6 is installed
check_k6() {
    if ! command -v k6 &> /dev/null; then
        log_warning "k6 is not installed"
        if [ "$INSTALL_K6" = true ]; then
            install_k6
        else
            log_error "Please install k6 first or run with --install flag"
            log_info "Installation: https://k6.io/docs/getting-started/installation/"
            exit 1
        fi
    else
        local k6_version=$(k6 version 2>&1 | head -n1)
        log_success "k6 is installed: $k6_version"
    fi
}

# Install k6
install_k6() {
    log_info "Installing k6..."

    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            sudo gpg -k
            sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
            echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
            sudo apt-get update
            sudo apt-get install -y k6
        elif [ -f /etc/redhat-release ]; then
            # RHEL/CentOS/Fedora
            sudo dnf install -y https://dl.k6.io/rpm/repo.rpm
            sudo dnf install -y k6
        else
            log_error "Unsupported Linux distribution"
            log_info "Please install k6 manually: https://k6.io/docs/getting-started/installation/"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install k6
        else
            log_error "Homebrew not found. Please install Homebrew first"
            exit 1
        fi
    else
        log_error "Unsupported operating system: $OSTYPE"
        log_info "Please install k6 manually: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi

    log_success "k6 installed successfully"
}

# Create necessary directories
setup_directories() {
    log_info "Setting up directories..."
    mkdir -p "$RESULTS_DIR"
    mkdir -p "$REPORTS_DIR"
}

# Validate scenario
validate_scenario() {
    if [ -z "$SCENARIO" ]; then
        log_error "No scenario specified"
        print_usage
        exit 1
    fi

    local scenario_files=(
        "baseline:${PERF_DIR}/scenarios/baseline.js"
        "normal:${PERF_DIR}/scenarios/normal.js"
        "peak:${PERF_DIR}/scenarios/peak.js"
        "stress:${PERF_DIR}/scenarios/stress.js"
        "api-load:${PERF_DIR}/tests/api-load.js"
        "ws-load:${PERF_DIR}/tests/websocket-load.js"
    )

    if [ "$SCENARIO" = "all" ]; then
        for sf in "${scenario_files[@]}"; do
            local file="${sf##*:}"
            if [ ! -f "$file" ]; then
                log_error "Scenario file not found: $file"
                exit 1
            fi
        done
    else
        local scenario_file=""
        for sf in "${scenario_files[@]}"; do
            local name="${sf%%:*}"
            if [ "$name" = "$SCENARIO" ]; then
                scenario_file="${sf##*:}"
                break
            fi
        done

        if [ -z "$scenario_file" ]; then
            log_error "Invalid scenario: $SCENARIO"
            exit 1
        fi

        if [ ! -f "$scenario_file" ]; then
            log_error "Scenario file not found: $scenario_file"
            exit 1
        fi
    fi

    log_success "Scenario validation passed: $SCENARIO"
}

# Run a single test scenario
run_scenario() {
    local scenario=$1
    local test_file=$2
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local result_file="${RESULTS_DIR}/${scenario}_${timestamp}.json"
    local html_file="${REPORTS_DIR}/${scenario}_${timestamp}.html"

    log_info "Running scenario: $scenario"
    log_info "Test file: $test_file"
    log_info "Base URL: $BASE_URL"
    log_info "Environment: $ENVIRONMENT"

    # Build k6 command
    local k6_cmd="k6 run"
    k6_cmd="$k6_cmd --env BASE_URL=$BASE_URL"
    k6_cmd="$k6_cmd --env ENVIRONMENT=$ENVIRONMENT"
    k6_cmd="$k6_cmd --env RESULT_FILE=$result_file"

    if [ "$VERBOSE" = true ]; then
        k6_cmd="$k6_cmd --verbose"
    fi

    # Output options
    if [ "$OUTPUT_FORMAT" = "json" ] || [ "$OUTPUT_FORMAT" = "both" ]; then
        k6_cmd="$k6_cmd --out json=$result_file"
    fi

    if [ "$OUTPUT_FORMAT" = "html" ] || [ "$OUTPUT_FORMAT" = "both" ]; then
        k6_cmd="$k6_cmd --out json=$result_file"
        k6_cmd="$k6_cmd --summary-export=$html_file"
    fi

    k6_cmd="$k6_cmd $test_file"

    # Run the test
    log_info "Executing: $k6_cmd"
    eval $k6_cmd
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "Scenario completed: $scenario"
        log_info "Results saved to: $result_file"

        # Generate summary
        if [ -f "$result_file" ]; then
            generate_summary "$scenario" "$result_file"
        fi
    else
        log_error "Scenario failed: $scenario (exit code: $exit_code)"
        return $exit_code
    fi
}

# Generate test summary
generate_summary() {
    local scenario=$1
    local result_file=$2

    log_info "Generating summary for $scenario..."

    # Extract key metrics using jq if available
    if command -v jq &> /dev/null; then
        local summary_file="${RESULTS_DIR}/${scenario}_summary.txt"
        echo "=== Performance Test Summary: $scenario ===" > "$summary_file"
        echo "Timestamp: $(date)" >> "$summary_file"
        echo "Base URL: $BASE_URL" >> "$summary_file"
        echo "" >> "$summary_file"

        # Extract metrics (adjust based on actual JSON structure)
        jq -r '.metrics // {}' "$result_file" >> "$summary_file" 2>/dev/null || true

        log_success "Summary generated: $summary_file"
    fi
}

# Main execution
main() {
    print_banner
    parse_args "$@"
    setup_directories
    check_k6
    validate_scenario

    log_info "Starting performance test execution..."
    log_info "Configuration:"
    log_info "  Scenario: $SCENARIO"
    log_info "  Environment: $ENVIRONMENT"
    log_info "  Base URL: $BASE_URL"
    log_info "  Output Format: $OUTPUT_FORMAT"
    echo ""

    local exit_code=0

    if [ "$SCENARIO" = "all" ]; then
        log_info "Running all scenarios sequentially..."

        # Define scenario order
        local scenarios=(
            "baseline:${PERF_DIR}/scenarios/baseline.js"
            "normal:${PERF_DIR}/scenarios/normal.js"
            "peak:${PERF_DIR}/scenarios/peak.js"
            "api-load:${PERF_DIR}/tests/api-load.js"
            "ws-load:${PERF_DIR}/tests/websocket-load.js"
        )

        for sc in "${scenarios[@]}"; do
            local name="${sc%%:*}"
            local file="${sc##*:}"

            echo ""
            log_info "========================================"
            log_info "Running scenario: $name"
            log_info "========================================"
            echo ""

            run_scenario "$name" "$file" || exit_code=$?

            # Add delay between scenarios
            if [ "$name" != "ws-load" ]; then
                log_info "Waiting 10 seconds before next scenario..."
                sleep 10
            fi
        done

        # Stress test is optional - run last
        echo ""
        log_warning "Stress test can take a long time and may impact system stability"
        read -p "Do you want to run the stress test? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            run_scenario "stress" "${PERF_DIR}/scenarios/stress.js" || exit_code=$?
        fi

    else
        # Run single scenario
        local scenario_file=""
        case $SCENARIO in
            baseline)
                scenario_file="${PERF_DIR}/scenarios/baseline.js"
                ;;
            normal)
                scenario_file="${PERF_DIR}/scenarios/normal.js"
                ;;
            peak)
                scenario_file="${PERF_DIR}/scenarios/peak.js"
                ;;
            stress)
                scenario_file="${PERF_DIR}/scenarios/stress.js"
                ;;
            api-load)
                scenario_file="${PERF_DIR}/tests/api-load.js"
                ;;
            ws-load)
                scenario_file="${PERF_DIR}/tests/websocket-load.js"
                ;;
        esac

        run_scenario "$SCENARIO" "$scenario_file" || exit_code=$?
    fi

    echo ""
    if [ $exit_code -eq 0 ]; then
        log_success "Performance testing completed successfully!"
        log_info "Results directory: $RESULTS_DIR"
        log_info "Reports directory: $REPORTS_DIR"
    else
        log_error "Performance testing completed with errors"
        exit $exit_code
    fi
}

# Run main function
main "$@"
