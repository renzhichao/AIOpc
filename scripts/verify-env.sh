#!/bin/bash
# Configuration Verification Script
# Prevents regression by validating critical configuration values

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENV_FILE="/opt/opclaw/.env.production"

echo "=== AIOpc Configuration Verification ==="
echo

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ ERROR: Environment file not found: $ENV_FILE${NC}"
    exit 1
fi

# Critical configuration values to validate
declare -A CRITICAL_CONFIGS=(
    ["FEISHU_APP_ID"]="cli_a93ce5614ce11bd6"
    ["FEISHU_APP_SECRET"]="L0cHQDBbEiIys6AHW53miecONb1xA4qy"
    ["JWT_SECRET"]="*u2a6n^OSMz7rOLCmZ18l3ip0IKKQaR*b6d&HGs1Tths00FK"
)

ERRORS=0

echo "Validating critical configuration values..."
echo

for key in "${!CRITICAL_CONFIGS[@]}"; do
    expected_value="${CRITICAL_CONFIGS[$key]}"
    actual_value=$(grep "^${key}=" "$ENV_FILE" | cut -d= -f2)

    if [ -z "$actual_value" ]; then
        echo -e "${RED}❌ $key: NOT FOUND in config${NC}"
        ERRORS=$((ERRORS + 1))
    elif [ "$actual_value" = "$expected_value" ]; then
        echo -e "${GREEN}✅ $key: OK${NC}"
    else
        echo -e "${RED}❌ $key: MISMATCH${NC}"
        echo -e "   Expected: ${YELLOW}$expected_value${NC}"
        echo -e "   Actual:   ${YELLOW}$actual_value${NC}"
        ERRORS=$((ERRORS + 1))
    fi
done

echo

# Check for placeholder values
echo "Checking for placeholder values..."
PLACEHOLDER_PATTERNS=(
    "cli_xxxxxxxxxxxxx"
    "your_"
    "CHANGE_THIS"
    "placeholder"
    "xxxxxxxx"
)

for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
    if grep -qi "$pattern" "$ENV_FILE"; then
        echo -e "${RED}❌ Found placeholder pattern: $pattern${NC}"
        grep -i "$pattern" "$ENV_FILE" | while read line; do
            echo "   $line"
        done
        ERRORS=$((ERRORS + 1))
    fi
done

echo
echo "=== Validation Summary ==="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All critical configurations are correct${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS configuration error(s)${NC}"
    echo
    echo "Please fix the configuration before deploying."
    echo "Reference: CLAUDE.md -> Production Deployment & Configuration Safety Rules"
    exit 1
fi
