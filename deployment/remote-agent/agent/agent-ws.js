const axios = require('axios');
const WebSocket = require('ws');
const winston = require('winston');
const os = require('os');
const fs = require('fs');

// Configuration
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://118.25.0.190';
const AGENT_PORT = process.env.AGENT_PORT || 3000;
const HEARTBEAT_INTERVAL = 30000;
const OPENCLAW_SERVICE_URL = process.env.OPENCLAW_SERVICE_URL || 'http://localhost:3001';

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
  const credFile = '/opt/openclaw-agent/credentials.json';
  if (fs.existsSync(credFile)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(credFile, 'utf8'));
      instanceId = credentials.instanceId;
      platformApiKey = credentials.platformApiKey;
      logger.info('Loaded existing credentials', { instanceId });
      return true;
    } catch (error) {
      logger.error('Failed to load credentials', { error: error.message });
      return false;
    }
  }
  return false;
}

/**
 * Save credentials
 */
function saveCredentials() {
  const credFile = '/opt/openclaw-agent/credentials.json';
  const credentials = {
    instanceId,
    platformApiKey,
    platformUrl: PLATFORM_URL,
    registeredAt: new Date().toISOString()
  };
  fs.writeFileSync(credFile, JSON.stringify(credentials, null, 2));
  logger.info('Credentials saved', { instanceId });
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
  const host = PLATFORM_URL.replace('http://', '').replace('https://', '');
  const wsUrl = `ws://${host}/remote-ws?api_key=${platformApiKey}`;
  logger.info('Connecting to platform WebSocket...', { wsUrl });
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

  // Handle WebSocket ping frames to keep connection alive
  wsConnection.on('ping', (data) => {
    logger.debug('Received ping from platform, sending pong');
    // Explicitly send pong response (ws library doesn't auto-respond when ping handler is defined)
    wsConnection.pong(data);
  });

  // Handle WebSocket pong frames
  wsConnection.on('pong', (data) => {
    logger.debug('Received pong from platform');
  });

  // Start proactive ping to keep connection alive
  startProactivePing();

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
    // Clear ping timer
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    logger.info('Will retry connection in 10 seconds');
    setTimeout(connectWebSocket, 10000);
  });
}

/**
 * Start proactive ping to keep WebSocket connection alive
 */
function startProactivePing() {
  // Clear existing ping timer if any
  if (pingTimer) {
    clearInterval(pingTimer);
  }

  // Send ping every 30 seconds to keep connection alive
  pingTimer = setInterval(() => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      try {
        wsConnection.ping();
        logger.debug('Sent proactive ping to platform');
      } catch (error) {
        logger.error('Failed to send ping', { error: error.message });
      }
    }
  }, 30000); // 30 seconds

  logger.info('Started proactive ping timer', { interval: 30000 });
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
    if (!loadCredentials()) {
      await registerWithPlatform();
    }
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
