#!/bin/bash

# Remote OpenClaw Agent Deployment Script
# This script installs and configures OpenClaw Agent on a remote server
# to connect to the AIOpc platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PLATFORM_URL="http://118.25.0.190"
PLATFORM_API_PORT="3000"
PLATFORM_WS_PORT="3002"
LOG_FILE="/var/log/openclaw-agent.log"
INSTALL_DIR="/opt/openclaw-agent"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

install_dependencies() {
    log_info "Installing system dependencies..."

    # Update package list
    apt-get update -y

    # Install basic tools
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        python3 \
        python3-pip \
        jq \
        ufw

    log_info "System dependencies installed"
}

install_nodejs() {
    log_info "Installing Node.js v22..."

    # Install Node.js v22 using NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs

    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)

    log_info "Node.js $NODE_VERSION installed"
    log_info "npm $NPM_VERSION installed"
}

install_docker() {
    log_info "Installing Docker..."

    # Install Docker using convenience script
    curl -fsSL https://get.docker.com | sh

    # Add current user to docker group (if not root)
    if [ -n "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER"
        log_warn "User $SUDO_USER added to docker group. Log out and back in for changes to take effect."
    fi

    # Verify installation
    DOCKER_VERSION=$(docker --version)
    log_info "$DOCKER_VERSION installed"
}

setup_openclaw_agent() {
    log_info "Setting up OpenClaw Agent..."

    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    # Initialize Node.js project
    npm init -y

    # Install OpenClaw CLI (if available) or create a simple agent
    # For now, we'll create a simple agent that connects to the platform
    log_info "Creating OpenClaw agent configuration..."

    # Create a simple agent package
    cat > package.json << 'EOF'
{
  "name": "openclaw-remote-agent",
  "version": "1.0.0",
  "description": "Remote OpenClaw Agent for AIOpc Platform",
  "main": "agent.js",
  "scripts": {
    "start": "node agent.js",
    "dev": "node agent.js --dev"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.0",
    "winston": "^3.11.0"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
EOF

    # Install dependencies
    npm install --production

    log_info "OpenClaw Agent dependencies installed"
}

create_agent_script() {
    log_info "Creating agent script..."

    cat > "$INSTALL_DIR/agent.js" << 'EOF'
const axios = require('axios');
const WebSocket = require('ws');
const winston = require('winston');

// Configuration
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://118.25.0.190';
const PLATFORM_API_PORT = process.env.PLATFORM_API_PORT || '3000';
const PLATFORM_WS_PORT = process.env.PLATFORM_WS_PORT || '3002';
const AGENT_PORT = process.env.AGENT_PORT || 3000;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/var/log/openclaw-agent.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Agent state
let instanceId = null;
let platformApiKey = null;
let wsConnection = null;
let heartbeatTimer = null;

/**
 * Register agent with platform
 */
async function registerWithPlatform() {
  try {
    logger.info('Registering with platform...', { platformUrl: PLATFORM_URL });

    // Get system information
    const os = require('os');
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    const ip = Object.values(networkInterfaces)[0]?.[0]?.address || 'unknown';

    const response = await axios.post(`${PLATFORM_URL}:${PLATFORM_API_PORT}/api/instances/register`, {
      deployment_type: 'remote',
      hostname: ip,
      port: parseInt(AGENT_PORT),
      version: '1.0.0',
      capabilities: ['chat', 'web_search', 'code_execution'],
      metadata: {
        os: os.platform(),
        arch: os.arch(),
        node_version: process.version
      }
    });

    const data = response.data.data;
    instanceId = data.instance_id;
    platformApiKey = data.platform_api_key;

    logger.info('Successfully registered with platform', {
      instanceId,
      platformApiKey: platformApiKey.substring(0, 10) + '...'
    });

    // Save credentials to file for persistence
    const fs = require('fs');
    fs.writeFileSync('/etc/openclaw-agent/credentials.json', JSON.stringify({
      instanceId,
      platformApiKey,
      platformUrl: PLATFORM_URL,
      registeredAt: new Date().toISOString()
    }, null, 2));

    return data;
  } catch (error) {
    logger.error('Failed to register with platform', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Connect to platform via WebSocket
 */
function connectWebSocket() {
  // Connect through nginx proxy on port 80 (path /ws) instead of direct port 3002
  // Cloud security group blocks ports 3000-3002, only allows 80/443
  const wsUrl = `ws://${PLATFORM_URL.replace('http://', '').replace('https://', '')}/ws?api_key=${platformApiKey}`;

  logger.info('Connecting to platform WebSocket through nginx proxy...', { wsUrl });

  wsConnection = new WebSocket(wsUrl);

  wsConnection.on('open', () => {
    logger.info('WebSocket connection established');

    // Send registration message
    wsConnection.send(JSON.stringify({
      type: 'register',
      instance_id: instanceId,
      timestamp: new Date().toISOString(),
      data: {}
    }));
  });

  wsConnection.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.info('Received message from platform', { type: message.type });

      handlePlatformMessage(message);
    } catch (error) {
      logger.error('Failed to handle WebSocket message', {
        error: error.message
      });
    }
  });

  wsConnection.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });

  wsConnection.on('close', () => {
    logger.warn('WebSocket connection closed, will retry in 10 seconds');
    setTimeout(connectWebSocket, 10000);
  });
}

/**
 * Handle message from platform
 */
function handlePlatformMessage(message) {
  switch (message.type) {
    case 'registered':
      logger.info('Registration confirmed by platform');
      startHeartbeat();
      break;

    case 'command':
      handleCommand(message.data);
      break;

    default:
      logger.warn('Unknown message type', { type: message.type });
  }
}

/**
 * Handle command from platform
 */
function handleCommand(command) {
  logger.info('Received command from platform', {
    commandId: command.id,
    type: command.type
  });

  // TODO: Implement command handling
  switch (command.type) {
    case 'config_update':
      logger.info('Config update command received');
      break;

    case 'restart':
      logger.info('Restart command received');
      break;

    case 'shutdown':
      logger.info('Shutdown command received');
      process.exit(0);
      break;

    default:
      logger.warn('Unknown command type', { type: command.type });
  }
}

/**
 * Start heartbeat
 */
function startHeartbeat() {
  logger.info('Starting heartbeat', { interval: HEARTBEAT_INTERVAL });

  heartbeatTimer = setInterval(async () => {
    try {
      const os = require('os');
      const response = await axios.post(
        `${PLATFORM_URL}:${PLATFORM_API_PORT}/api/instances/${instanceId}/heartbeat`,
        {
          timestamp: Date.now(),
          status: 'online',
          metrics: {
            cpu_usage: 0, // TODO: Implement actual CPU monitoring
            memory_usage: (os.totalmem() - os.freemem()) / os.totalmem() * 100,
            active_sessions: 0,
            messages_processed: 0
          }
        },
        {
          headers: {
            'X-Platform-API-Key': platformApiKey
          }
        }
      );

      logger.debug('Heartbeat sent successfully');
    } catch (error) {
      logger.error('Failed to send heartbeat', { error: error.message });
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Main startup function
 */
async function start() {
  logger.info('Starting OpenClaw Remote Agent...', {
    platformUrl: PLATFORM_URL,
    agentPort: AGENT_PORT
  });

  try {
    // Check if already registered
    const fs = require('fs');
    if (fs.existsSync('/etc/openclaw-agent/credentials.json')) {
      const credentials = JSON.parse(fs.readFileSync('/etc/openclaw-agent/credentials.json', 'utf8'));
      instanceId = credentials.instanceId;
      platformApiKey = credentials.platformApiKey;
      logger.info('Loaded existing credentials', { instanceId });
    } else {
      // Register with platform
      await registerWithPlatform();
    }

    // Connect WebSocket
    connectWebSocket();

    logger.info('Agent started successfully');
  } catch (error) {
    logger.error('Failed to start agent', { error: error.message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  if (wsConnection) {
    wsConnection.close();
  }

  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  if (wsConnection) {
    wsConnection.close();
  }

  process.exit(0);
});

// Start the agent
start().catch(error => {
  logger.error('Fatal error starting agent', { error: error.message });
  process.exit(1);
});
EOF

    chmod +x "$INSTALL_DIR/agent.js"

    log_info "Agent script created"
}

create_systemd_service() {
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/openclaw-agent.service << EOF
[Unit]
Description=OpenClaw Remote Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/agent.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-agent

# Environment
Environment="NODE_ENV=production"
Environment="PLATFORM_URL=$PLATFORM_URL"
Environment="PLATFORM_API_PORT=$PLATFORM_API_PORT"
Environment="PLATFORM_WS_PORT=$PLATFORM_WS_PORT"
Environment="AGENT_PORT=3000"

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable openclaw-agent

    log_info "Systemd service created and enabled"
}

configure_firewall() {
    log_info "Configuring firewall..."

    # Check if ufw is installed
    if command -v ufw &> /dev/null; then
        # Allow SSH
        ufw allow 22/tcp

        # Allow OpenClaw agent port (if needed)
        ufw allow 3000/tcp

        # Enable firewall
        ufw --force enable

        log_info "Firewall configured"
    else
        log_warn "ufw not installed, skipping firewall configuration"
    fi
}

main() {
    log_info "Starting OpenClaw Remote Agent deployment..."

    check_root
    install_dependencies
    install_nodejs
    install_docker
    setup_openclaw_agent
    create_agent_script
    create_systemd_service
    configure_firewall

    log_info "Deployment completed successfully!"
    log_info "You can now start the agent with: systemctl start openclaw-agent"
    log_info "Or: npm start"
}

# Run main function
main "$@"
EOF

chmod +x /Users/arthurren/projects/AIOpc/platform/backend/scripts/deploy-remote-agent.sh
