#!/bin/bash
#==============================================================================
# AIOpc Backend Environment Configuration Script
#==============================================================================
# Purpose: Generate and configure production environment variables
#
# Features:
# - Secure random secret generation
# - Database password configuration
# - Environment file creation
# - Secrets export for safe storage
#
# Usage:
#   ./configure-backend-env.sh [--output-dir DIR] [--show-secrets]
#
# Security:
#   - All secrets are generated using cryptographically secure methods
#   - Secrets are exported to a file for secure storage
#   - Database password is updated automatically
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#==============================================================================
# Configuration
#==============================================================================

SERVER="${SERVER:-root@118.25.0.190}"
BACKEND_DIR="${BACKEND_DIR:-/opt/opclaw/backend}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp}"
SHOW_SECRETS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --show-secrets)
            SHOW_SECRETS=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#==============================================================================
# Logging Functions
#==============================================================================

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

log_step() {
    echo -e "${BLUE}==>${NC} $1"
}

#==============================================================================
# Utility Functions
#==============================================================================

generate_secret() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d '=+/' | cut -c1-$length
}

run_ssh() {
    ssh $SERVER "$1"
}

run_scp() {
    scp $1 $2
}

#==============================================================================
# Generate Secrets
#==============================================================================

generate_secrets() {
    log_step "Generating secure secrets..."

    # Generate JWT secret (min 32 characters)
    JWT_SECRET=$(generate_secret 32)
    log_info "JWT secret generated"

    # Generate session secret (min 32 characters)
    SESSION_SECRET=$(generate_secret 32)
    log_info "Session secret generated"

    # Generate encryption key (32 characters for AES-256)
    ENCRYPTION_KEY=$(generate_secret 32)
    log_info "Encryption key generated"

    # Generate database password
    DB_PASSWORD=$(generate_secret 24)
    log_info "Database password generated"

    # Generate Redis password
    REDIS_PASSWORD=$(generate_secret 24)
    log_info "Redis password generated"

    # Generate Feishu verify token
    FEISHU_VERIFY_TOKEN=$(generate_secret 32)
    log_info "Feishu verify token generated"

    # Generate Feishu encrypt key
    FEISHU_ENCRYPT_KEY=$(generate_secret 32)
    log_info "Feishu encrypt key generated"

    log_success "All secrets generated"
    echo
}

#==============================================================================
# Create Environment File
#==============================================================================

create_env_file() {
    log_step "Creating environment configuration file..."

    cat > /tmp/backend.env << EOF
# AIOpc Production Environment Configuration
# Generated: $(date +%Y-%m-%d %H:%M:%S)
# WARNING: Never commit this file to version control!

# ============================================
# Application Configuration
# ============================================
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# ============================================
# Database Configuration
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opclaw
DB_USERNAME=opclaw
DB_PASSWORD=$DB_PASSWORD
DB_SYNC=false
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=5
DB_CONNECTION_TIMEOUT=10000
DB_IDLE_TIMEOUT=30000
DB_QUERY_TIMEOUT=30000
DB_LOG_LEVEL=error

# ============================================
# Redis Configuration
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0
REDIS_MAX_RETRIES_PER_REQUEST=3
REDIS_RETRY_STRATEGY_DELAY=2000
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=3000

# ============================================
# Docker Configuration
# ============================================
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_NETWORK=opclaw-network
DOCKER_CONTAINER_CPU_LIMIT=2.0
DOCKER_CONTAINER_MEMORY_LIMIT=2g
DOCKER_CONTAINER_MEMORY_SWAP_LIMIT=2g

# ============================================
# Feishu OAuth Configuration
# ============================================
# NOTE: These values need to be configured manually
FEISHU_APP_ID=\${FEISHU_APP_ID}
FEISHU_APP_SECRET=\${FEISHU_APP_SECRET}
FEISHU_REDIRECT_URI=https://renava.cn/oauth/callback
FEISHU_OAUTH_AUTHORIZE_URL=https://open.feishu.cn/open-apis/authen/v1/authorize
FEISHU_OAUTH_TOKEN_URL=https://open.feishu.cn/open-apis/authen/v3/oidc/access_token
FEISHU_USER_INFO_URL=https://open.feishu.cn/open-apis/authen/v1/user_info
FEISHU_VERIFY_TOKEN=$FEISHU_VERIFY_TOKEN
FEISHU_ENCRYPT_KEY=$FEISHU_ENCRYPT_KEY

# ============================================
# DeepSeek LLM Configuration
# ============================================
# NOTE: API key needs to be configured manually
DEEPSEEK_API_KEY=\${DEEPSEEK_API_KEY}
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4000
DEEPSEEK_TEMPERATURE=0.7
DEEPSEEK_TIMEOUT=30000
DEEPSEEK_API_KEY_POOL_ENABLED=true
DEEPSEEK_MIN_POOL_SIZE=5
DEEPSEEK_MAX_POOL_SIZE=20

# ============================================
# Security Configuration
# ============================================
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
SESSION_SECRET=$SESSION_SECRET
SESSION_MAX_AGE=604800000
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENCRYPTION_ALGORITHM=aes-256-gcm

# ============================================
# CORS Configuration
# ============================================
CORS_ALLOWED_ORIGINS=https://renava.cn,https://www.renava.cn
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400

# ============================================
# Rate Limiting Configuration
# ============================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false

# ============================================
# Monitoring Configuration
# ============================================
ENABLE_METRICS=true
METRICS_COLLECTION_INTERVAL=30000
METRICS_RETENTION_DAYS=30
HEALTH_CHECK_INTERVAL=60000
HEALTH_CHECK_TIMEOUT=10000
HEALTH_CHECK_FAILURE_THRESHOLD=3
PERFORMANCE_MONITORING_ENABLED=true
SLOW_QUERY_THRESHOLD=1000
SLOW_API_THRESHOLD=5000

# ============================================
# Logging Configuration
# ============================================
LOG_DIR=logs
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
LOG_ERROR_MAX_FILES=30d
LOG_REQUEST_ENABLED=true
LOG_REQUEST_BODY=false
LOG_RESPONSE_BODY=false

# ============================================
# SSL/TLS Configuration
# ============================================
TRUST_PROXY=true
# FORCE_HTTPS=true

# ============================================
# Backup Configuration
# ============================================
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_DIR=/var/backups/opclaw

# ============================================
# Instance Management Configuration
# ============================================
INSTANCE_MAX_COUNT_PER_USER=5
INSTANCE_DEFAULT_TTL=86400000
INSTANCE_GRACE_PERIOD=3600000
INSTANCE_MAX_MEMORY=2g
INSTANCE_MAX_CPU=2.0
INSTANCE_MAX_DISK=10g
INSTANCE_RENEWAL_ENABLED=true
INSTANCE_RENEWAL_MAX_EXTENSIONS=10
INSTANCE_RENEWAL_WINDOW_DAYS=7

# ============================================
# API Rate Limiting (per endpoint)
# ============================================
INSTANCE_CREATE_RATE_LIMIT=5
INSTANCE_START_RATE_LIMIT=10
INSTANCE_STOP_RATE_LIMIT=20
APIKEY_CREATE_RATE_LIMIT=3
APIKEY_DELETE_RATE_LIMIT=10

# ============================================
# Feature Flags
# ============================================
FEATURE_QR_CODE_ENABLED=true
FEATURE_AUTO_RENEWAL_ENABLED=true
FEATURE_METRICS_ENABLED=true
FEATURE_WEBHOOK_ENABLED=true

# ============================================
# Production Settings
# ============================================
# SECURITY: MUST be false in production
MOCK_OAUTH_ENABLED=false
DEBUG_MODE=false
EOF

    log_success "Environment file created: /tmp/backend.env"
    echo
}

#==============================================================================
# Upload Environment File
#==============================================================================

upload_env_file() {
    log_step "Uploading environment file to server..."

    # Create backup of existing .env if it exists
    if run_ssh "[ -f '$BACKEND_DIR/.env' ]"; then
        log_info "Backing up existing .env file..."
        run_ssh "cp $BACKEND_DIR/.env $BACKEND_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Upload new environment file
    run_scp /tmp/backend.env $SERVER:$BACKEND_DIR/.env

    # Set proper permissions
    run_ssh "chmod 600 $BACKEND_DIR/.env"

    log_success "Environment file uploaded"
    echo
}

#==============================================================================
# Update Database Password
#==============================================================================

update_database_password() {
    log_step "Updating database password..."

    # Update PostgreSQL user password
    log_info "Updating PostgreSQL user password..."
    run_ssh "sudo -u postgres psql -c \"ALTER USER opclaw WITH PASSWORD '$DB_PASSWORD';\""

    log_success "Database password updated"
    echo
}

#==============================================================================
# Update Redis Password
#==============================================================================

update_redis_password() {
    log_step "Updating Redis configuration..."

    # Check if Redis requires password
    if run_ssh "grep -q '^requirepass' /etc/redis/redis.conf 2>/dev/null"; then
        log_info "Updating Redis password in config..."
        run_ssh "sudo sed -i 's/^requirepass.*/requirepass $REDIS_PASSWORD/' /etc/redis/redis.conf"
        run_ssh "sudo systemctl restart redis-server"
        log_success "Redis password updated and service restarted"
    else
        log_warning "Redis password not configured in redis.conf"
        log_info "To enable Redis authentication, add to /etc/redis/redis.conf:"
        log_info "  requirepass $REDIS_PASSWORD"
    fi
    echo
}

#==============================================================================
# Export Secrets
#==============================================================================

export_secrets() {
    log_step "Exporting secrets for safe storage..."

    SECRETS_FILE="$OUTPUT_DIR/opclaw-secrets-$(date +%Y%m%d_%H%M%S).txt"

    cat > $SECRETS_FILE << EOF
# AIOpc Production Secrets
# Generated: $(date +%Y-%m-%d %H:%M:%S)
# Server: $SERVER
# Backend Directory: $BACKEND_DIR

# ============================================
# SECURITY WARNING
# ============================================
# Store this file securely and delete after configuration!
# Do not commit to version control or share insecurely!

# ============================================
# Database Credentials
# ============================================
Database User: opclaw
Database Password: $DB_PASSWORD
Database Host: localhost
Database Port: 5432
Database Name: opclaw

# ============================================
# Redis Credentials
# ============================================
Redis Password: $REDIS_PASSWORD
Redis Host: localhost
Redis Port: 6379

# ============================================
# JWT and Session Secrets
# ============================================
JWT Secret: $JWT_SECRET
JWT Expiration: 7d
Session Secret: $SESSION_SECRET
Session Max Age: 604800000 (7 days)

# ============================================
# Encryption Keys
# ============================================
Encryption Key: $ENCRYPTION_KEY
Encryption Algorithm: aes-256-gcm

# ============================================
# Feishu OAuth Security
# ============================================
Verify Token: $FEISHU_VERIFY_TOKEN
Encrypt Key: $FEISHU_ENCRYPT_KEY

# ============================================
# Configuration Required
# ============================================
# The following values MUST be configured manually:
#
# 1. Feishu OAuth Credentials:
#    - FEISHU_APP_ID
#    - FEISHU_APP_SECRET
#    Get from: https://open.feishu.cn/app
#
# 2. DeepSeek API Key:
#    - DEEPSEEK_API_KEY
#    Get from: https://platform.deepseek.com/
#
# Update these values in: $BACKEND_DIR/.env
# Then restart service: ssh $SERVER 'pm2 restart opclaw-backend'
EOF

    # Set secure permissions
    chmod 600 $SECRETS_FILE

    log_success "Secrets exported to: $SECRETS_FILE"

    if [ "$SHOW_SECRETS" = true ]; then
        echo
        log_warning "DISPLAYING SECRETS (use with caution):"
        echo
        cat $SECRETS_FILE
    else
        log_info "To view secrets, use: cat $SECRETS_FILE"
    fi
    echo
}

#==============================================================================
# Display Next Steps
#==============================================================================

display_next_steps() {
    log_step "Configuration Complete - Next Steps"

    echo
    echo "Environment configuration completed successfully!"
    echo
    echo "IMPORTANT: Manual configuration required:"
    echo
    echo "1. Configure Feishu OAuth credentials:"
    echo "   ssh $SERVER"
    echo "   nano $BACKEND_DIR/.env"
    echo "   # Update FEISHU_APP_ID and FEISHU_APP_SECRET"
    echo
    echo "2. Configure DeepSeek API key:"
    echo "   # In the same file, update DEEPSEEK_API_KEY"
    echo
    echo "3. Restart backend service:"
    echo "   ssh $SERVER 'pm2 restart opclaw-backend'"
    echo
    echo "4. Verify service health:"
    echo "   ssh $SERVER 'curl http://localhost:3000/health'"
    echo
    echo "5. Monitor service logs:"
    echo "   ssh $SERVER 'pm2 logs opclaw-backend'"
    echo
    echo "Secrets saved to: $SECRETS_FILE"
    echo "⚠️  Store securely and delete after configuration!"
    echo
}

#==============================================================================
# Main Execution
#==============================================================================

main() {
    echo
    echo "=============================================================="
    echo "  AIOpc Backend Environment Configuration"
    echo "=============================================================="
    echo
    echo "Server: $SERVER"
    echo "Backend Directory: $BACKEND_DIR"
    echo "Output Directory: $OUTPUT_DIR"
    echo
    echo "=============================================================="
    echo

    # Execute configuration steps
    generate_secrets
    create_env_file
    upload_env_file
    update_database_password
    update_redis_password
    export_secrets
    display_next_steps

    echo "=============================================================="
    log_success "Environment configuration completed!"
    echo "=============================================================="
    echo
}

# Run main function
main "$@"
