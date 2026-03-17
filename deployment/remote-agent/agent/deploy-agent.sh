#!/bin/bash

# Remote Agent Deployment Script
# Deploys the WebSocket-enabled remote agent

set -e

# Configuration
AGENT_DIR="/opt/openclaw-agent"
AGENT_SCRIPT="agent-ws.js"
SYSTEMD_SERVICE="/etc/systemd/system/openclaw-remote-agent.service"

echo "🚀 Deploying OpenClaw Remote Agent..."

# Create agent directory
echo "📁 Creating agent directory at ${AGENT_DIR}..."
sudo mkdir -p ${AGENT_DIR}

# Copy agent script
echo "📄 Copying agent script..."
sudo cp ${AGENT_SCRIPT} ${AGENT_DIR}/

# Create systemd service file if it doesn't exist
if [ ! -f "${SYSTEMD_SERVICE}" ]; then
    echo "⚙️  Creating systemd service file..."
    sudo tee ${SYSTEMD_SERVICE} > /dev/null <<'EOSVC'
[Unit]
Description=OpenClaw Remote Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-agent
ExecStart=/usr/bin/node /opt/openclaw-agent/agent-ws.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-agent

[Install]
WantedBy=multi-user.target
EOSVC
fi

# Reload systemd and restart agent
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "▶️  Restarting OpenClaw Remote Agent..."
sudo systemctl restart openclaw-remote-agent

# Check status
echo "📊 Agent status:"
sudo systemctl status openclaw-remote-agent --no-pager

echo ""
echo "✅ Remote Agent deployed successfully!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs: sudo journalctl -u openclaw-remote-agent -f"
echo "  - Restart: sudo systemctl restart openclaw-remote-agent"
echo "  - Stop: sudo systemctl stop openclaw-remote-agent"
