#!/bin/bash
#==============================================================================
# Populate Tenants Dropdown Script
# (填充租户下拉选项脚本)
#
# Purpose: Automatically update GitHub Actions workflow with tenant list
#
# Features:
# - Scans config/tenants/ directory for tenant YAML files
# - Extracts tenant_id from each configuration
# - Updates deploy-tenant.yml workflow with current tenant list
# - Validates tenant configurations before adding to dropdown
# - Commits changes to repository
#
# Usage:
#   ./populate-tenants.sh [options]
#
# Options:
#   --dry-run          Show changes without applying them
#   --skip-validation  Skip tenant configuration validation
#   --commit           Commit changes to git
#   --push             Push changes to remote
#   --verbose          Enable verbose output
#   --help             Show this help message
#
# Examples:
#   ./populate-tenants.sh --dry-run
#   ./populate-tenants.sh --commit --push
#   ./populate-tenants.sh --verbose
#
# Dependencies:
# - yq (YAML processor)
# - git (version control)
#
# Version: 1.0
# Last Updated: 2026-03-19
#==============================================================================

set -euo pipefail

#==============================================================================
# Script Configuration
#==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKFLOW_FILE="${PROJECT_ROOT}/.github/workflows/deploy-tenant.yml"
TENANTS_DIR="${PROJECT_ROOT}/config/tenants"

# Script options
DRY_RUN=false
SKIP_VALIDATION=false
COMMIT_CHANGES=false
PUSH_CHANGES=false
VERBOSE=false

# Tenant list
declare -a TENANT_IDS=()
declare -a INVALID_TENANTS=()

#==============================================================================
# Helper Functions
#==============================================================================

# Show usage information
show_usage() {
    cat << EOF
Usage: $(basename "$0") [options]

Automatically update GitHub Actions workflow with tenant list.

Options:
  --dry-run          Show changes without applying them
  --skip-validation  Skip tenant configuration validation
  --commit           Commit changes to git
  --push             Push changes to remote
  --verbose          Enable verbose output
  --help             Show this help message

Examples:
  $(basename "$0") --dry-run
  $(basename "$0") --commit --push
  $(basename "$0") --verbose

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-validation)
                SKIP_VALIDATION=true
                shift
                ;;
            --commit)
                COMMIT_CHANGES=true
                shift
                ;;
            --push)
                PUSH_CHANGES=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                echo "ERROR: Unknown option: $1" >&2
                show_usage
                exit 1
                ;;
        esac
    done
}

# Log message
log_info() {
    echo "ℹ️  $*"
}

# Log success
log_success() {
    echo "✅ $*"
}

# Log warning
log_warning() {
    echo "⚠️  $*"
}

# Log error
log_error() {
    echo "❌ $*"
}

# Log verbose
log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "🔍 $*"
    fi
}

#==============================================================================
# Tenant Discovery Functions
#==============================================================================

# Discover all tenant configuration files
discover_tenants() {
    log_info "Discovering tenant configurations..."

    if [[ ! -d "$TENANTS_DIR" ]]; then
        log_error "Tenants directory not found: $TENANTS_DIR"
        return 1
    fi

    # Find all YAML files in tenants directory
    local tenant_files
    tenant_files=$(find "$TENANTS_DIR" -maxdepth 1 -name "*.yml" -type f | sort)

    if [[ -z "$tenant_files" ]]; then
        log_warning "No tenant configuration files found"
        return 0
    fi

    # Process each tenant file
    while IFS= read -r tenant_file; do
        local tenant_id
        tenant_id=$(basename "$tenant_file" .yml)

        # Skip template file
        if [[ "$tenant_id" == "template" ]]; then
            log_verbose "Skipping template file: $tenant_file"
            continue
        fi

        log_verbose "Found tenant: $tenant_id"

        # Validate tenant configuration
        if [[ "$SKIP_VALIDATION" == "false" ]]; then
            if validate_tenant_config "$tenant_file"; then
                TENANT_IDS+=("$tenant_id")
                log_success "Valid tenant: $tenant_id"
            else
                INVALID_TENANTS+=("$tenant_id")
                log_warning "Invalid tenant: $tenant_id"
            fi
        else
            TENANT_IDS+=("$tenant_id")
            log_success "Added tenant (validation skipped): $tenant_id"
        fi
    done <<< "$tenant_files"

    log_info "Found ${#TENANT_IDS[@]} valid tenant(s)"
    if [[ ${#INVALID_TENANTS[@]} -gt 0 ]]; then
        log_warning "Found ${#INVALID_TENANTS[@]} invalid tenant(s)"
    fi

    return 0
}

# Validate tenant configuration file
validate_tenant_config() {
    local tenant_file="$1"

    log_verbose "Validating: $tenant_file"

    # Check if yq is available
    if ! command -v yq &> /dev/null; then
        log_warning "yq not found, skipping validation"
        return 0
    fi

    # Validate YAML syntax
    if ! yq eval '.' "$tenant_file" > /dev/null 2>&1; then
        log_verbose "Invalid YAML syntax: $tenant_file"
        return 1
    fi

    # Check required fields
    local tenant_id
    tenant_id=$(yq '.tenant.id' "$tenant_file")

    if [[ "$tenant_id" == "null" ]] || [[ -z "$tenant_id" ]]; then
        log_verbose "Missing tenant.id: $tenant_file"
        return 1
    fi

    # Check for placeholder values
    local has_placeholders
    has_placeholders=$(yq eval '... | select(type == "string") | select(test("^(changeme|placeholder|test_|your_)$"; "i"))' "$tenant_file")

    if [[ -n "$has_placeholders" ]]; then
        log_verbose "Contains placeholders: $tenant_file"
        return 1
    fi

    return 0
}

#==============================================================================
# Workflow Update Functions
#==============================================================================

# Generate tenant options for workflow
generate_tenant_options() {
    local indent="          "

    for tenant_id in "${TENANT_IDS[@]}"; do
        echo "${indent}- $tenant_id"
    done
}

# Update workflow file with new tenant list
update_workflow() {
    log_info "Updating workflow file: $WORKFLOW_FILE"

    if [[ ! -f "$WORKFLOW_FILE" ]]; then
        log_error "Workflow file not found: $WORKFLOW_FILE"
        return 1
    fi

    if [[ ${#TENANT_IDS[@]} -eq 0 ]]; then
        log_warning "No tenants to add to workflow"
        return 0
    fi

    # Backup original file
    if [[ "$DRY_RUN" == "false" ]]; then
        cp "$WORKFLOW_FILE" "${WORKFLOW_FILE}.backup"
        log_verbose "Backup created: ${WORKFLOW_FILE}.backup"
    fi

    # Generate new tenant options
    local new_options
    new_options=$(generate_tenant_options)

    log_verbose "New tenant options:"
    log_verbose "$new_options"

    # Update workflow file
    if [[ "$DRY_RUN" == "false" ]]; then
        # Use awk to replace the tenant options section
        awk -v new_options="$new_options" '
            /# 动态填充选项，从 config\/tenants\/\*.yml 读取/ {
                in_options = 1
                print
                print ""
                print new_options
                next
            }
            in_options && /^          - / {
                next
            }
            in_options && /^        options:/ {
                print
                next
            }
            in_options && /^        #/ {
                in_options = 0
            }
            {
                print
            }
        ' "${WORKFLOW_FILE}.backup" > "$WORKFLOW_FILE"

        log_success "Workflow file updated"
    else
        log_info "[DRY-RUN] Would update workflow file with:"
        echo "$new_options"
    fi

    return 0
}

#==============================================================================
# Git Functions
#==============================================================================

# Commit changes to git
commit_changes() {
    log_info "Committing changes to git..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would commit changes"
        return 0
    fi

    cd "$PROJECT_ROOT"

    # Check if there are changes to commit
    if ! git diff --quiet "$WORKFLOW_FILE"; then
        local tenant_count=${#TENANT_IDS[@]}
        local commit_message="chore(ci): Update tenant dropdown options ($tenant_count tenant(s))"

        git add "$WORKFLOW_FILE"
        git commit -m "$commit_message"

        log_success "Changes committed: $commit_message"
    else
        log_info "No changes to commit"
    fi

    return 0
}

# Push changes to remote
push_changes() {
    log_info "Pushing changes to remote..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would push changes"
        return 0
    fi

    cd "$PROJECT_ROOT"

    # Get current branch
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD)

    if [[ "$current_branch" == "HEAD" ]]; then
        log_warning "Not on any branch, skipping push"
        return 0
    fi

    git push origin "$current_branch"

    log_success "Changes pushed to origin/$current_branch"
    return 0
}

#==============================================================================
# Summary Functions
#==============================================================================

# Print summary
print_summary() {
    echo ""
    echo "=============================================================================="
    echo "📊 Summary (摘要)"
    echo "=============================================================================="
    echo ""

    echo "Valid Tenants (有效租户): ${#TENANT_IDS[@]}"
    if [[ ${#TENANT_IDS[@]} -gt 0 ]]; then
        printf '  - %s\n' "${TENANT_IDS[@]}"
    fi
    echo ""

    if [[ ${#INVALID_TENANTS[@]} -gt 0 ]]; then
        echo "Invalid Tenants (无效租户): ${#INVALID_TENANTS[@]}"
        printf '  - %s\n' "${INVALID_TENANTS[@]}"
        echo ""
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Mode: Dry Run (演练模式)"
    else
        echo "Mode: Execute (执行模式)"
    fi
    echo ""

    if [[ "$COMMIT_CHANGES" == "true" ]]; then
        echo "Git Commit: Enabled"
    else
        echo "Git Commit: Disabled"
    fi

    if [[ "$PUSH_CHANGES" == "true" ]]; then
        echo "Git Push: Enabled"
    else
        echo "Git Push: Disabled"
    fi
    echo ""
}

#==============================================================================
# Main Function
#==============================================================================

main() {
    echo "=============================================================================="
    echo "🔧 Populate Tenants Dropdown Script"
    echo "=============================================================================="
    echo ""

    # Parse arguments
    parse_arguments "$@"

    # Discover tenants
    if ! discover_tenants; then
        log_error "Failed to discover tenants"
        exit 1
    fi

    # Update workflow
    if ! update_workflow; then
        log_error "Failed to update workflow"
        exit 1
    fi

    # Commit changes
    if [[ "$COMMIT_CHANGES" == "true" ]]; then
        if ! commit_changes; then
            log_warning "Failed to commit changes"
        fi
    fi

    # Push changes
    if [[ "$PUSH_CHANGES" == "true" ]]; then
        if ! push_changes; then
            log_warning "Failed to push changes"
        fi
    fi

    # Print summary
    print_summary

    echo "=============================================================================="
    log_success "Script completed successfully"
    echo "=============================================================================="

    exit 0
}

#==============================================================================
# Script Entry Point
#==============================================================================

main "$@"
