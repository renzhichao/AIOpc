#!/bin/bash
#==============================================================================
# Simple Configuration Drift Test
#==============================================================================
# Purpose: Quick test of drift detection without complex data structures
#==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source configuration library
source "$LIB_DIR/config.sh"

# Test configuration
GIT_CONFIG="/Users/arthurren/projects/AIOpc/platform/.env.production"
CONTAINER_NAME="opclaw-backend"

echo "============================================================"
echo "  Configuration Drift Detection Test"
echo "============================================================"
echo

# Test 1: Check if we can read Git config
echo "Test 1: Reading Git configuration..."
if [ -f "$GIT_CONFIG" ]; then
    echo "✓ Git config found: $GIT_CONFIG"
    echo "  Sample variables:"
    grep -E '^(FEISHU_APP_ID|NODE_ENV|DB_HOST|JWT_SECRET)=' "$GIT_CONFIG" | head -4 | sed 's/^/    /'
else
    echo "✗ Git config not found: $GIT_CONFIG"
    exit 1
fi
echo

# Test 2: Check if we can connect to container
echo "Test 2: Checking container access..."
SSH_HOST="${SSH_HOST:-root@118.25.0.190}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rap001_opclaw}"

if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "docker ps | grep -q $CONTAINER_NAME"; then
    echo "✓ Container running: $CONTAINER_NAME (on $SSH_HOST)"
    echo "  Sample environment:"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "docker exec $CONTAINER_NAME printenv" | grep -E '^(FEISHU_APP_ID|NODE_ENV|DB_HOST|JWT_SECRET)=' | head -4 | sed 's/^/    /'
else
    echo "✗ Container not accessible: $CONTAINER_NAME (on $SSH_HOST)"
    echo "  Trying local Docker..."
    if docker ps | grep -q "$CONTAINER_NAME"; then
        echo "  ✓ Found container locally"
        USE_REMOTE=false
    else
        exit 1
    fi
fi
echo

# Test 3: Compare specific critical variables
echo "Test 3: Comparing critical variables..."
echo

# Function to extract value from .env file
get_env_value() {
    local file=$1
    local var=$2
    grep "^${var}=" "$file" 2>/dev/null | cut -d'=' -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# Function to extract value from container
get_container_value() {
    local container=$1
    local var=$2

    if [ "${USE_REMOTE:-true}" = "false" ]; then
        docker exec "$container" printenv 2>/dev/null | grep "^${var}=" | cut -d'=' -f2-
    else
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "docker exec $container printenv" 2>/dev/null | grep "^${var}=" | cut -d'=' -f2-
    fi
}

# Compare critical variables
critical_vars=("FEISHU_APP_ID" "NODE_ENV" "DB_SYNC" "JWT_SECRET")

for var in "${critical_vars[@]}"; do
    git_value=$(get_env_value "$GIT_CONFIG" "$var" 2>/dev/null || echo "")
    container_value=$(get_container_value "$CONTAINER_NAME" "$var" 2>/dev/null || echo "")

    echo "Variable: $var"
    echo "  Git:      ${git_value:-<not set>}"
    echo "  Container: ${container_value:-<not set>}"

    # Handle missing variables
    if [ -z "$git_value" ] && [ -z "$container_value" ]; then
        echo "  Status: ⏭️  SKIP (not set in either)"
        echo
        continue
    fi

    if [ "$git_value" != "$container_value" ]; then
        echo "  Status: ⚠️  DRIFT DETECTED"

        # Check for placeholder
        if [[ "$git_value" == *"placeholder"* ]] || [[ "$git_value" == *"xxx"* ]]; then
            echo "  Severity: CRITICAL (placeholder in Git)"
        elif [ "$var" = "NODE_ENV" ] && [ "$git_value" = "development" ]; then
            echo "  Severity: CRITICAL (development in production)"
        elif [ "$var" = "DB_SYNC" ] && [ "$container_value" = "true" ]; then
            echo "  Severity: CRITICAL (DB_SYNC enabled in production)"
        elif [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"PASSWORD"* ]] || [[ "$var" == *"KEY"* ]]; then
            echo "  Severity: CRITICAL (credential mismatch)"
        else
            echo "  Severity: MAJOR (configuration mismatch)"
        fi
    else
        echo "  Status: ✓ MATCH"
    fi
    echo
done

# Test 4: Check for variables in container but not in Git
echo "Test 4: Checking for added variables..."
echo

# Get all container variables
if [ "${USE_REMOTE:-true}" = "false" ]; then
    container_vars=$(docker exec "$CONTAINER_NAME" printenv 2>/dev/null | cut -d'=' -f1 | sort)
else
    container_vars=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "docker exec $CONTAINER_NAME printenv" 2>/dev/null | cut -d'=' -f1 | sort)
fi

# Variables that are expected to differ
whitelist="^PATH$|^HOSTNAME$|^HOME$|^PWD$|^TERM$|^NODE_VERSION$|^YARN_VERSION$|^_.*$"

added_count=0
for var in $container_vars; do
    # Skip whitelisted variables
    if [[ "$var" =~ $whitelist ]]; then
        continue
    fi

    # Check if variable exists in Git config
    if ! grep -q "^${var}=" "$GIT_CONFIG" 2>/dev/null; then
        if [ $added_count -lt 10 ]; then
            if [ "${USE_REMOTE:-true}" = "false" ]; then
                var_value=$(docker exec "$CONTAINER_NAME" printenv "$var" 2>/dev/null)
            else
                var_value=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "docker exec $CONTAINER_NAME printenv $var" 2>/dev/null)
            fi
            echo "  Added: $var=$var_value"
        fi
        ((added_count++))
    fi
done

if [ $added_count -eq 0 ]; then
    echo "  ✓ No unexpected variables found"
else
    echo "  Total added variables: $added_count"
fi
echo

echo "============================================================"
echo "  Test Complete"
echo "============================================================"
echo
echo "Next steps:"
echo "1. Run full drift detection: ./detect-config-drift.sh --verbose"
echo "2. Review drift reports in /tmp/config-drift-reports/"
echo "3. Install scheduled checks: ./schedule-drift-check.sh install"
