#!/bin/bash

# OpenClaw Service Deployment Script
# Deploys OpenClaw AI Agent Service to remote server

set -e

# Configuration
SERVICE_DIR="/opt/openclaw-service"
SERVICE_NAME="openclaw-service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "🚀 Deploying OpenClaw Service..."

# Create service directory
echo "📁 Creating service directory at ${SERVICE_DIR}..."
sudo mkdir -p ${SERVICE_DIR}/src

# Copy service files
echo "📄 Copying service files..."
sudo cp src/index.js ${SERVICE_DIR}/src/
sudo cp package.json ${SERVICE_DIR}/

# Install dependencies
echo "📦 Installing dependencies..."
cd ${SERVICE_DIR}
sudo npm install --production

# Copy systemd service file
echo "⚙️  Configuring systemd service..."
sudo cp ${SERVICE_NAME}.service ${SERVICE_FILE}

# Reload systemd and enable service
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}

# Start service
echo "▶️  Starting OpenClaw Service..."
sudo systemctl start ${SERVICE_NAME}

# Check status
echo "📊 Service status:"
sudo systemctl status ${SERVICE_NAME} --no-pager

echo ""
echo "✅ OpenClaw Service deployed successfully!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs: sudo journalctl -u ${SERVICE_NAME} -f"
echo "  - Restart: sudo systemctl restart ${SERVICE_NAME}"
echo "  - Stop: sudo systemctl stop ${SERVICE_NAME}"
echo "  - Status: sudo systemctl status ${SERVICE_NAME}"
