#!/opt/homebrew/bin/bash
#==============================================================================
# SSH Key Audit Script
# (SSH密钥审计脚本)
#
# Purpose: Audit SSH keys for security compliance, expiration, and usage patterns
#
# Usage:
#   scripts/security/audit-ssh-keys.sh [options]
#   --tenant TID      Audit specific tenant
#   --all             Audit all tenants
#   --days N          Show audit history for last N days (default: 30)
#   --check-expired   Check for keys expiring within 90 days
#   --report          Generate detailed audit report
#   --format FORMAT   Output format (text|json|html)
#
# Examples:
#   scripts/security/audit-ssh-keys.sh --all
#   scripts/security/audit-ssh-keys.sh --tenant tenant_001 --check-expired
#   scripts/security/audit-ssh-keys.sh --all --days 7 --report --format json
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Configuration and Initialization
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${PROJECT_ROOT}/scripts/lib"
CONFIG_DIR="${PROJECT_ROOT}/config/tenants"
SSH_DIR="${HOME}/.ssh"

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
TENANT_ID=""
AUDIT_ALL=false
AUDIT_DAYS=30
CHECK_EXPIRED=false
GENERATE_REPORT=false
OUTPUT_FORMAT="text"

# Audit statistics
declare -a COMPLIANCE_ISSUES=()
declare -a EXPIRING_KEYS=()
declare -a UNUSED_KEYS=()
declare -a SECURITY_WARNINGS=()

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} [options]

Audit SSH keys for security compliance, expiration, and usage patterns.

Arguments:
  --tenant TID           Audit specific tenant
  --all                  Audit all tenants

Options:
  --days N               Show audit history for last N days [default: 30]
  --check-expired        Check for keys expiring within 90 days
  --report               Generate detailed audit report
  --format FORMAT        Output format (text|json|html) [default: text]
  -h, --help             Show this help message

Examples:
  ${0##*/} --all
  ${0##*/} --tenant tenant_001 --check-expired
  ${0##*/} --all --days 7 --report --format json

EOF
}

# Get SSH key fingerprint
# Usage: get_ssh_key_fingerprint <public_key_file>
# Returns: Fingerprint string
get_ssh_key_fingerprint() {
    local pub_key="$1"

    if [ ! -f "$pub_key" ]; then
        echo "N/A"
        return
    fi

    ssh-keygen -lf "$pub_key" 2>/dev/null | awk '{print $2}' || echo "N/A"
}

# Get SSH key age in days
# Usage: get_key_age_days <key_file>
# Returns: Age in days
get_key_age_days() {
    local key_file="$1"

    if [ ! -f "$key_file" ]; then
        echo "N/A"
        return
    fi

    local key_mtime
    key_mtime=$(stat -f "%m" "$key_file" 2>/dev/null || stat -c "%Y" "$key_file" 2>/dev/null)
    local current_time
    current_time=$(date +%s)
    local age_seconds=$((current_time - key_mtime))
    local age_days=$((age_seconds / 86400))

    echo "$age_days"
}

# Check SSH key permissions
# Usage: check_key_permissions <key_file>
# Returns: 0 if secure, 1 if insecure
check_key_permissions() {
    local key_file="$1"

    if [ ! -f "$key_file" ]; then
        return 1
    fi

    # Get file permissions
    local perms
    perms=$(stat -f "%Lp" "$key_file" 2>/dev/null || stat -c "%a" "$key_file" 2>/dev/null)

    # Check if permissions are 600 or 400
    if [ "$perms" = "600" ] || [ "$perms" = "400" ]; then
        return 0
    else
        return 1
    fi
}

# Get key usage history from database
# Usage: get_key_usage_history <tenant_id> <fingerprint> <days>
# Returns: Usage count and last used timestamp
get_key_usage_history() {
    local tenant_id="$1"
    local fingerprint="$2"
    local days="${3:-30}"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        echo "0|Never"
        return
    fi

    # Query usage history
    local sql_query
    sql_query="SELECT COUNT(*), MAX(last_used_at)
    FROM ssh_key_audit
    WHERE tenant_id = '$tenant_id'
    AND ssh_key_fingerprint = '$fingerprint'
    AND last_used_at > NOW() - INTERVAL '${days} days';"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        if [ -n "$result" ]; then
            echo "$result"
        else
            echo "0|Never"
        fi
    else
        echo "0|Never"
    fi
}

# Get key rotation history
# Usage: get_rotation_history <tenant_id> <days>
# Returns: Rotation history as JSON string
get_rotation_history() {
    local tenant_id="$1"
    local days="${2:-30}"

    # Initialize state database
    if ! state_init 2>/dev/null; then
        echo "[]"
        return
    fi

    # Query rotation history
    local sql_query
    sql_query="SELECT
        TO_CHAR(audit_timestamp, 'YYYY-MM-DD HH24:MI:SS'),
        ssh_key_name,
        ssh_key_type,
        actor,
        action
    FROM ssh_key_audit
    WHERE tenant_id = '$tenant_id'
    AND action IN ('created', 'rotated', 'revoked')
    AND audit_timestamp > NOW() - INTERVAL '${days} days'
    ORDER BY audit_timestamp DESC;"

    local result
    if state_exec_sql "$sql_query" result 2>/dev/null; then
        # Convert to JSON array
        echo "$result" | awk -F'|' '
        BEGIN {
            print "["
            first = 1
        }
        NF > 0 {
            if (!first) print ","
            printf "    {\"timestamp\": \"%s\", \"key_name\": \"%s\", \"key_type\": \"%s\", \"actor\": \"%s\", \"action\": \"%s\"}", $1, $2, $3, $4, $5
            first = 0
        }
        END {
            print "\n  ]"
        }'
    else
        echo "[]"
    fi
}

# Audit SSH key for security issues
# Usage: audit_ssh_key <tenant_id> <key_file>
# Returns: 0 if secure, 1 if issues found
audit_ssh_key() {
    local tenant_id="$1"
    local key_file="$2"
    local pub_key="${key_file}.pub"

    if [ ! -f "$key_file" ] || [ ! -f "$pub_key" ]; then
        return 1
    fi

    local has_issues=false

    # Check key permissions
    if ! check_key_permissions "$key_file"; then
        local perms
        perms=$(stat -f "%Lp" "$key_file" 2>/dev/null || stat -c "%a" "$key_file" 2>/dev/null)
        COMPLIANCE_ISSUES+=("$tenant_id:insecure_permissions:$perms")
        has_issues=true
    fi

    # Check key age
    local age_days
    age_days=$(get_key_age_days "$key_file")

    if [ "$age_days" != "N/A" ] && [ "$age_days" -ge 90 ]; then
        EXPIRING_KEYS+=("$tenant_id:${age_days}days:expired")
    elif [ "$age_days" != "N/A" ] && [ "$age_days" -ge 83 ]; then
        EXPIRING_KEYS+=("$tenant_id:${age_days}days:expiring_soon")
    fi

    # Check key usage
    local fingerprint
    fingerprint=$(get_ssh_key_fingerprint "$pub_key")

    local usage_history
    usage_history=$(get_key_usage_history "$tenant_id" "$fingerprint" "$AUDIT_DAYS")

    IFS='|' read -r usage_count last_used <<< "$usage_history"

    if [ "$usage_count" = "0" ]; then
        UNUSED_KEYS+=("$tenant_id:$fingerprint:unused")
    fi

    # Check for weak key types
    local key_type
    key_type=$(ssh-keygen -lf "$pub_key" 2>/dev/null | grep -oE "(RSA|ED25519|ECDSA|DSA)" || echo "UNKNOWN")

    if [ "$key_type" = "DSA" ]; then
        SECURITY_WARNINGS+=("$tenant_id:weak_key_type:DSA")
        has_issues=true
    fi

    return $([[ "$has_issues" == "true" ]] && echo 1 || echo 0)
}

# Generate audit report for a tenant
# Usage: generate_tenant_report <tenant_id>
# Returns: 0 on success, 1 on failure
generate_tenant_report() {
    local tenant_id="$1"

    log_info "Generating audit report for tenant: $tenant_id"

    # Get key file path
    local key_path=""
    local possible_paths=(
        "${SSH_DIR}/${tenant_id}_key"
        "${SSH_DIR}/id_${tenant_id}"
        "${SSH_DIR}/${tenant_id}"
    )

    for path in "${possible_paths[@]}"; do
        if [ -f "$path" ]; then
            key_path="$path"
            break
        fi
    done

    # Check tenant config
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"
    if [ -f "$config_file" ]; then
        local config_key_path
        config_key_path=$(get_config_value "$config_file" "server.ssh_key_path" 2>/dev/null)

        if [ -n "$config_key_path" ] && [ -f "$config_key_path" ]; then
            key_path="$config_key_path"
        fi
    fi

    if [ -z "$key_path" ]; then
        log_warning "No SSH key found for tenant: $tenant_id"
        return 1
    fi

    # Audit the key
    audit_ssh_key "$tenant_id" "$key_path" || true

    return 0
}

# Output audit summary in text format
# Usage: output_text_summary
output_text_summary() {
    echo
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}SSH Key Audit Summary${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo

    # Show compliance issues
    if [ ${#COMPLIANCE_ISSUES[@]} -gt 0 ]; then
        echo -e "${RED}⚠ Compliance Issues:${NC}"
        for issue in "${COMPLIANCE_ISSUES[@]}"; do
            IFS=':' read -r tenant_id problem details <<< "$issue"
            echo "  ✗ $tenant_id: $problem ($details)"
        done
        echo
    else
        echo -e "${GREEN}✓ No compliance issues found${NC}"
        echo
    fi

    # Show expiring keys
    if [ ${#EXPIRING_KEYS[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠ Expiring Keys:${NC}"
        for key in "${EXPIRING_KEYS[@]}"; do
            IFS=':' read -r tenant_id age status <<< "$key"
            echo "  ⏰ $tenant_id: $age ($status)"
        done
        echo
    else
        echo -e "${GREEN}✓ No expiring keys${NC}"
        echo
    fi

    # Show unused keys
    if [ ${#UNUSED_KEYS[@]} -gt 0 ]; then
        echo -e "${CYAN}ℹ Unused Keys (last $AUDIT_DAYS days):${NC}"
        for key in "${UNUSED_KEYS[@]}"; do
            IFS=':' read -r tenant_id fingerprint status <<< "$key"
            echo "  🔍 $tenant_id: $fingerprint"
        done
        echo
    else
        echo -e "${GREEN}✓ All keys have been used recently${NC}"
        echo
    fi

    # Show security warnings
    if [ ${#SECURITY_WARNINGS[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠ Security Warnings:${NC}"
        for warning in "${SECURITY_WARNINGS[@]}"; do
            IFS=':' read -r tenant_id issue details <<< "$warning"
            echo "  ⚠ $tenant_id: $issue ($details)"
        done
        echo
    else
        echo -e "${GREEN}✓ No security warnings${NC}"
        echo
    fi

    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
}

# Output audit summary in JSON format
# Usage: output_json_summary
output_json_summary() {
    echo "{"
    echo "  \"audit_date\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"audit_period_days\": $AUDIT_DAYS,"
    echo "  \"compliance_issues\": ["

    local first=true
    for issue in "${COMPLIANCE_ISSUES[@]}"; do
        IFS=':' read -r tenant_id problem details <<< "$issue"

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        cat <<EOF
    {
      "tenant_id": "$tenant_id",
      "issue": "$problem",
      "details": "$details"
    }
EOF
    done

    echo ""
    echo "  ],"
    echo "  \"expiring_keys\": ["

    first=true
    for key in "${EXPIRING_KEYS[@]}"; do
        IFS=':' read -r tenant_id age status <<< "$key"

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        cat << EOF
    {
      "tenant_id": "$tenant_id",
      "age_days": "$age",
      "status": "$status"
    }
EOF
    done

    echo ""
    echo "  ],"
    echo "  \"unused_keys\": ["

    first=true
    for key in "${UNUSED_KEYS[@]}"; do
        IFS=':' read -r tenant_id fingerprint status <<< "$key"

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        cat << EOF
    {
      "tenant_id": "$tenant_id",
      "fingerprint": "$fingerprint",
      "status": "$status"
    }
EOF
    done

    echo ""
    echo "  ],"
    echo "  \"security_warnings\": ["

    first=true
    for warning in "${SECURITY_WARNINGS[@]}"; do
        IFS=':' read -r tenant_id issue details <<< "$warning"

        if [ "$first" = "true" ]; then
            first=false
        else
            echo ","
        fi

        cat <<EOF
    {
      "tenant_id": "$tenant_id",
      "warning": "$issue",
      "details": "$details"
    }
EOF
    done

    echo ""
    echo "  ]"
    echo "}"
}

# Output detailed report for a tenant
# Usage: output_detailed_report <tenant_id>
output_detailed_report() {
    local tenant_id="$1"

    echo
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Detailed Audit Report: $tenant_id${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo

    # Get rotation history
    local rotations
    rotations=$(get_rotation_history "$tenant_id" "$AUDIT_DAYS")

    echo "Rotation History (last $AUDIT_DAYS days):"
    echo "$rotations" | jq -r '.[] | "  \(.timestamp) - \(.action) \(.key_name) (\(.key_type)) by \(.actor)"' 2>/dev/null || echo "  No rotation history found"
    echo

    # Get key information
    local key_path=""
    local possible_paths=(
        "${SSH_DIR}/${tenant_id}_key"
        "${SSH_DIR}/id_${tenant_id}"
        "${SSH_DIR}/${tenant_id}"
    )

    for path in "${possible_paths[@]}"; do
        if [ -f "$path" ]; then
            key_path="$path"
            break
        fi
    done

    if [ -n "$key_path" ]; then
        local pub_key="${key_path}.pub"
        local fingerprint
        local key_type
        local age_days

        fingerprint=$(get_ssh_key_fingerprint "$pub_key")
        key_type=$(ssh-keygen -lf "$pub_key" 2>/dev/null | grep -oE "(RSA|ED25519|ECDSA|DSA)" || echo "UNKNOWN")
        age_days=$(get_key_age_days "$key_path")

        echo "Current Key Information:"
        echo "  Type: $key_type"
        echo "  Fingerprint: $fingerprint"
        echo "  Age: $age_days days"
        echo "  Path: $key_path"

        # Check permissions
        if check_key_permissions "$key_path"; then
            echo "  Permissions: ✓ Secure (600/400)"
        else
            local perms
            perms=$(stat -f "%Lp" "$key_path" 2>/dev/null || stat -c "%a" "$key_path" 2>/dev/null)
            echo "  Permissions: ✗ Insecure ($perms)"
        fi
        echo
    fi

    # Get usage statistics
    local fingerprint
    fingerprint=$(get_ssh_key_fingerprint "${key_path}.pub")
    local usage_history
    usage_history=$(get_key_usage_history "$tenant_id" "$fingerprint" "$AUDIT_DAYS")

    IFS='|' read -r usage_count last_used <<< "$usage_history"

    echo "Usage Statistics (last $AUDIT_DAYS days):"
    echo "  Total Accesses: $usage_count"
    echo "  Last Used: $last_used"
    echo

    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tenant)
                TENANT_ID="$2"
                shift 2
                ;;
            --all)
                AUDIT_ALL=true
                shift
                ;;
            --days)
                AUDIT_DAYS="$2"
                if ! [[ "$AUDIT_DAYS" =~ ^[0-9]+$ ]]; then
                    log_error "Invalid days value: $AUDIT_DAYS"
                    exit 1
                fi
                shift 2
                ;;
            --check-expired)
                CHECK_EXPIRED=true
                shift
                ;;
            --report)
                GENERATE_REPORT=true
                shift
                ;;
            --format)
                OUTPUT_FORMAT="$2"
                if [[ ! "$OUTPUT_FORMAT" =~ ^(text|json|html)$ ]]; then
                    log_error "Invalid output format: $OUTPUT_FORMAT"
                    exit 1
                fi
                shift 2
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

    # Validate arguments
    if [ -z "$TENANT_ID" ] && [ "$AUDIT_ALL" = "false" ]; then
        log_error "Either --tenant or --all must be specified"
        print_usage
        exit 1
    fi

    if [ -n "$TENANT_ID" ] && [ "$AUDIT_ALL" = "true" ]; then
        log_error "Cannot specify both --tenant and --all"
        exit 1
    fi

    # Get list of tenants to audit
    local tenants_to_audit=()

    if [ "$AUDIT_ALL" = "true" ]; then
        for config_file in "${CONFIG_DIR}"/*.yml; do
            if [ -f "$config_file" ]; then
                local tenant_name
                tenant_name=$(basename "$config_file" .yml)
                tenants_to_audit+=("$tenant_name")
            fi
        done
    else
        tenants_to_audit=("$TENANT_ID")
    fi

    # Audit each tenant
    for tenant in "${tenants_to_audit[@]}"; do
        generate_tenant_report "$tenant"
    done

    # Generate detailed reports if requested
    if [ "$GENERATE_REPORT" = "true" ]; then
        for tenant in "${tenants_to_audit[@]}"; do
            output_detailed_report "$tenant"
        done
    fi

    # Output summary
    case "$OUTPUT_FORMAT" in
        text)
            output_text_summary
            ;;
        json)
            output_json_summary
            ;;
        html)
            log_warning "HTML output format not yet implemented, using text"
            output_text_summary
            ;;
    esac

    # Exit with error if issues found
    if [ ${#COMPLIANCE_ISSUES[@]} -gt 0 ] || [ ${#SECURITY_WARNINGS[@]} -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Run main function
main "$@"
