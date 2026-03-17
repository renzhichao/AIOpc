# OpenRouter API Deployment Guide

## Overview

This guide covers deploying the OpenClaw service with OpenRouter API support to the remote server (101.34.254.52).

## Prerequisites

- SSH access to 101.34.254.52 as root user
- Node.js and npm installed on remote server
- OpenRouter API key: `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`

## Deployment Options

### Option 1: Automated Deployment (Requires SSH Access)

```bash
# From local machine, with proper SSH keys configured
cd deployment/remote-agent/services/openclaw-service
./deploy-openrouter.sh
```

### Option 2: Manual Deployment on Remote Server

If SSH authentication is not working, follow these steps directly on the remote server:

#### Step 1: Access Remote Server

```bash
# SSH to remote server (you'll need to authenticate)
ssh root@101.34.254.52
```

#### Step 2: Create Service Directory

```bash
mkdir -p /opt/openclaw-service/src
```

#### Step 3: Copy Updated Files

Copy the following files from your local machine to `/opt/openclaw-service/`:

**From local**: `deployment/remote-agent/services/openclaw-service/src/index.js`
**To remote**: `/opt/openclaw-service/src/index.js`

**From local**: `deployment/remote-agent/services/openclaw-service/.env`
**To remote**: `/opt/openclaw-service/.env`

**From local**: `deployment/remote-agent/services/openclaw-service/openclaw-service.service`
**To remote**: `/etc/systemd/system/openclaw-service.service`

#### Step 4: Update Systemd Service

```bash
# Copy systemd service file
cp openclaw-service.service /etc/systemd/system/openclaw-service.service

# Reload systemd
systemctl daemon-reload
```

#### Step 5: Restart OpenClaw Service

```bash
# Restart the service
systemctl restart openclaw-service

# Check status
systemctl status openclaw-service
```

#### Step 6: Verify Deployment

```bash
# Test health endpoint
curl http://localhost:3001/health

# Expected response:
{
  "status": "ok",
  "service": "openclaw-service",
  "version": "1.0.0",
  "provider": "openrouter",
  "model": "deepseek/deepseek-chat",
  "timestamp": "2026-03-17T..."
}
```

## Configuration Details

### Environment Variables (.env)

```bash
# LLM API Configuration
LLM_API_PROVIDER=openrouter
LLM_API_BASE=https://openrouter.ai/api
LLM_API_KEY=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
LLM_API_MODEL=deepseek/deepseek-chat

# Service Configuration
PORT=3001
```

### OpenRouter vs DeepSeek

The updated service supports both providers through environment variables:

| Provider | API_BASE | API_MODEL | Notes |
|----------|----------|-----------|-------|
| OpenRouter | https://openrouter.ai/api | deepseek/deepseek-chat | Multi-provider gateway |
| DeepSeek | https://api.deepseek.com | deepseek-chat | Direct DeepSeek API |

## Troubleshooting

### Service Not Starting

```bash
# Check service logs
journalctl -u openclaw-service -n 50

# Check if port 3001 is in use
lsof -i :3001
```

### API Authentication Errors

```bash
# Verify environment variables are loaded
systemctl show openclaw-service | grep Environment

# Check service logs for API errors
journalctl -u openclaw-service -f
```

### Testing OpenRouter API Directly

```bash
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer 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" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Next Steps After Deployment

1. **Test Chat API**
   ```bash
   curl -X POST http://localhost:3001/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"你好","session_id":"test-openrouter"}'
   ```

2. **Verify WebSocket Connection Stability**
   - Check Remote Agent logs: `journalctl -u openclaw-remote-agent -f`
   - Monitor connection status in Platform logs

3. **End-to-End Mobile Test**
   - Send test message from mobile app
   - Verify complete message flow: Mobile → Platform → Agent → OpenClaw Service → AI Response

## Files Modified

- `deployment/remote-agent/services/openclaw-service/src/index.js` - Added OpenRouter support
- `deployment/remote-agent/services/openclaw-service/.env` - OpenRouter configuration
- `deployment/remote-agent/services/openclaw-service/openclaw-service.service` - Added EnvironmentFile directive
- `deployment/remote-agent/services/openclaw-service/deploy-openrouter.sh` - Deployment script

## Git Commits

- `ec3773c` - feat(TASK-009): Add OpenRouter API support to OpenClaw Service
