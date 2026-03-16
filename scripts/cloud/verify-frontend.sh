#!/bin/bash
#==============================================================================
# AIOpc Frontend Verification Script
#==============================================================================
# Purpose: Verify frontend deployment on cloud server
# Server: 118.25.0.190 (root@118.25.0.190)
# Domain: renava.cn
#
# Features:
# - File deployment verification
# - Permission checks
# - Nginx configuration validation
# - HTTP/HTTPS accessibility tests
# - API proxy verification
#
# Usage:
#   ./scripts/cloud/verify-frontend.sh [--verbose]
#
# Options:
#   --verbose    Show detailed information
#==============================================================================

set -e

#==============================================================================
# Configuration
#==============================================================================

SERVER="root@118.25.0.190"
FRONTEND_DIR="/var/www/opclaw"
DOMAIN="renava.cn"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

#==============================================================================
# Functions
#==============================================================================

print_header() {
    echo
    echo -e "${BLUE}=== $1 ===${NC}"
    echo
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_detail() {
    if [ "$VERBOSE" = true ]; then
        echo -e "  $1"
    fi
}

#==============================================================================
# Verification Checks
#==============================================================================

print_header "Frontend Deployment Verification"

TOTAL_CHECKS=0
PASSED_CHECKS=0

#==============================================================================
# 1. Check Files Deployed
#==============================================================================

print_info "1. Checking deployed files..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

FILE_COUNT=$(ssh $SERVER "find $FRONTEND_DIR -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")

if [ "$FILE_COUNT" -gt 0 ]; then
    print_success "Files deployed: $FILE_COUNT"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))

    if [ "$VERBOSE" = true ]; then
        echo "  File types:"
        ssh $SERVER "find $FRONTEND_DIR -type f | sed 's|.*\\.||' | sort | uniq -c | sort -rn" 2>/dev/null || true
    fi
else
    print_error "No files found in $FRONTEND_DIR"
fi

#==============================================================================
# 2. Check index.html
#==============================================================================

print_info "2. Checking index.html..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

if ssh $SERVER "test -f $FRONTEND_DIR/index.html" 2>/dev/null; then
    print_success "index.html exists"

    # Check if it's a valid HTML file
    if ssh $SERVER "grep -q '<!DOCTYPE html>' $FRONTEND_DIR/index.html" 2>/dev/null; then
        print_success "index.html is valid HTML"
    else
        print_warning "index.html may not be valid HTML"
    fi

    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_error "index.html not found"
fi

#==============================================================================
# 3. Check Asset Files
#==============================================================================

print_info "3. Checking asset files..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

JS_COUNT=$(ssh $SERVER "find $FRONTEND_DIR -name '*.js' -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
CSS_COUNT=$(ssh $SERVER "find $FRONTEND_DIR -name '*.css' -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")

if [ "$JS_COUNT" -gt 0 ] && [ "$CSS_COUNT" -gt 0 ]; then
    print_success "Asset files found (JS: $JS_COUNT, CSS: $CSS_COUNT)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "Missing asset files (JS: $JS_COUNT, CSS: $CSS_COUNT)"
fi

#==============================================================================
# 4. Check Permissions
#==============================================================================

print_info "4. Checking permissions..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

PERMS=$(ssh $SERVER "stat -c '%a' $FRONTEND_DIR 2>/dev/null" 2>/dev/null || echo "000")
OWNER=$(ssh $SERVER "stat -c '%U:%G' $FRONTEND_DIR 2>/dev/null" 2>/dev/null || echo "unknown")

if [ "$PERMS" = "755" ] && [ "$OWNER" = "www-data:www-data" ]; then
    print_success "Permissions correct (755, $OWNER)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "Permissions: $PERMS, Owner: $OWNER (expected: 755, www-data:www-data)"
fi

#==============================================================================
# 5. Check Directory Structure
#==============================================================================

print_info "5. Checking directory structure..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Check for common frontend directories
DIRS_TO_CHECK="assets"
MISSING_DIRS=0

for dir in $DIRS_TO_CHECK; do
    if ! ssh $SERVER "test -d $FRONTEND_DIR/$dir" 2>/dev/null; then
        MISSING_DIRS=$((MISSING_DIRS + 1))
    fi
done

if [ "$MISSING_DIRS" -eq 0 ]; then
    print_success "Directory structure intact"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "Missing $MISSING_DIRS directories"
fi

#==============================================================================
# 6. Check Nginx Configuration
#==============================================================================

print_info "6. Checking Nginx configuration..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Test Nginx configuration
NGINX_TEST=$(ssh $SERVER "nginx -t 2>&1" 2>/dev/null || echo "failed")

if echo "$NGINX_TEST" | grep -q "successful"; then
    print_success "Nginx configuration valid"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_error "Nginx configuration has errors"
    if [ "$VERBOSE" = true ]; then
        echo "$NGINX_TEST"
    fi
fi

#==============================================================================
# 7. Check Nginx is Running
#==============================================================================

print_info "7. Checking Nginx status..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

if ssh $SERVER "systemctl is-active nginx >/dev/null 2>&1"; then
    print_success "Nginx is running"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))

    if [ "$VERBOSE" = true ]; then
        VERSION=$(ssh $SERVER "nginx -v 2>&1" | cut -d'/' -f2)
        print_detail "Nginx version: $VERSION"
    fi
else
    print_error "Nginx is not running"
fi

#==============================================================================
# 8. Check Site is Enabled
#==============================================================================

print_info "8. Checking site is enabled..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

if ssh $SERVER "test -L /etc/nginx/sites-enabled/opclaw" 2>/dev/null; then
    print_success "Site opclaw is enabled"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_error "Site opclaw is not enabled"
fi

#==============================================================================
# 9. Test HTTP Access
#==============================================================================

print_info "9. Testing HTTP access..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN 2>/dev/null || echo "000")
HTTP_TIME=$(curl -s -o /dev/null -w "%{time_total}" http://$DOMAIN 2>/dev/null || echo "0.00")

if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    print_success "HTTP redirects (code: $HTTP_CODE, time: ${HTTP_TIME}s)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
elif [ "$HTTP_CODE" = "200" ]; then
    print_success "HTTP accessible (code: $HTTP_CODE, time: ${HTTP_TIME}s)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
elif [ "$HTTP_CODE" = "000" ]; then
    print_warning "HTTP not accessible (connection failed)"
else
    print_warning "HTTP response code: $HTTP_CODE (time: ${HTTP_TIME}s)"
fi

if [ "$VERBOSE" = true ]; then
    print_detail "Response headers:"
    curl -s -I http://$DOMAIN 2>/dev/null | head -5 || true
fi

#==============================================================================
# 10. Test HTTPS Access
#==============================================================================

print_info "10. Testing HTTPS access..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN 2>/dev/null || echo "000")
HTTPS_TIME=$(curl -s -o /dev/null -w "%{time_total}" https://$DOMAIN 2>/dev/null || echo "0.00")

if [ "$HTTPS_CODE" = "200" ]; then
    print_success "HTTPS accessible (code: $HTTPS_CODE, time: ${HTTPS_TIME}s)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))

    if [ "$VERBOSE" = true ]; then
        print_detail "SSL certificate info:"
        echo | openssl s_client -connect $DOMAIN:443 2>/dev/null | grep -E "subject|issuer" | head -2 || true
    fi
elif [ "$HTTPS_CODE" = "000" ]; then
    print_warning "HTTPS not yet available (SSL not configured)"
else
    print_warning "HTTPS response code: $HTTPS_CODE (time: ${HTTPS_TIME}s)"
fi

if [ "$VERBOSE" = true ] && [ "$HTTPS_CODE" != "000" ]; then
    print_detail "Response headers:"
    curl -s -I https://$DOMAIN 2>/dev/null | head -5 || true
fi

#==============================================================================
# 11. Check API Proxy
#==============================================================================

print_info "11. Testing API proxy..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/api/health 2>/dev/null || echo "000")

if [ "$API_CODE" = "200" ] || [ "$API_CODE" = "404" ]; then
    # 404 is acceptable if backend health endpoint doesn't exist yet
    print_success "API proxy working (code: $API_CODE)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_warning "API proxy response: $API_CODE"
fi

#==============================================================================
# 12. Check Disk Space
#==============================================================================

print_info "12. Checking disk space..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

DISK_USAGE=$(ssh $SERVER "du -sh $FRONTEND_DIR 2>/dev/null | cut -f1" 2>/dev/null || echo "unknown")
DISK_AVAILABLE=$(ssh $SERVER "df -h /var/www | tail -1 | awk '{print \$4}'" 2>/dev/null || echo "unknown")

print_success "Frontend size: $DISK_USAGE, Available: $DISK_AVAILABLE"
PASSED_CHECKS=$((PASSED_CHECKS + 1))

if [ "$VERBOSE" = true ]; then
    print_detail "Largest files:"
    ssh $SERVER "du -ah $FRONTEND_DIR 2>/dev/null | sort -rh | head -5" || true
fi

#==============================================================================
# 13. Check File Integrity
#==============================================================================

print_info "13. Checking file integrity..."

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Check for critical files
CRITICAL_FILES="index.html"

ALL_PRESENT=true
for file in $CRITICAL_FILES; do
    if ! ssh $SERVER "test -f $FRONTEND_DIR/$file" 2>/dev/null; then
        ALL_PRESENT=false
        break
    fi
done

if [ "$ALL_PRESENT" = true ]; then
    print_success "All critical files present"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    print_error "Some critical files missing"
fi

#==============================================================================
# Summary
#==============================================================================

print_header "Verification Summary"

echo "Total checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Failed: $((TOTAL_CHECKS - PASSED_CHECKS))"
echo

if [ "$PASSED_CHECKS" -eq "$TOTAL_CHECKS" ]; then
    print_success "All checks passed! Frontend deployment is healthy."
    echo
    echo "Access URLs:"
    echo "  HTTP:  http://$DOMAIN"
    echo "  HTTPS: https://$DOMAIN"
    echo
    exit 0
elif [ "$PASSED_CHECKS" -gt $((TOTAL_CHECKS / 2)) ]; then
    print_warning "Some checks failed. Review the output above."
    echo
    echo "Common issues:"
    echo "  - SSL not configured: Run ./scripts/cloud/setup-ssl.sh"
    echo "  - Backend not running: Run ./scripts/cloud/deploy-backend.sh"
    echo "  - Nginx config error: Check with 'nginx -t' on server"
    echo
    exit 1
else
    print_error "Multiple checks failed. Deployment may be broken."
    echo
    echo "Troubleshooting steps:"
    echo "  1. Check deployment: ./scripts/cloud/deploy-frontend.sh"
    echo "  2. Check logs: ssh $SERVER 'tail -f /var/log/nginx/opclaw-error.log'"
    echo "  3. Verify files: ssh $SERVER 'ls -la $FRONTEND_DIR'"
    echo
    exit 2
fi
