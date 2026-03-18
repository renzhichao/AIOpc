const axios = require('axios');
const WebSocket = require('ws');
const winston = require('winston');
const os = require('os');
const fs = require('fs');
const http = require('http');

// Configuration
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://118.25.0.190';
const AGENT_PORT = process.env.AGENT_PORT || 3000;
const HEARTBEAT_INTERVAL = 30000;
const OPENCLAW_SERVICE_URL = process.env.OPENCLAW_SERVICE_URL || 'http://localhost:3001';
// Remote WebSocket Gateway port (different from main backend port)
const PLATFORM_WS_PORT = process.env.PLATFORM_WS_PORT || '3002';

// Docker-aware paths
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || '/opt/openclaw-agent/credentials.json';
const LOG_PATH = process.env.LOG_PATH || '/var/log/openclaw-agent.log';

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: LOG_PATH }),
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
let pingTimer = null;
let isRegistered = false;

/**
 * Get network IP address
 */
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown';
}

/**
 * Load existing credentials
 */
function loadCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      instanceId = credentials.instanceId;
      platformApiKey = credentials.platformApiKey;
      logger.info('Loaded existing credentials', { instanceId, path: CREDENTIALS_PATH });
      return true;
    } catch (error) {
      logger.error('Failed to load credentials', { error: error.message, path: CREDENTIALS_PATH });
      return false;
    }
  }
  logger.info('No existing credentials found', { path: CREDENTIALS_PATH });
  return false;
}

/**
 * Save credentials
 */
function saveCredentials() {
  const credentials = {
    instanceId,
    platformApiKey,
    platformUrl: PLATFORM_URL,
    registeredAt: new Date().toISOString()
  };
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  logger.info('Credentials saved', { instanceId, path: CREDENTIALS_PATH });
}

/**
 * Start HTTP health check server
 */
function startHealthCheckServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        instance_id: instanceId,
        connected: wsConnection?.readyState === WebSocket.OPEN,
        platform_url: PLATFORM_URL,
        timestamp: new Date().toISOString()
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(AGENT_PORT, () => {
    logger.info(`Health check server listening on port ${AGENT_PORT}`);
  });

  return server;
}

/**
 * Register agent with platform
 */
async function registerWithPlatform() {
  try {
    logger.info('Registering with platform...', { platformUrl: PLATFORM_URL });
    const hostname = os.hostname();
    const ip = getNetworkIP();
    const response = await axios.post(`${PLATFORM_URL}/api/instances/register`, {
      deployment_type: 'remote',
      hostname: ip,
      port: parseInt(AGENT_PORT),
      version: '1.0.0',
      capabilities: ['chat', 'web_search', 'code_execution'],
      metadata: {
        os: os.platform(),
        arch: os.arch(),
        node_version: process.version,
        hostname: hostname
      }
    }, { timeout: 30000 });
    const data = response.data.data;
    instanceId = data.instance_id;
    platformApiKey = data.platform_api_key;
    logger.info('Successfully registered with platform', {
      instanceId,
      platformApiKey: platformApiKey.substring(0, 10) + '...'
    });
    saveCredentials();
    isRegistered = true;
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
 * Process user message - call OpenClaw service
 */
async function processUserMessage(content, userId) {
  logger.info('Calling OpenClaw service', {
    userId,
    contentLength: content.length,
    openclawUrl: OPENCLAW_SERVICE_URL
  });

  try {
    // Call OpenClaw service
    const response = await axios.post(
      `${OPENCLAW_SERVICE_URL}/chat`,
      {
        message: content,
        session_id: `user_${userId}_${instanceId}`
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data;

    logger.info('OpenClaw service response', {
      replyLength: result.reply?.length || 0,
      model: result.model,
      tokensUsed: result.metadata?.tokens_used || 0
    });

    return {
      content: result.reply,
      timestamp: result.timestamp
    };
  } catch (error) {
    logger.error('Failed to call OpenClaw service', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Connect to platform via WebSocket
 */
function connectWebSocket() {
  // Extract hostname from PLATFORM_URL and use PLATFORM_WS_PORT for WebSocket
  const platformHost = PLATFORM_URL.replace('http://', '').replace('https://', '').split(':')[0];
  const wsUrl = `ws://${platformHost}:${PLATFORM_WS_PORT}/remote-ws?api_key=${platformApiKey}`;
  logger.info('Connecting to platform WebSocket...', { wsUrl, platformHost, wsPort: PLATFORM_WS_PORT });
  wsConnection = new WebSocket(wsUrl, {
    headers: { 'X-Platform-API-Key': platformApiKey }
  });
  wsConnection.on('open', () => {
    logger.info('WebSocket connection established');
    wsConnection.send(JSON.stringify({
      type: 'register',
      instance_id: instanceId,
      timestamp: new Date().toISOString(),
      data: {}
    }));
  });

  // Handle ping messages from Platform (heartbeat)
  // IMPORTANT: This is required for the Platform's heartbeat mechanism to work
  // We handle both WebSocket ping frames and JSON ping messages
  wsConnection.on('ping', (data) => {
    logger.info('WebSocket PING frame received from Platform', {
      dataLength: data ? data.length : 0,
      timestamp: new Date().toISOString()
    });
    wsConnection.pong(data);
    logger.info('WebSocket PONG frame sent to Platform');
  });

  // NOTE: We do NOT use proactive ping here. The Platform manages the heartbeat
  // by sending ping frames every 30 seconds, and we respond with pong.

  wsConnection.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.info('Received message from platform', { type: message.type });
      handlePlatformMessage(message);
    } catch (error) {
      logger.error('Failed to handle WebSocket message', { error: error.message });
    }
  });
  wsConnection.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });
  wsConnection.on('close', (code, reason) => {
    logger.warn('WebSocket connection closed', { code, reason: reason.toString() });
    logger.info('Will retry connection in 10 seconds');
    setTimeout(connectWebSocket, 10000);
  });
}

/**
 * Send response to platform
 */
function sendResponse(commandId, content, userId) {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    logger.error('Cannot send response: WebSocket not connected');
    return;
  }
  const response = {
    type: 'response',
    instance_id: instanceId,
    timestamp: new Date().toISOString(),
    data: {
      command_id: commandId,
      type: 'message',
      user_id: userId,
      content: content,
      timestamp: new Date().toISOString()
    }
  };
  wsConnection.send(JSON.stringify(response));
  logger.info('Response sent to platform', { commandId, contentLength: content.length });
}

/**
 * Handle user message - process with OpenClaw AI
 */
async function handleUserMessage(command) {
  const { id, payload } = command;
  const { content, user_id } = payload;

  logger.info('Processing user message', {
    commandId: id,
    userId: user_id,
    content: content.substring(0, 50)
  });

  try {
    // Process message with OpenClaw service
    const result = await processUserMessage(content, user_id);

    // Send response back to platform
    sendResponse(id, result.content, user_id);

    logger.info('Message processed successfully', { commandId: id });
  } catch (error) {
    logger.error('Failed to process user message', {
      error: error.message
    });

    // Send error response
    sendResponse(id, `抱歉，处理您的消息时出错：${error.message}`, user_id);
  }
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
    case 'ping':
      // Respond to platform ping with pong
      logger.info('JSON ping message received from Platform', {
        timestamp: message.timestamp
      });
      sendPongMessage();
      break;
    case 'command':
      handleCommand(message.data);
      break;
    default:
      logger.warn('Unknown message type', { type: message.type });
  }
}

/**
 * Send pong message to platform
 */
function sendPongMessage() {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    logger.error('Cannot send pong: WebSocket not connected');
    return;
  }
  const pongMessage = JSON.stringify({
    type: 'pong',
    instance_id: instanceId,
    timestamp: new Date().toISOString()
  });
  wsConnection.send(pongMessage);
  logger.info('PONG message sent to Platform');
}

/**
 * Handle command from platform
 */
function handleCommand(command) {
  logger.info('Received command from platform', {
    commandId: command.id,
    type: command.type
  });

  switch (command.type) {
    case 'message':
      handleUserMessage(command);
      break;
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
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  logger.info('Starting heartbeat', { interval: HEARTBEAT_INTERVAL });
  heartbeatTimer = setInterval(async () => {
    try {
      const response = await axios.post(
        `${PLATFORM_URL}/api/instances/${instanceId}/heartbeat`,
        {
          timestamp: Date.now(),
          status: 'online',
          metrics: {
            cpu_usage: 0,
            memory_usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
            active_sessions: 0,
            messages_processed: 0
          }
        },
        {
          headers: { 'X-Platform-API-Key': platformApiKey },
          timeout: 5000
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
    agentPort: AGENT_PORT,
    openclawServiceUrl: OPENCLAW_SERVICE_URL
  });
  try {
    // Start health check server first
    startHealthCheckServer();

    // Load or register credentials
    if (!loadCredentials()) {
      await registerWithPlatform();
    }

    // Connect to platform via WebSocket
    connectWebSocket();

    logger.info('Agent started successfully');
  } catch (error) {
    logger.error('Failed to start agent', { error: error.message });
    process.exit(1);
  }
}

const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (wsConnection) wsConnection.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason });
});

start().catch(error => {
  logger.error('Fatal error starting agent', { error: error.message });
  process.exit(1);
});
