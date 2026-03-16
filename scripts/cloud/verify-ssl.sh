#!/bin/bash

#==============================================================================
# AIOpc SSL Certificate Verification Script
#==============================================================================
# Purpose: Verify SSL certificate installation and HTTPS configuration
# Domain: renava.cn
# Server IP: 118.25.0.190
#
# Usage:
#   ./verify-ssl.sh [--verbose] [--check-all]
#
# Options:
#   --verbose  : Show detailed output
#   --check-all: Check from multiple external DNS servers
#
# Author: AIOpc Team
# Created: 2026-03-16
#==============================================================================

set -e  # Exit on error

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

DOMAIN="renava.cn"
WWW_DOMAIN="www.renava.cn"
API_DOMAIN="api.renava.cn"

CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

VERBOSE=""
CHECK_ALL=""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNING=0

#------------------------------------------------------------------------------
# Functions
#------------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((TESTS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    ((TESTS_WARNING++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((TESTS_FAILED++))
}

print_section() {
    echo
    echo "=============================================================================="
    echo "  $1"
    echo "=============================================================================="
}

print_banner() {
    clear
    echo
    echo "=============================================================================="
    echo "  AIOpc SSL Certificate Verification"
    echo "=============================================================================="
    echo "  Domain: $DOMAIN"
    echo "  Server: $(hostname -I | awk '{print $1}')"
    echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=============================================================================="
    echo
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_warning "This script works best with root privileges"
        log_info "Some checks may fail without root access"
        echo
    fi
}

check_certificate_files() {
    print_section "1. Certificate Files Check"

    # Check certificate file
    if [ -f "$CERT_PATH" ]; then
        log_success "Certificate file found: $CERT_PATH"
    else
        log_error "Certificate file not found: $CERT_PATH"
        return 1
    fi

    # Check private key file
    if [ -f "$KEY_PATH" ]; then
        log_success "Private key file found: $KEY_PATH"
    else
        log_error "Private key file not found: $KEY_PATH"
        return 1
    fi

    # Check file permissions
    CERT_PERM=$(stat -c "%a" "$CERT_PATH" 2>/dev/null || stat -f "%A" "$CERT_PATH")
    KEY_PERM=$(stat -c "%a" "$KEY_PATH" 2>/dev/null || stat -f "%A" "$KEY_PATH")

    if [ "$CERT_PERM" = "644" ] || [ "$CERT_PERM" = "444" ]; then
        log_success "Certificate file permissions correct: $CERT_PERM"
    else
        log_warning "Certificate file permissions unusual: $CERT_PERM (expected 644 or 444)"
    fi

    if [ "$KEY_PERM" = "600" ] || [ "$KEY_PERM" = "400" ]; then
        log_success "Private key file permissions correct: $KEY_PERM"
    else
        log_warning "Private key file permissions insecure: $KEY_PERM (expected 600 or 400)"
    fi
}

check_certificate_details() {
    print_section "2. Certificate Details"

    if [ ! -f "$CERT_PATH" ]; then
        log_error "Certificate file not found, skipping details check"
        return 1
    fi

    # Extract certificate information
    SUBJECT=$(openssl x509 -in "$CERT_PATH" -noout -subject 2>/dev/null | sed 's/subject=//')
    ISSUER=$(openssl x509 -in "$CERT_PATH" -noout -issuer 2>/dev/null | sed 's/issuer=//')
    START_DATE=$(openssl x509 -in "$CERT_PATH" -noout -startdate 2>/dev/null | sed 's/notBefore=//')
    END_DATE=$(openssl x509 -in "$CERT_PATH" -noout -enddate 2>/dev/null | sed 's/notAfter='//')
    SERIAL=$(openssl x509 -in "$CERT_PATH" -noout -serial 2>/dev/null | sed 's/serial=//')

    if [ -n "$SUBJECT" ]; then
        log_success "Subject: $SUBJECT"
    else
        log_error "Failed to read certificate subject"
    fi

    if [ -n "$ISSUER" ]; then
        log_success "Issuer: $ISSUER"
    else
        log_error "Failed to read certificate issuer"
    fi

    if [ -n "$START_DATE" ]; then
        log_success "Valid From: $START_DATE"
    else
        log_error "Failed to read certificate start date"
    fi

    if [ -n "$END_DATE" ]; then
        log_success "Valid Until: $END_DATE"

        # Check expiry
        END_TIMESTAMP=$(date -d "$END_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$END_DATE" +%s 2>/dev/null)
        CURRENT_TIMESTAMP=$(date +%s)
        DAYS_LEFT=$(( ($END_TIMESTAMP - $CURRENT_TIMESTAMP) / 86400 ))

        if [ $DAYS_LEFT -lt 0 ]; then
            log_error "Certificate has expired!"
        elif [ $DAYS_LEFT -lt 7 ]; then
            log_warning "Certificate expires in $DAYS_LEFT days (renew urgently)"
        elif [ $DAYS_LEFT -lt 30 ]; then
            log_warning "Certificate expires in $DAYS_LEFT days (renew soon)"
        else
            log_success "Certificate is valid for $DAYS_LEFT days"
        fi
    else
        log_error "Failed to read certificate end date"
    fi

    if [ -n "$SERIAL" ]; then
        log_info "Serial: $SERIAL"
    fi

    # Check SAN (Subject Alternative Names)
    if [ "$VERBOSE" = "yes" ]; then
        log_info "Subject Alternative Names:"
        openssl x509 -in "$CERT_PATH" -noout -text 2>/dev/null | grep -A 1 "Subject Alternative Name" | tail -n 1 | sed 's/^[[:space:]]*//'
    fi
}

check_dns_resolution() {
    print_section "3. DNS Resolution Check"

    for domain in $DOMAIN $WWW_DOMAIN $API_DOMAIN; do
        IP=$(dig +short $domain 2>/dev/null | head -n 1)

        if [ -n "$IP" ]; then
            log_success "$domain resolves to $IP"
        else
            log_error "$domain does not resolve"
        fi
    done
}

check_https_access() {
    print_section "4. HTTPS Access Check"

    for domain in $DOMAIN $WWW_DOMAIN $API_DOMAIN; do
        if curl -sSf https://$domain > /dev/null 2>&1; then
            log_success "HTTPS accessible: https://$domain"
        else
            log_error "HTTPS not accessible: https://$domain"
        fi
    done
}

check_http_redirect() {
    print_section "5. HTTP to HTTPS Redirect Check"

    for domain in $DOMAIN $WWW_DOMAIN $API_DOMAIN; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$domain 2>/dev/null)
        FINAL_URL=$(curl -s -o /dev/null -w "%{redirect_url}" http://$domain 2>/dev/null)

        if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
            log_success "HTTP redirects to HTTPS: $domain (code: $HTTP_CODE)"
            if [ "$VERBOSE" = "yes" ]; then
                log_info "  Redirects to: $FINAL_URL"
            fi
        else
            log_error "HTTP does not redirect properly: $domain (code: $HTTP_CODE)"
        fi
    done
}

check_ssl_configuration() {
    print_section "6. SSL Configuration Check"

    # Check SSL protocols
    if command -v nmap &> /dev/null; then
        log_info "Checking SSL protocols with nmap..."
        if nmap --script ssl-enum-ciphers -p 443 $DOMAIN 2>/dev/null | grep -q "TLSv1.2"; then
            log_success "TLSv1.2 is supported"
        else
            log_warning "TLSv1.2 not detected"
        fi

        if nmap --script ssl-enum-ciphers -p 443 $DOMAIN 2>/dev/null | grep -q "TLSv1.3"; then
            log_success "TLSv1.3 is supported"
        else
            log_warning "TLSv1.3 not detected"
        fi
    else
        log_info "nmap not installed, skipping protocol check"
    fi

    # Check certificate chain
    log_info "Checking certificate chain..."
    if openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
        log_success "Certificate chain is valid"
    else
        log_warning "Certificate chain validation failed"
    fi

    # Check OCSP stapling
    if openssl s_client -connect $DOMAIN:443 -servername $DOMAIN -status </dev/null 2>/dev/null | grep -q "OCSP response:"; then
        log_success "OCSP stapling is enabled"
    else
        log_warning "OCSP stapling not detected"
    fi
}

check_security_headers() {
    print_section "7. Security Headers Check"

    # Check HSTS
    HSTS_HEADER=$(curl -sI https://$DOMAIN 2>/dev/null | grep -i "strict-transport-security" || echo "")
    if [ -n "$HSTS_HEADER" ]; then
        log_success "HSTS header present: $HSTS_HEADER"
    else
        log_warning "HSTS header missing"
    fi

    # Check other security headers
    HEADERS=("X-Frame-Options" "X-Content-Type-Options" "X-XSS-Protection" "Referrer-Policy" "Content-Security-Policy")

    for header in "${HEADERS[@]}"; do
        HEADER_VALUE=$(curl -sI https://$DOMAIN 2>/dev/null | grep -i "$header" || echo "")
        if [ -n "$HEADER_VALUE" ]; then
            log_success "$header header present"
        else
            log_warning "$header header missing"
        fi
    done
}

check_certbot_renewal() {
    print_section "8. Certbot Auto-Renewal Check"

    if command -v certbot &> /dev/null; then
        # Check timer status
        if systemctl is-enabled certbot.timer &> /dev/null; then
            log_success "Certbot auto-renewal timer is enabled"
        else
            log_error "Certbot auto-renewal timer is not enabled"
        fi

        # Check last renewal
        if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
            RENEWAL_LOG="/var/log/letsencrypt/letsencrypt.log"
            if [ -f "$RENEWAL_LOG" ]; then
                LAST_RENEWAL=$(grep "Certificate renewed" "$RENEWAL_LOG" | tail -n 1 || echo "")
                if [ -n "$LAST_RENEWAL" ]; then
                    log_info "Last renewal: $(echo $LAST_RENEWAL | awk '{print $1, $2, $3}')"
                fi
            fi
        fi

        # Dry-run renewal test
        log_info "Testing renewal (dry-run)..."
        if certbot renew --dry-run &> /dev/null; then
            log_success "Renewal dry-run passed"
        else
            log_warning "Renewal dry-run failed"
        fi
    else
        log_warning "Certbot not installed"
    fi
}

check_ssl_labs_rating() {
    print_section "9. SSL Labs Rating Check"

    log_info "SSL Labs Rating: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
    log_info "This test may take a few minutes to complete..."
    log_info "Please visit the URL above for detailed SSL configuration analysis"
}

check_external_tools() {
    if [ "$CHECK_ALL" = "yes" ]; then
        print_section "10. External DNS Servers Check"

        DNS_SERVERS=("8.8.8.8:Google" "1.1.1.1:Cloudflare" "208.67.222.222:OpenDNS")

        for dns_server in "${DNS_SERVERS[@]}"; do
            SERVER_IP=$(echo $dns_server | cut -d: -f1)
            SERVER_NAME=$(echo $dns_server | cut -d: -f2)

            log_info "Checking from $SERVER_NAME DNS ($SERVER_IP)..."
            if dig @$SERVER_IP +short $DOMAIN | grep -q "."; then
                log_success "$DOMAIN resolves from $SERVER_NAME DNS"
            else
                log_error "$DOMAIN does not resolve from $SERVER_NAME DNS"
            fi
        done
    fi
}

display_summary() {
    print_section "Test Summary"

    TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED + TESTS_WARNING))

    echo "  Total Tests: $TOTAL_TESTS"
    echo -e "  ${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "  ${YELLOW}Warnings:${NC} $TESTS_WARNING"
    echo -e "  ${RED}Failed:${NC} $TESTS_FAILED"
    echo

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All critical tests passed!"
    else
        log_error "Some tests failed. Please review the output above."
    fi
}

display_recommendations() {
    print_section "Recommendations"

    echo "  1. If SSL tests failed, ensure DNS is properly configured"
    echo "  2. Run SSL setup script: sudo ./scripts/cloud/setup-ssl.sh"
    echo "  3. Check Nginx configuration: nginx -t"
    echo "  4. Reload Nginx: systemctl reload nginx"
    echo "  5. Check firewall allows HTTPS (port 443): ufw status"
    echo "  6. For detailed SSL analysis: https://www.ssllabs.com/ssltest/"
    echo "  7. Monitor certificate expiry and auto-renewal"
    echo
}

#------------------------------------------------------------------------------
# Parse Arguments
#------------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE="yes"
            shift
            ;;
        --check-all|-a)
            CHECK_ALL="yes"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--verbose|-v] [--check-all|-a]"
            exit 1
            ;;
    esac
done

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------

main() {
    print_banner
    check_root

    # Run all checks
    check_certificate_files
    check_certificate_details
    check_dns_resolution
    check_https_access
    check_http_redirect
    check_ssl_configuration
    check_security_headers
    check_certbot_renewal
    check_ssl_labs_rating
    check_external_tools

    # Display summary
    display_summary
    display_recommendations

    echo
    log_info "Verification completed at $(date '+%Y-%m-%d %H:%M:%S')"
    echo
}

# Run main function
main

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi
