#!/bin/bash
# Docker Environment Integration Tests
# TDD First: Write failing tests, then implement

set -e

echo "========================================="
echo "Docker Environment Integration Tests"
echo "========================================="
echo ""

# Test 1: Docker daemon accessible
echo "Test 1: Checking Docker daemon accessibility..."
if ! docker info &> /dev/null; then
  echo "❌ FAILED: Docker daemon not accessible"
  exit 1
fi
echo "✅ PASSED: Docker daemon accessible"
echo ""

# Test 2: Docker Compose available
echo "Test 2: Checking Docker Compose availability..."
if ! docker compose version &> /dev/null; then
  echo "❌ FAILED: Docker Compose not available"
  exit 1
fi
echo "✅ PASSED: Docker Compose available"
echo ""

# Test 3: Can run basic containers
echo "Test 3: Testing basic container execution..."
if ! docker run --rm hello-world &> /dev/null; then
  echo "❌ FAILED: Cannot run basic container"
  exit 1
fi
echo "✅ PASSED: Can run basic containers"
echo ""

# Test 4: openclaw-agent image exists (will fail initially - RED phase)
echo "Test 4: Checking openclaw-agent image..."
if ! docker images | grep -q "openclaw/agent"; then
  echo "❌ FAILED: openclaw/agent image not found (expected in RED phase)"
  exit 1
fi
echo "✅ PASSED: openclaw/agent image exists"
echo ""

# Test 5: opclaw-network exists (will fail initially - RED phase)
echo "Test 5: Checking opclaw-network..."
if ! docker network ls | grep -q "opclaw-network"; then
  echo "❌ FAILED: opclaw-network not found (expected in RED phase)"
  exit 1
fi
echo "✅ PASSED: opclaw-network exists"
echo ""

# Test 6: Container can start and health check works (will fail initially - RED phase)
echo "Test 6: Testing container startup and health check..."
CONTAINER_ID=$(docker run -d -p 3010:3000 --name opclaw-test \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e JWT_SECRET=test_secret \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=opclaw \
  -e DB_USER=opclaw \
  -e DB_PASSWORD=test \
  -e REDIS_HOST=localhost \
  -e REDIS_PORT=6379 \
  openclaw/agent:latest 2>/dev/null || echo "")

if [ -z "$CONTAINER_ID" ]; then
  echo "❌ FAILED: Container failed to start (expected in RED phase)"
  exit 1
fi

# Wait for container to start and initialize
sleep 15

# Check if container is still running
if ! docker ps | grep -q "opclaw-test"; then
  echo "❌ FAILED: Container not running after start"
  docker logs opclaw-test 2>&1 | tail -30 || true
  docker rm -f opclaw-test 2>/dev/null || true
  exit 1
fi

# Check health endpoint
HEALTH_RESPONSE=$(curl -s http://localhost:3010/health || echo '{"status":"error"}')
if ! echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "❌ FAILED: Health check endpoint not responding correctly"
  echo "Response: $HEALTH_RESPONSE"
  docker logs opclaw-test 2>&1 | tail -30 || true
  docker rm -f opclaw-test 2>/dev/null || true
  exit 1
fi

# Cleanup
docker rm -f opclaw-test 2>/dev/null || true
echo "✅ PASSED: Container startup and health check working"
echo ""

echo "========================================="
echo "All Docker environment tests passed!"
echo "========================================="
