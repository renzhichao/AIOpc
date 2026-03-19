#!/opt/homebrew/bin/bash
#==============================================================================
# Tenant Health Alert Script
# (租户健康告警脚本)
#
# Purpose: Send alerts for tenant health issues
#
# Usage:
#   scripts/tenant/alert-health-issue.sh <tenant_id> --issue <issue_type> [options]
#
# Options:
#   --issue TYPE       Issue type (critical|warning|database|oauth|redis|http|ssh)
#   --severity LEVEL   Alert severity (critical|warning|info) [default: warning]
#   --email EMAIL      Send email alert to EMAIL
#   --webhook URL      Send webhook notification to URL
#   --message MSG      Custom alert message
#   --dry-run          Show what would be sent without actually sending
#   --record           Record alert to security audit log
#
# Exit codes:
#   0: Alert sent successfully
#   1: Alert failed to send
#   2: Invalid parameters
#   3: Tenant not found
#
# Example:
#   scripts/tenant/alert-health-issue.sh tenant_001 --issue critical --severity critical
#   scripts/tenant/alert-health-issue.sh tenant_001 --issue database --email admin@example.com
#   scripts/tenant/alert-health-issue.sh tenant_001 --issue oauth --webhook https://hooks.slack.com/...
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

# Source required libraries
source "${LIB_DIR}/logging.sh" 2>/dev/null || { echo "ERROR: logging.sh not found"; exit 1; }
source "${LIB_DIR}/config.sh" 2>/dev/null || { echo "ERROR: config.sh not found"; exit 1; }
source "${LIB_DIR}/state.sh" 2>/dev/null || { echo "ERROR: state.sh not found"; exit 1; }

# Default values
TENANT_ID=""
ISSUE_TYPE=""
SEVERITY="warning"
EMAIL_RECIPIENT=""
WEBHOOK_URL=""
CUSTOM_MESSAGE=""
DRY_RUN=false
RECORD_AUDIT=true

# Alert colors for terminal output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    NC=''
fi

#==============================================================================
# Helper Functions
#==============================================================================

print_usage() {
    cat << EOF
Usage: ${0##*/} <tenant_id> --issue <issue_type> [options]

Send alerts for tenant health issues.

Arguments:
  tenant_id            Tenant ID (required)

Required:
  --issue TYPE         Issue type
                       Types: critical|warning|database|oauth|redis|http|ssh

Options:
  --severity LEVEL     Alert severity (critical|warning|info) [default: warning]
  --email EMAIL        Send email alert to EMAIL
  --webhook URL        Send webhook notification to URL
  --message MSG        Custom alert message
  --dry-run            Show what would be sent without actually sending
  --record             Record alert to security audit log [default: true]
  -h, --help           Show this help message

Issue Types:
  critical    - Critical system failure
  warning     - Warning condition detected
  database    - Database connectivity/query issues
  oauth       - OAuth authentication problems
  redis       - Redis cache service issues
  http        - HTTP endpoint not responding
  ssh         - SSH access problems

Severity Levels:
  critical    - Immediate attention required
  warning     - Investigation needed soon
  info        - Informational alert

Examples:
  ${0##*/} tenant_001 --issue critical --severity critical
  ${0##*/} tenant_001 --issue database --email admin@example.com
  ${0##*/} tenant_001 --issue oauth --webhook https://hooks.slack.com/...
  ${0##*/} tenant_001 --issue http --message "API endpoint timeout"

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

#==============================================================================
# Tenant Discovery Functions
#==============================================================================

get_tenant_config_file() {
    local tenant_id=$1
    local config_file="${CONFIG_DIR}/${tenant_id}.yml"

    if [ ! -f "$config_file" ]; then
        log_error "Tenant configuration not found: $config_file"
        return 1
    fi

    echo "$config_file"
    return 0
}

load_tenant_info() {
    local config_file=$1

    local tenant_id
    local tenant_name
    local environment
    local server_host

    tenant_id=$(get_config_value "$config_file" "tenant.id" 2>/dev/null || echo "unknown")
    tenant_name=$(get_config_value "$config_file" "tenant.name" 2>/dev/null || echo "unknown")
    environment=$(get_config_value "$config_file" "tenant.environment" 2>/dev/null || echo "unknown")
    server_host=$(get_config_value "$config_file" "server.host" 2>/dev/null || echo "unknown")

    echo "$tenant_id|$tenant_name|$environment|$server_host"
}

#==============================================================================
# Alert Generation Functions
#==============================================================================

generate_alert_subject() {
    local tenant_id=$1
    local tenant_name=$2
    local issue_type=$3
    local severity=$4

    local severity_upper
    severity_upper=$(echo "$severity" | tr '[:lower:]' '[:upper:]')

    echo "[$severity_upper] Health Issue Detected - $tenant_name ($tenant_id)"
}

generate_alert_body() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local server_host=$4
    local issue_type=$5
    local severity=$6
    local custom_message=$7
    local timestamp=$8

    cat <<EOF
Health Issue Alert

Tenant Information:
  ID:          $tenant_id
  Name:        $tenant_name
  Environment: $environment
  Server:      $server_host

Issue Details:
  Type:        $issue_type
  Severity:    $severity
  Timestamp:   $timestamp

Description:
$custom_message

Recommended Actions:
EOF

    # Add recommended actions based on issue type
    case $issue_type in
        critical)
            cat <<EOF
  1. Immediately check server status and logs
  2. Verify all critical services are running
  3. Check system resources (CPU, memory, disk)
  4. Review recent deployment changes
  5. Contact on-call engineer if issue persists
EOF
            ;;
        database)
            cat <<EOF
  1. Check PostgreSQL service status
  2. Verify database connectivity
  3. Review database logs for errors
  4. Check connection pool status
  5. Verify query performance
EOF
            ;;
        oauth)
            cat <<EOF
  1. Verify Feishu OAuth credentials
  2. Check OAuth configuration
  3. Review OAuth callback URLs
  4. Test OAuth flow manually
  5. Check Feishu API status
EOF
            ;;
        redis)
            cat <<EOF
  1. Check Redis service status
  2. Verify Redis connectivity
  3. Review Redis memory usage
  4. Check connection pool status
  5. Verify cache keys and TTL settings
EOF
            ;;
        http)
            cat <<EOF
  1. Check backend service status
  2. Verify HTTP endpoint is responding
  3. Review application logs
  4. Check load balancer configuration
  5. Test API endpoints manually
EOF
            ;;
        ssh)
            cat <<EOF
  1. Verify SSH service is running
  2. Check SSH key authentication
  3. Review SSH logs
  4. Test SSH connection manually
  5. Verify firewall rules
EOF
            ;;
        *)
            cat <<EOF
  1. Investigate the reported issue
  2. Check relevant service logs
  3. Verify system resources
  4. Review recent changes
  5. Document findings and resolution
EOF
            ;;
    esac

    cat <<EOF

For more information, run:
  scripts/tenant/health-status.sh $tenant_id --history 20
  scripts/tenant/show.sh $tenant_id

---
This alert was generated by the AIOpc Tenant Health Monitoring System
EOF
}

generate_webhook_payload() {
    local tenant_id=$1
    local tenant_name=$2
    local environment=$3
    local issue_type=$4
    local severity=$5
    local custom_message=$6
    local timestamp=$7

    # Determine emoji based on severity
    local emoji
    case $severity in
        critical) emoji=":rotating_light:" ;;
        warning) emoji=":warning:" ;;
        info) emoji=":information_source:" ;;
        *) emoji=":grey_question:" ;;
    esac

    # Determine color based on severity
    local color
    case $severity in
        critical) color="#FF0000" ;;
        warning) color="#FFCC00" ;;
        info) color="#36A64F" ;;
        *) color="#808080" ;;
    esac

    # Generate Slack-style webhook payload
    cat <<EOF
{
  "username": "Tenant Health Monitor",
  "icon_emoji": "$emoji",
  "attachments": [
    {
      "color": "$color",
      "title": "$emoji Health Issue Alert - $tenant_name ($tenant_id)",
      "fields": [
        {
          "title": "Severity",
          "value": "$severity",
          "short": true
        },
        {
          "title": "Environment",
          "value": "$environment",
          "short": true
        },
        {
          "title": "Issue Type",
          "value": "$issue_type",
          "short": true
        },
        {
          "title": "Timestamp",
          "value": "$timestamp",
          "short": true
        }
      ],
      "text": "$custom_message",
      "footer": "AIOpc Tenant Health Monitoring",
      "ts": $(date +%s)
    }
  ]
}
EOF
}

#==============================================================================
# Alert Sending Functions
#==============================================================================

send_email_alert() {
    local recipient=$1
    local subject=$2
    local body=$3

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would send email to: $recipient"
        echo
        echo "Subject: $subject"
        echo
        echo "$body"
        return 0
    fi

    # Check if mail command is available
    if ! command -v mail &> /dev/null; then
        log_error "mail command not found. Cannot send email alert."
        log_info "Install with: brew install postal (macOS) or apt-get install mailutils (Linux)"
        return 1
    fi

    # Send email
    echo "$body" | mail -s "$subject" "$recipient"

    if [ $? -eq 0 ]; then
        log_success "Email alert sent to: $recipient"
        return 0
    else
        log_error "Failed to send email alert to: $recipient"
        return 1
    fi
}

send_webhook_alert() {
    local webhook_url=$1
    local payload=$2

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would send webhook to: $webhook_url"
        echo
        echo "$payload"
        return 0
    fi

    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl command not found. Cannot send webhook alert."
        return 1
    fi

    # Send webhook
    local response
    response=$(curl -s -X POST "$webhook_url" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\n%{http_code}" \
        --max-time 10 \
        2>&1)

    local http_code
    http_code=$(echo "$response" | tail -1)

    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log_success "Webhook alert sent to: $webhook_url"
        return 0
    else
        log_error "Failed to send webhook alert (HTTP $http_code)"
        return 1
    fi
}

record_alert_to_audit() {
    local tenant_id=$1
    local issue_type=$2
    local severity=$3
    local message=$4

    if [ "$RECORD_AUDIT" = false ]; then
        return 0
    fi

    # Initialize state database
    if ! state_init 2>/dev/null; then
        log_warning "Failed to initialize state database, skipping audit recording"
        return 1
    fi

    # Record security audit event
    record_security_audit \
        "$tenant_id" \
        "security_event" \
        "health_monitor" \
        "alert_sent" \
        "health_check" \
        "$issue_type" \
        "" \
        "" \
        "" \
        "{\"severity\": \"$severity\", \"message\": \"$message\"}" \
        "{}" 2>/dev/null

    if [ $? -eq 0 ]; then
        log_debug "Alert recorded to security audit log"
        return 0
    else
        log_warning "Failed to record alert to security audit log"
        return 1
    fi
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --issue)
                ISSUE_TYPE="$2"
                shift 2
                ;;
            --severity)
                SEVERITY="$2"
                shift 2
                ;;
            --email)
                EMAIL_RECIPIENT="$2"
                shift 2
                ;;
            --webhook)
                WEBHOOK_URL="$2"
                shift 2
                ;;
            --message)
                CUSTOM_MESSAGE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --record)
                RECORD_AUDIT=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                print_usage
                exit 2
                ;;
            *)
                TENANT_ID="$1"
                shift
                ;;
        esac
    done

    # Validate required parameters
    if [ -z "$TENANT_ID" ]; then
        log_error "Tenant ID is required"
        print_usage
        exit 2
    fi

    if [ -z "$ISSUE_TYPE" ]; then
        log_error "Issue type is required (--issue)"
        print_usage
        exit 2
    fi

    # Validate issue type
    case $ISSUE_TYPE in
        critical|warning|database|oauth|redis|http|ssh)
            ;;
        *)
            log_error "Invalid issue type: $ISSUE_TYPE"
            log_error "Must be one of: critical, warning, database, oauth, redis, http, ssh"
            exit 2
            ;;
    esac

    # Validate severity
    case $SEVERITY in
        critical|warning|info)
            ;;
        *)
            log_error "Invalid severity: $SEVERITY"
            log_error "Must be one of: critical, warning, info"
            exit 2
            ;;
    esac

    # Validate at least one notification method
    if [ -z "$EMAIL_RECIPIENT" ] && [ -z "$WEBHOOK_URL" ]; then
        log_error "At least one notification method is required (--email or --webhook)"
        print_usage
        exit 2
    fi

    log_info "Processing health alert for tenant: $TENANT_ID"

    # Get tenant configuration file
    local config_file
    config_file=$(get_tenant_config_file "$TENANT_ID") || exit 3

    # Load tenant information
    local tenant_info
    tenant_info=$(load_tenant_info "$config_file")

    local tenant_name
    local environment
    local server_host

    tenant_name=$(echo "$tenant_info" | cut -d'|' -f2)
    environment=$(echo "$tenant_info" | cut -d'|' -f3)
    server_host=$(echo "$tenant_info" | cut -d'|' -f4)

    # Generate default message if custom message not provided
    if [ -z "$CUSTOM_MESSAGE" ]; then
        CUSTOM_MESSAGE="A $ISSUE_TYPE issue has been detected for tenant $tenant_name in $environment environment."
    fi

    # Generate alert content
    local alert_subject
    local alert_body
    local webhook_payload

    alert_subject=$(generate_alert_subject "$TENANT_ID" "$tenant_name" "$ISSUE_TYPE" "$SEVERITY")
    alert_body=$(generate_alert_body "$TENANT_ID" "$tenant_name" "$environment" "$server_host" "$ISSUE_TYPE" "$SEVERITY" "$CUSTOM_MESSAGE" "$timestamp")
    webhook_payload=$(generate_webhook_payload "$TENANT_ID" "$tenant_name" "$environment" "$ISSUE_TYPE" "$SEVERITY" "$CUSTOM_MESSAGE" "$timestamp")

    # Send alerts
    local exit_code=0

    if [ -n "$EMAIL_RECIPIENT" ]; then
        if ! send_email_alert "$EMAIL_RECIPIENT" "$alert_subject" "$alert_body"; then
            exit_code=1
        fi
    fi

    if [ -n "$WEBHOOK_URL" ]; then
        if ! send_webhook_alert "$WEBHOOK_URL" "$webhook_payload"; then
            exit_code=1
        fi
    fi

    # Record to audit log
    record_alert_to_audit "$TENANT_ID" "$ISSUE_TYPE" "$SEVERITY" "$CUSTOM_MESSAGE"

    # Exit with appropriate code
    if [ $exit_code -eq 0 ]; then
        log_success "Health alert processed successfully"
    fi

    exit $exit_code
}

# Run main function
main "$@"
