#!/bin/bash
echo "🔍 Verifying configuration files..."

# Check 1: Single .env.production source
CONFIG_COUNT=$(find . -name ".env.production" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
if [ "$CONFIG_COUNT" -ne 1 ]; then
  echo "❌ ERROR: Found $CONFIG_COUNT .env.production files (expected: 1)"
  find . -name ".env.production" -not -path "*/node_modules/*"
  exit 1
fi
echo "✅ Single .env.production found"

# Check 2: platform/.env.production exists
if [ ! -f "platform/.env.production" ]; then
  echo "❌ ERROR: platform/.env.production not found"
  exit 1
fi
echo "✅ platform/.env.production exists"

# Check 3: No placeholder values (except allowed CONFIGURE_IN_PLATFORM_ADMIN_PANEL)
if grep -E "cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder" platform/.env.production | grep -v "CONFIGURE_IN_PLATFORM_ADMIN_PANEL"; then
  echo "❌ ERROR: Invalid placeholder values found in platform/.env.production"
  grep -n -E "cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder" platform/.env.production | grep -v "CONFIGURE_IN_PLATFORM_ADMIN_PANEL"
  exit 1
fi
echo "✅ No invalid placeholder values in production config"

# Check 4: Required variables
REQUIRED_VARS=(
  "DB_HOST"
  "DB_PORT"
  "DB_NAME"
  "DB_USER"
  "DB_PASSWORD"
  "REDIS_HOST"
  "REDIS_PORT"
  "JWT_SECRET"
  "FEISHU_APP_ID"
  "FEISHU_APP_SECRET"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${var}=" platform/.env.production; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "❌ ERROR: Missing required variables: ${MISSING_VARS[*]}"
  exit 1
fi
echo "✅ All required variables present"

echo "✅ Configuration verification passed!"
