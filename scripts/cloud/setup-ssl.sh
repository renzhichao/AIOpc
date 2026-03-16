#!/bin/bash

#==============================================================================
# AIOpc SSL Certificate Setup Script
#==============================================================================
# Purpose: Automate SSL certificate installation using Let's Encrypt (Certbot)
# Domain: renava.cn
# Server IP: 118.25.0.190
#
# Prerequisites:
#   - DNS records must be configured and propagated
#   - Server must be accessible via HTTP (port 80)
#   - Root or sudo access required
#
# Usage:
#   sudo ./setup-ssl.sh [--test] [--force]
#
# Options:
#   --test   : Use Let's Encrypt staging server (for testing)
#   --force  : Force certificate renewal even if not expired
#
# Author: AIOpc Team
# Created: 2026-03-16
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

DOMAIN="renava.cn"
WWW_DOMAIN="www.renava.cn"
API_DOMAIN="api.renava.cn"
EMAIL="admin@renava.cn"  # Change this to your email

CERTBOT_EMAIL="--email $EMAIL"
# Or use --register-unsafely-without-email for no email

STAGING=""
FORCE_RENEW=""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#------------------------------------------------------------------------------
# Functions
#------------------------------------------------------------------------------

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

print_banner() {
    echo
    echo "=============================================================================="
    echo "  AIOpc SSL Certificate Setup"
    echo "=============================================================================="
    echo "  Domain: $DOMAIN"
    echo "  Server: $(hostname -I | awk '{print $1}')"
    echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=============================================================================="
    echo
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

check_dns() {
    log_info "Checking DNS configuration..."

    # Check if domain resolves to this server
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    DOMAIN_IP=$(dig +short $DOMAIN | head -n 1)

    if [ -z "$DOMAIN_IP" ]; then
        log_error "DNS record for $DOMAIN not found"
        log_warning "Please configure DNS records before running this script"
        log_info "See: docs/DNS_CONFIGURATION.md"
        exit 1
    fi

    if [ "$DOMAIN_IP" != "$LOCAL_IP" ]; then
        log_warning "DNS IP ($DOMAIN_IP) does not match server IP ($LOCAL_IP)"
        log_warning "Continuing anyway, but SSL certificate may fail..."
    else
        log_success "DNS configuration verified: $DOMAIN → $DOMAIN_IP"
    fi
}

check_http_access() {
    log_info "Checking HTTP access..."

    if curl -sSf http://$DOMAIN > /dev/null 2>&1; then
        log_success "HTTP access verified for $DOMAIN"
    else
        log_warning "HTTP access check failed for $DOMAIN"
        log_warning "Continuing anyway, but certificate request may fail..."
    fi
}

install_certbot() {
    log_info "Checking Certbot installation..."

    if command -v certbot &> /dev/null; then
        log_success "Certbot is already installed: $(certbot --version | head -n 1)"
    else
        log_info "Installing Certbot..."

        # Detect OS and install
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            apt update
            apt install -y certbot python3-certbot-nginx
        elif [ -f /etc/redhat-release ]; then
            # RHEL/CentOS
            yum install -y epel-release
            yum install -y certbot python3-certbot-nginx
        else
            log_error "Unsupported OS. Please install Certbot manually."
            exit 1
        fi

        log_success "Certbot installed successfully"
    fi
}

create_webroot() {
    log_info "Creating webroot for ACME challenge..."

    mkdir -p /var/www/certbot
    chown -R www-data:www-data /var/www/certbot 2>/dev/null || chown -R nginx:nginx /var/www/certbot 2>/dev/null || true

    log_success "Webroot created at /var/www/certbot"
}

request_certificate() {
    log_info "Requesting SSL certificate from Let's Encrypt..."

    # Build certbot command
    CERTBOT_CMD="certbot certonly --webroot"
    CERTBOT_CMD="$CERTBOT_CMD -w /var/www/certbot"
    CERTBOT_CMD="$CERTBOT_CMD -d $DOMAIN"
    CERTBOT_CMD="$CERTBOT_CMD -d $WWW_DOMAIN"
    CERTBOT_CMD="$CERTBOT_CMD -d $API_DOMAIN"
    CERTBOT_CMD="$CERTBOT_CMD $CERTBOT_EMAIL"
    CERTBOT_CMD="$CERTBOT_CMD --agree-tos"
    CERTBOT_CMD="$CERTBOT_CMD --non-interactive"
    CERTBOT_CMD="$CERTBOT_CMD $STAGING"

    log_info "Running: $CERTBOT_CMD"

    if $CERTBOT_CMD; then
        log_success "SSL certificate obtained successfully!"
    else
        log_error "Failed to obtain SSL certificate"
        log_info "If you're testing, use the --test flag to use Let's Encrypt staging server"
        log_info "Command: sudo $0 --test"
        exit 1
    fi
}

verify_certificate() {
    log_info "Verifying SSL certificate..."

    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

    if [ ! -f "$CERT_PATH" ]; then
        log_error "Certificate file not found: $CERT_PATH"
        exit 1
    fi

    # Display certificate details
    openssl x509 -in "$CERT_PATH" -noout -subject -dates

    log_success "SSL certificate verified"
}

configure_nginx() {
    log_info "Configuring Nginx for SSL..."

    NGINX_CONF="/etc/nginx/sites-available/opclaw"
    NGINX_ENABLED="/etc/nginx/sites-enabled/opclaw"

    if [ ! -f "$NGINX_CONF" ]; then
        log_error "Nginx configuration not found: $NGINX_CONF"
        log_info "Please ensure Nginx is configured first"
        exit 1
    fi

    # Test Nginx configuration
    if nginx -t 2>&1 | grep -q "successful"; then
        log_success "Nginx configuration is valid"
    else
        log_error "Nginx configuration test failed"
        nginx -t
        exit 1
    fi

    # Reload Nginx
    log_info "Reloading Nginx..."
    systemctl reload nginx

    log_success "Nginx reloaded successfully"
}

setup_auto_renewal() {
    log_info "Setting up automatic certificate renewal..."

    # Check if certbot timer is enabled
    if systemctl is-enabled certbot.timer &> /dev/null; then
        log_success "Certbot auto-renewal timer is already enabled"
    else
        log_info "Enabling Certbot auto-renewal timer..."
        systemctl enable certbot.timer
        systemctl start certbot.timer
        log_success "Certbot auto-renewal timer enabled"
    fi

    # Test renewal
    log_info "Testing certificate renewal (dry-run)..."
    if certbot renew --dry-run &> /dev/null; then
        log_success "Auto-renewal test passed"
    else
        log_warning "Auto-renewal test failed. Please check manually."
    fi
}

test_https_access() {
    log_info "Testing HTTPS access..."

    sleep 2  # Give Nginx time to reload

    if curl -sSf https://$DOMAIN > /dev/null 2>&1; then
        log_success "HTTPS access verified for $DOMAIN"
    else
        log_warning "HTTPS access check failed for $DOMAIN"
        log_warning "This may be due to firewall or DNS propagation issues"
    fi
}

display_certificate_info() {
    echo
    log_info "Certificate Information:"
    echo "------------------------------------------------------------------------------"
    certbot certificates
    echo "------------------------------------------------------------------------------"
}

display_next_steps() {
    echo
    log_success "SSL certificate setup completed successfully!"
    echo
    echo "Next Steps:"
    echo "  1. Verify HTTPS access: curl https://$DOMAIN"
    echo "  2. Check SSL rating: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
    echo "  3. Test all subdomains:"
    echo "     - https://$DOMAIN"
    echo "     - https://$WWW_DOMAIN"
    echo "     - https://$API_DOMAIN"
    echo "  4. Run verification script: ./scripts/cloud/verify-ssl.sh"
    echo
    echo "Certificate Location:"
    echo "  Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    echo "  Private Key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
    echo
    echo "Auto-Renewal:"
    echo "  Timer Status: systemctl status certbot.timer"
    echo "  Renewal Log: /var/log/letsencrypt/letsencrypt.log"
    echo
}

#------------------------------------------------------------------------------
# Parse Arguments
#------------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --test)
            STAGING="--test-cert --break-my-certs"
            log_warning "Using Let's Encrypt staging server (for testing)"
            shift
            ;;
        --force)
            FORCE_RENEW="--force-renewal"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Usage: sudo $0 [--test] [--force]"
            exit 1
            ;;
    esac
done

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------

main() {
    print_banner

    # Pre-flight checks
    check_root
    check_dns
    check_http_access

    # Installation
    install_certbot
    create_webroot

    # Certificate request
    request_certificate
    verify_certificate

    # Configuration
    configure_nginx
    setup_auto_renewal

    # Verification
    test_https_access
    display_certificate_info
    display_next_steps

    log_success "SSL setup completed successfully!"
}

# Run main function
main
