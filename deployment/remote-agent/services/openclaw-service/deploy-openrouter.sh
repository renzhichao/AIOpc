#!/bin/bash

# OpenClaw Service Deployment Script with OpenRouter Configuration
# This script deploys the updated OpenClaw service with OpenRouter API support

set -e

SERVICE_DIR="/opt/openclaw-service"
SERVICE_NAME="openclaw-service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "🚀 Deploying OpenClaw Service with OpenRouter..."

# Create service directory
echo "📁 Creating service directory at ${SERVICE_DIR}..."
sudo mkdir -p ${SERVICE_DIR}/src

# Copy service files from local (if running from deployment directory)
if [ -f "src/index.js" ]; then
    echo "📄 Copying service files from local..."
    sudo cp src/index.js ${SERVICE_DIR}/src/
    sudo cp package.json ${SERVICE_DIR}/
    sudo cp .env ${SERVICE_DIR}/
    sudo cp ${SERVICE_NAME}.service ${SERVICE_FILE}
else
    echo "⚠️  Local files not found. Please run this script from the openclaw-service directory"
    exit 1
fi

# Copy systemd service file
echo "⚙️  Configuring systemd service..."
sudo cp ${SERVICE_NAME}.service ${SERVICE_FILE}

# Install dependencies if needed
if [ ! -d "${SERVICE_DIR}/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd ${SERVICE_DIR}
    sudo npm install --production
else
    echo "✅ Dependencies already installed"
fi

# Reload systemd and restart service
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "▶️  Restarting OpenClaw Service..."
sudo systemctl restart ${SERVICE_NAME}

# Wait for service to start
echo "⏳ Waiting for service to start..."
sleep 3

# Check status
echo "📊 Service status:"
sudo systemctl status ${SERVICE_NAME} --no-pager

# Test health endpoint
echo ""
echo "🧪 Testing health endpoint..."
sleep 2
curl -s http://localhost:3001/health | jq '.' || echo "Health check failed"

echo ""
echo "✅ OpenClaw Service deployed successfully!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs: sudo journalctl -u ${SERVICE_NAME} -f"
echo "  - Restart: sudo systemctl restart ${SERVICE_NAME}"
echo "  - Stop: sudo systemctl stop ${SERVICE_NAME}"
echo "  - Status: sudo systemctl status ${SERVICE_NAME}"
echo ""
echo "🔑 Configuration:"
echo "  - Provider: OpenRouter"
echo "  - Model: deepseek/deepseek-chat"
echo "  - API Base: https://openrouter.ai/api"
