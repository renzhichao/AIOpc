#!/bin/bash
# Test DingTalk Login QR Code Display - Bug #28 Verification
# This script verifies that the DingTalk login QR code fix is working

set -e

TENANT_URL="http://113.105.103.165:20180"
API_BASE_URL="http://113.105.103.165:3000/api"

echo "======================================"
echo "DingTalk Login QR Code Test - Bug #28"
echo "======================================"
echo ""

echo "1. Testing Backend OAuth API..."
echo "   URL: $API_BASE_URL/oauth/authorize/dingtalk"
echo ""

DINGTALK_RESPONSE=$(curl -s "$API_BASE_URL/oauth/authorize/dingtalk?redirect_uri=http://113.105.103.165:20180/oauth/callback")

echo "   Response:"
echo "$DINGTALK_RESPONSE" | jq '.' 2>/dev/null || echo "$DINGTALK_RESPONSE"
echo ""

# Check if response contains success and URL
if echo "$DINGTALK_RESPONSE" | grep -q '"success":true'; then
    echo "   ✅ Backend API working correctly"
else
    echo "   ❌ Backend API failed"
    exit 1
fi

if echo "$DINGTALK_RESPONSE" | grep -q 'login.dingtalk.com'; then
    echo "   ✅ DingTalk authorization URL present"
else
    echo "   ❌ DingTalk authorization URL missing"
    exit 1
fi

echo ""
echo "2. Testing Frontend Login Page..."
echo "   URL: $TENANT_URL/login"
echo ""

# Check if login page loads
LOGIN_PAGE=$(curl -s "$TENANT_URL/login")
if echo "$LOGIN_PAGE" | grep -q "钉钉\|DingTalk"; then
    echo "   ✅ Login page loads successfully"
else
    echo "   ❌ Login page failed to load"
    exit 1
fi

echo ""
echo "3. Testing Frontend API Configuration..."
echo ""

# Check if frontend is using correct API base URL
# The frontend should make requests to /api (relative path) not localhost:3000
if echo "$LOGIN_PAGE" | grep -q "localhost:3000"; then
    echo "   ⚠️  Warning: Frontend may still be using localhost:3000"
    echo "   Check: Browser DevTools → Network tab should show requests to /api"
else
    echo "   ✅ Frontend not hardcoded to localhost:3000"
fi

echo ""
echo "======================================"
echo "✅ All Automated Tests Passed"
echo "======================================"
echo ""
echo "Manual Verification Steps:"
echo "1. Open browser: $TENANT_URL/login"
echo "2. Click '钉钉登录' (DingTalk Login)"
echo "3. Verify QR code is displayed"
echo "4. Open DevTools → Network tab"
echo "5. Verify request to: /api/oauth/authorize/dingtalk"
echo "6. Verify response contains DingTalk authorization URL"
echo ""
echo "Expected Result: QR code should display DingTalk authorization URL"
echo "Browser should NOT show requests to localhost:3000"
echo ""
