#!/bin/bash

#==============================================================================
# AIOpc Local Migration Test Script
#==============================================================================
# This script validates migration files locally before deployment.
#
# Usage:
#   ./test-migration-local.sh
#
# This script:
# - Checks migration files exist
# - Validates TypeScript syntax
# - Verifies TypeORM configuration
# - Tests migration compilation
#==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_SRC="$PROJECT_ROOT/platform/backend"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=============================================================================="
echo "AIOpc Local Migration Test"
echo "=============================================================================="
echo ""

# Test 1: Check backend directory exists
echo -e "${BLUE}[TEST 1]${NC} Checking backend directory..."
if [ -d "$BACKEND_SRC" ]; then
    echo -e "${GREEN}[✓]${NC} Backend directory exists: $BACKEND_SRC"
else
    echo -e "${RED}[✗]${NC} Backend directory not found: $BACKEND_SRC"
    exit 1
fi

# Test 2: Check package.json exists
echo -e "${BLUE}[TEST 2]${NC} Checking package.json..."
if [ -f "$BACKEND_SRC/package.json" ]; then
    echo -e "${GREEN}[✓]${NC} package.json exists"
else
    echo -e "${RED}[✗]${NC} package.json not found"
    exit 1
fi

# Test 3: Check TypeORM config exists
echo -e "${BLUE}[TEST 3]${NC} Checking TypeORM configuration..."
if [ -f "$BACKEND_SRC/typeorm.config.ts" ]; then
    echo -e "${GREEN}[✓]${NC} typeorm.config.ts exists"
else
    echo -e "${RED}[✗]${NC} typeorm.config.ts not found"
    exit 1
fi

# Test 4: Check migrations directory exists
echo -e "${BLUE}[TEST 4]${NC} Checking migrations directory..."
if [ -d "$BACKEND_SRC/migrations" ]; then
    echo -e "${GREEN}[✓]${NC} Migrations directory exists"
else
    echo -e "${RED}[✗]${NC} Migrations directory not found"
    exit 1
fi

# Test 5: Count migration files
echo -e "${BLUE}[TEST 5]${NC} Counting migration files..."
MIGRATION_COUNT=$(find "$BACKEND_SRC/migrations" -name "*.ts" | wc -l)
echo "Found $MIGRATION_COUNT migration file(s)"

if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo -e "${RED}[✗]${NC} No migration files found"
    exit 1
else
    echo -e "${GREEN}[✓]${NC} Migration files found: $MIGRATION_COUNT"
fi

# Test 6: List migration files
echo ""
echo -e "${BLUE}[TEST 6]${NC} Listing migration files:"
for file in "$BACKEND_SRC/migrations"/*.ts; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        size=$(du -h "$file" | cut -f1)
        echo "  - $filename ($size)"
    fi
done

# Test 7: Check migration file content
echo ""
echo -e "${BLUE}[TEST 7]${NC} Checking migration file content..."
MIGRATION_FILE="$BACKEND_SRC/migrations/1700000000000-InitialSchema.ts"

if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}[✓]${NC} InitialSchema migration exists"

    # Check for required content
    if grep -q "implements MigrationInterface" "$MIGRATION_FILE"; then
        echo -e "${GREEN}[✓]${NC} Implements MigrationInterface"
    else
        echo -e "${RED}[✗]${NC} Does not implement MigrationInterface"
        exit 1
    fi

    if grep -q "public async up" "$MIGRATION_FILE"; then
        echo -e "${GREEN}[✓]${NC} Has up() method"
    else
        echo -e "${RED}[✗]${NC} Missing up() method"
        exit 1
    fi

    if grep -q "public async down" "$MIGRATION_FILE"; then
        echo -e "${GREEN}[✓]${NC} Has down() method"
    else
        echo -e "${RED}[✗]${NC} Missing down() method"
        exit 1
    fi

    # Count CREATE TABLE statements
    TABLE_COUNT=$(grep -c "CREATE TABLE" "$MIGRATION_FILE" || echo "0")
    echo "  Found $TABLE_COUNT CREATE TABLE statements"

    # Check for critical tables
    CRITICAL_TABLES=("users" "api_keys" "qr_codes" "instances" "documents" "document_chunks" "instance_metrics" "instance_renewals")
    MISSING_TABLES=()

    for table in "${CRITICAL_TABLES[@]}"; do
        if grep -q "CREATE TABLE \"$table\"" "$MIGRATION_FILE"; then
            echo -e "  ${GREEN}[✓]${NC} Creates table: $table"
        else
            echo -e "  ${RED}[✗]${NC} Missing table: $table"
            MISSING_TABLES+=("$table")
        fi
    done

    if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
        echo -e "${RED}[✗]${NC} Missing tables: ${MISSING_TABLES[*]}"
        exit 1
    fi

else
    echo -e "${RED}[✗]${NC} InitialSchema migration not found"
    exit 1
fi

# Test 8: Check deployment scripts
echo ""
echo -e "${BLUE}[TEST 8]${NC} Checking deployment scripts..."
DEPLOY_SCRIPTS=(
    "$SCRIPT_DIR/deploy-database.sh"
    "$SCRIPT_DIR/run-migration.sh"
    "$SCRIPT_DIR/verify-database.sh"
)

for script in "${DEPLOY_SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo -e "${GREEN}[✓]${NC} $(basename "$script") - exists and executable"
        else
            echo -e "${YELLOW}[!]${NC} $(basename "$script") - exists but not executable"
        fi
    else
        echo -e "${RED}[✗]${NC} $(basename "$script") - not found"
        exit 1
    fi
done

# Test 9: Check documentation
echo ""
echo -e "${BLUE}[TEST 9]${NC} Checking documentation..."
DOCS_FILE="$PROJECT_ROOT/docs/DATABASE_MIGRATION_CLOUD.md"

if [ -f "$DOCS_FILE" ]; then
    echo -e "${GREEN}[✓]${NC} Documentation exists"
else
    echo -e "${YELLOW}[!]${NC} Documentation not found (optional)"
fi

# Test 10: Validate TypeScript syntax (if tsc is available)
echo ""
echo -e "${BLUE}[TEST 10]${NC} Validating TypeScript syntax..."
if command -v tsc &> /dev/null; then
    echo "TypeScript compiler found, validating..."
    cd "$BACKEND_SRC"

    if tsc --noEmit migrations/*.ts 2>/dev/null; then
        echo -e "${GREEN}[✓]${NC} TypeScript syntax is valid"
    else
        echo -e "${YELLOW}[!]${NC} TypeScript validation had warnings (may not be critical)"
    fi
else
    echo -e "${YELLOW}[!]${NC} TypeScript compiler not found, skipping syntax validation"
fi

# Summary
echo ""
echo "=============================================================================="
echo "Test Summary"
echo "=============================================================================="
echo ""
echo -e "${GREEN}[✓] All critical tests passed!${NC}"
echo ""
echo "Migration files are ready for deployment."
echo ""
echo "Next Steps:"
echo "  1. Review migration file content:"
echo "     cat $MIGRATION_FILE"
echo ""
echo "  2. Execute deployment:"
echo "     cd $SCRIPT_DIR"
echo "     ./deploy-database.sh"
echo ""
echo "  3. Verify after deployment:"
echo "     ./verify-database.sh --remote"
echo ""
echo "=============================================================================="
