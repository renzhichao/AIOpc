# Remote Agent Deployment

This directory contains the deployment scripts and configuration files for deploying OpenClaw remote agents to remote servers.

## Architecture

```
Remote Server (e.g., 101.34.254.52)
├── OpenClaw Remote Agent (WebSocket)
│   └── Connection to Platform (118.25.0.190)
├── OpenClaw Service (HTTP REST API)
│   └── DeepSeek API integration
└── Systemd Services
    ├── openclaw-remote-agent.service
    └── openclaw-service.service
```

## Components

### 1. OpenClaw Remote Agent (`agent/agent-ws.js`)
- Connects to platform via WebSocket
- Receives user messages from platform
- Forwards messages to OpenClaw Service
- Returns responses to platform

### 2. OpenClaw Service (`services/openclaw-service/`)
- HTTP REST API server on port 3001
- Integrates with DeepSeek API
- Provides `/chat` endpoint for AI responses
- Health check at `/health`

## Deployment

### Deploy OpenClaw Service

```bash
cd deployment/remote-agent/services/openclaw-service
chmod +x deploy.sh
./deploy.sh
```

### Deploy Remote Agent

```bash
cd deployment/remote-agent/agent
chmod +x deploy-agent.sh
./deploy-agent.sh
```

## Environment Variables

### Remote Agent
- `PLATFORM_URL`: Platform server URL (default: `http://118.25.0.190`)
- `AGENT_PORT`: Agent port (default: `3000`)
- `OPENCLAW_SERVICE_URL`: OpenClaw service URL (default: `http://localhost:3001`)

### OpenClaw Service
- `PORT`: Service port (default: `3001`)
- `DEEPSEEK_API_KEY`: DeepSeek API key (required for production)
- `DEEPSEEK_API_BASE`: DeepSeek API base URL (default: `https://api.deepseek.com`)

## Service Management

### OpenClaw Service
```bash
sudo systemctl status openclaw-service
sudo journalctl -u openclaw-service -f
sudo systemctl restart openclaw-service
```

### Remote Agent
```bash
sudo systemctl status openclaw-remote-agent
sudo journalctl -u openclaw-remote-agent -f
sudo systemctl restart openclaw-remote-agent
```

## Testing

### Test OpenClaw Service directly
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","session_id":"test"}'
```

### Test health check
```bash
curl http://localhost:3001/health
```

## Message Flow

1. User sends message via mobile app
2. Platform receives WebSocket message
3. Platform forwards to Remote Agent via WebSocket
4. Remote Agent calls OpenClaw Service via HTTP
5. OpenClaw Service calls DeepSeek API
6. Response flows back through the chain
7. User receives AI response

## Troubleshooting

### Agent not connecting to platform
- Check `PLATFORM_URL` is correct
- Verify agent has valid credentials in `/opt/openclaw-agent/credentials.json`
- Check platform WebSocket server is running

### OpenClaw Service not responding
- Check service is running: `sudo systemctl status openclaw-service`
- Check logs: `sudo journalctl -u openclaw-service -f`
- Verify port 3001 is not blocked by firewall

### DeepSeek API errors
- Verify `DEEPSEEK_API_KEY` is set correctly
- Check API key has not expired
- Verify network connectivity to api.deepseek.com
