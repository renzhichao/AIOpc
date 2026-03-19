#!/bin/bash

#==============================================================================
# AIOpc Cloud Environment Check Script
#==============================================================================
# This script verifies that all required dependencies are properly installed
# and configured for the AIOpc platform.
#
# Usage:
#   ./check-environment.sh [--verbose] [--json]
#
# Exit codes:
#   0 - All checks passed
#   1 - Some checks failed
#   2 - Critical failures
#==============================================================================

set -e

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
VERBOSE=false
OUTPUT_FORMAT="text"

# Check results
declare -a CHECK_RESULTS
declare -a FAILED_CHECKS
declare -a WARNING_CHECKS

#------------------------------------------------------------------------------
# Utility Functions
#------------------------------------------------------------------------------

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
    CHECK_RESULTS+=("PASS: $*")
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
    CHECK_RESULTS+=("WARN: $*")
    WARNING_CHECKS+=("$*")
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    CHECK_RESULTS+=("FAIL: $*")
    FAILED_CHECKS+=("$*")
}

separator() {
    echo "------------------------------------------------------------------------------"
}

# Version comparison
version_ge() {
    if [ "$#" -ne 2 ]; then
        return 1
    fi

    local current="$1"
    local required="$2"

    if [ "$current" = "$required" ]; then
        return 0
    fi

    local IFS=.
    local i current_ver=($current) required_ver=($required)

    # Fill empty fields with zeros
    for ((i=${#current_ver[@]}; i<${#required_ver[@]}; i++)); do
        current_ver[i]=0
    done

    for ((i=0; i<${#current_ver[@]}; i++)); do
        if [[ -z ${required_ver[i]} ]]; then
            required_ver[i]=0
        fi

        if ((10#${current_ver[i]} > 10#${required_ver[i]})); then
            return 0
        fi

        if ((10#${current_ver[i]} < 10#${required_ver[i]})); then
            return 1
        fi
    done

    return 0
}

#------------------------------------------------------------------------------
# Check Functions
#------------------------------------------------------------------------------

check_os() {
    separator
    info "Checking Operating System..."

    if [ ! -f /etc/os-release ]; then
        error "Cannot detect OS: /etc/os-release not found"
        return 1
    fi

    . /etc/os-release

    local os_name="$PRETTY_NAME"
    info "OS: $os_name"

    if [[ ! "$ID" =~ ^(ubuntu|debian)$ ]]; then
        warning "OS $ID may not be fully supported"
    else
        success "OS is supported: $ID $VERSION_ID"
    fi
}

check_docker() {
    separator
    info "Checking Docker..."

    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        return 1
    fi

    local version=$(docker --version | awk '{print $3}' | sed 's/,//')
    info "Docker version: $version"

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        return 1
    fi

    success "Docker is installed and running: $version"

    if [ "$VERBOSE" = true ]; then
        info "Docker info:"
        docker info | head -n 20
    fi
}

check_docker_compose() {
    separator
    info "Checking Docker Compose..."

    # Check for docker-compose (standalone) or docker compose (plugin)
    if docker compose version &> /dev/null; then
        local version=$(docker compose version --short 2>/dev/null || echo "unknown")
        success "Docker Compose plugin is installed: $version"
    elif command -v docker-compose &> /dev/null; then
        local version=$(docker-compose --version | awk '{print $3}' | sed 's/,//')
        success "Docker Compose standalone is installed: $version"
    else
        error "Docker Compose is not installed"
        return 1
    fi
}

check_nodejs() {
    separator
    info "Checking Node.js..."

    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        return 1
    fi

    local version=$(node --version)
    info "Node.js version: $version"

    # Check if version is 22.x
    if [[ "$version" =~ ^v22\. ]]; then
        success "Node.js 22 is installed: $version"
    elif [[ "$version" =~ ^v(20|21|23|24)\. ]]; then
        warning "Node.js version is $version (recommended: v22.x)"
    else
        error "Node.js version $version is not supported (required: v22.x)"
        return 1
    fi

    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        info "npm version: $npm_version"
    fi
}

check_pnpm() {
    separator
    info "Checking pnpm..."

    if ! command -v pnpm &> /dev/null; then
        error "pnpm is not installed"
        return 1
    fi

    local version=$(pnpm --version)
    info "pnpm version: $version"
    success "pnpm is installed: $version"
}

check_postgresql() {
    separator
    info "Checking PostgreSQL..."

    if ! command -v psql &> /dev/null; then
        error "PostgreSQL client is not installed"
        return 1
    fi

    local version=$(psql --version | awk '{print $3}' | sed 's/\.[0-9]*$//')
    info "PostgreSQL version: $version"

    # Check if version is 16
    if [ "$version" = "16" ]; then
        success "PostgreSQL 16 is installed"
    else
        warning "PostgreSQL version is $version (recommended: 16)"
    fi

    # Check if PostgreSQL service is running
    if systemctl is-active --quiet postgresql; then
        success "PostgreSQL service is running"
    else
        error "PostgreSQL service is not running"
        return 1
    fi

    # Check if we can connect
    if sudo -u postgres psql -c "SELECT 1" &> /dev/null; then
        success "PostgreSQL connection test successful"
    else
        error "Cannot connect to PostgreSQL"
        return 1
    fi
}

check_redis() {
    separator
    info "Checking Redis..."

    if ! command -v redis-server &> /dev/null; then
        error "Redis is not installed"
        return 1
    fi

    local version=$(redis-server --version | awk '{print $3}')
    info "Redis version: $version"
    success "Redis is installed: $version"

    # Check if Redis service is running
    if systemctl is-active --quiet redis-server; then
        success "Redis service is running"
    else
        error "Redis service is not running"
        return 1
    fi

    # Check if we can connect
    if redis-cli ping &> /dev/null; then
        success "Redis connection test successful"
    else
        warning "Cannot connect to Redis (may require password)"
    fi
}

check_nginx() {
    separator
    info "Checking Nginx..."

    if ! command -v nginx &> /dev/null; then
        error "Nginx is not installed"
        return 1
    fi

    local version=$(nginx -v 2>&1 | awk -F'/' '{print $2}')
    info "Nginx version: $version"
    success "Nginx is installed: $version"

    # Check if Nginx service is running
    if systemctl is-active --quiet nginx; then
        success "Nginx service is running"
    else
        warning "Nginx service is not running"
    fi

    # Check configuration
    if nginx -t &> /dev/null; then
        success "Nginx configuration is valid"
    else
        error "Nginx configuration test failed"
        return 1
    fi
}

check_firewall() {
    separator
    info "Checking Firewall..."

    if command -v ufw &> /dev/null; then
        info "UFW firewall is installed"

        if ufw status | grep -q "Status: active"; then
            success "UFW firewall is active"

            if [ "$VERBOSE" = true ]; then
                info "UFW rules:"
                ufw status numbered
            fi
        else
            warning "UFW firewall is not active"
        fi
    else
        warning "No firewall detected (UFW not installed)"
    fi
}

check_directories() {
    separator
    info "Checking Directory Structure..."

    local required_dirs=(
        "/opt/opclaw"
        "/opt/opclaw/backend"
        "/opt/opclaw/frontend"
        "/opt/opclaw/logs"
        "/opt/opclaw/backups"
        "/opt/opclaw/scripts"
        "/etc/opclaw"
    )

    local all_exist=true
    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            if [ "$VERBOSE" = true ]; then
                info "Directory exists: $dir"
            fi
        else
            error "Required directory missing: $dir"
            all_exist=false
        fi
    done

    if [ "$all_exist" = true ]; then
        success "All required directories exist"
    fi
}

check_credentials() {
    separator
    info "Checking Credentials File..."

    local cred_file="/etc/opclaw/.env"

    if [ ! -f "$cred_file" ]; then
        error "Credentials file not found: $cred_file"
        error "Run init-server.sh to generate credentials"
        return 1
    fi

    # Check file permissions
    local perms=$(stat -c %a "$cred_file" 2>/dev/null || stat -f %A "$cred_file")
    if [ "$perms" = "600" ]; then
        success "Credentials file has correct permissions (600)"
    else
        warning "Credentials file permissions are $perms (recommended: 600)"
    fi

    # Check required variables
    local required_vars=(
        "POSTGRES_HOST"
        "POSTGRES_PORT"
        "POSTGRES_DB"
        "POSTGRES_USER"
        "POSTGRES_PASSWORD"
        "REDIS_HOST"
        "REDIS_PORT"
        "REDIS_PASSWORD"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" "$cred_file"; then
            if [ "$VERBOSE" = true ]; then
                info "Variable set: $var"
            fi
        else
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -eq 0 ]; then
        success "All required credentials are set"
    else
        error "Missing credentials: ${missing_vars[*]}"
        return 1
    fi
}

check_ports() {
    separator
    info "Checking Port Availability..."

    local ports=(
        "22:SSH"
        "80:HTTP"
        "443:HTTPS"
        "3000:Backend API"
        "5432:PostgreSQL"
        "6379:Redis"
    )

    for port_info in "${ports[@]}"; do
        local port=$(echo "$port_info" | cut -d: -f1)
        local service=$(echo "$port_info" | cut -d: -f2)

        if ss -tuln | grep -q ":$port "; then
            local process=$(ss -tulnp | grep ":$port " | awk '{print $6}' | head -n1)
            info "Port $port ($service) is in use by: $process"
        else
            info "Port $port ($service) is available"
        fi
    done
}

check_system_resources() {
    separator
    info "Checking System Resources..."

    # Check memory
    local total_mem=$(free -h | awk '/^Mem:/ {print $2}')
    local available_mem=$(free -h | awk '/^Mem:/ {print $7}')
    info "Memory: $available_mem available / $total_mem total"

    # Check disk space
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    info "Disk usage: $disk_usage%"

    if [ "$disk_usage" -gt 80 ]; then
        warning "Disk usage is high: $disk_usage%"
    else
        success "Disk usage is acceptable: $disk_usage%"
    fi

    # Check CPU cores
    local cpu_cores=$(nproc)
    info "CPU cores: $cpu_cores"

    if [ "$cpu_cores" -lt 2 ]; then
        warning "System has fewer than 2 CPU cores"
    else
        success "System has sufficient CPU cores: $cpu_cores"
    fi
}

#------------------------------------------------------------------------------
# Output Functions
#------------------------------------------------------------------------------

print_summary_text() {
    separator
    echo ""
    echo "=============================================================================="
    echo "Environment Check Summary"
    echo "=============================================================================="
    echo ""

    local total_checks=${#CHECK_RESULTS[@]}
    local failed=${#FAILED_CHECKS[@]}
    local warnings=${#WARNING_CHECKS[@]}
    local passed=$((total_checks - failed - warnings))

    echo "Total Checks: $total_checks"
    echo -e "  ${GREEN}Passed:${NC}   $passed"
    echo -e "  ${YELLOW}Warnings:${NC} $warnings"
    echo -e "  ${RED}Failed:${NC}   $failed"
    echo ""

    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✓ All critical checks passed!${NC}"
        echo ""
        echo "Next Steps:"
        echo "  1. Run: ./scripts/cloud/init-database.sh"
        echo "  2. Deploy the application"
        echo "  3. Configure SSL with certbot"
    else
        echo -e "${RED}✗ Some checks failed. Please fix the issues above.${NC}"
        echo ""
        echo "Failed Checks:"
        for check in "${FAILED_CHECKS[@]}"; do
            echo "  - $check"
        done
    fi

    if [ $warnings -gt 0 ]; then
        echo ""
        echo "Warnings:"
        for check in "${WARNING_CHECKS[@]}"; do
            echo "  - $check"
        done
    fi

    echo ""
    echo "=============================================================================="
}

print_summary_json() {
    local total_checks=${#CHECK_RESULTS[@]}
    local failed=${#FAILED_CHECKS[@]}
    local warnings=${#WARNING_CHECKS[@]}
    local passed=$((total_checks - failed - warnings))

    cat << EOF
{
  "timestamp": "$TIMESTAMP",
  "summary": {
    "total": $total_checks,
    "passed": $passed,
    "warnings": $warnings,
    "failed": $failed,
    "status": "$([ $failed -eq 0 ] && echo "success" || echo "failure")"
  },
  "checks": [
$(IFS=$'\n'; echo "${CHECK_RESULTS[*]}" | sed 's/\(PASS\|WARN\|FAIL\): /  {"type": "\1", "message": "/' | sed 's/$/"}/' | paste -sd ',' -)
  ],
  "failed_checks": [
$(IFS=$'\n'; echo "${FAILED_CHECKS[@]}" | sed 's/^/    "/' | sed 's/$/",/' | paste -sd '\n' - | sed '$ s/,$//')
  ],
  "warning_checks": [
$(IFS=$'\n'; echo "${WARNING_CHECKS[@]}" | sed 's/^/    "/' | sed 's/$/",/' | paste -sd '\n' - | sed '$ s/,$//')
  ]
}
EOF
}

#------------------------------------------------------------------------------
# Main Function
#------------------------------------------------------------------------------

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                OUTPUT_FORMAT="json"
                shift
                ;;
            --help)
                echo "Usage: $0 [--verbose] [--json]"
                echo ""
                echo "Options:"
                echo "  --verbose  Show detailed check information"
                echo "  --json     Output results in JSON format"
                echo "  --help     Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    echo "=============================================================================="
    echo "AIOpc Cloud Environment Check"
    echo "=============================================================================="
    echo "Timestamp: $TIMESTAMP"
    echo "=============================================================================="
    echo ""

    # Run all checks
    check_os
    check_docker
    check_docker_compose
    check_nodejs
    check_pnpm
    check_postgresql
    check_redis
    check_nginx
    check_firewall
    check_directories
    check_credentials
    check_ports
    check_system_resources

    # Print summary
    if [ "$OUTPUT_FORMAT" = "json" ]; then
        print_summary_json
    else
        print_summary_text
    fi

    # Exit with appropriate code
    if [ ${#FAILED_CHECKS[@]} -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

#------------------------------------------------------------------------------
# Script Entry Point
#------------------------------------------------------------------------------

main "$@"
