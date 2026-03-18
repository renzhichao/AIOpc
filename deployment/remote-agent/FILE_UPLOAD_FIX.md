# File Upload Fix for Remote Agent

## Problem
Files uploaded to platform server couldn't be processed by remote OpenClaw instances due to:
1. Agent not extracting files from message metadata
2. OpenClaw service Express body limit too small (100KB default)

## Solution

### 1. Agent Code Changes (agent-ws-updated.js)

Modified the agent to extract and pass files to OpenClaw service:

```javascript
async function handleUserMessage(command) {
  const { id, payload } = command;
  const { content, user_id, metadata } = payload;
  
  // Extract files from metadata
  const files = metadata?.files;

  try {
    // Process message with OpenClaw service
    const result = await processUserMessage(content, user_id, files);
    // ...
  }
}

async function processUserMessage(content, userId, files = null) {
  const requestBody = {
    message: content,
    session_id: 'user_' + userId + '_' + instanceId
  };

  // Add files if present
  if (files && files.length > 0) {
    requestBody.files = files;
  }

  // Call OpenClaw service
  const response = await axios.post(
    OPENCLAW_SERVICE_URL + '/chat',
    requestBody,
    { timeout: 60000 }
  );
}
```

### 2. OpenClaw Service Changes (src/index.js)

Modified to handle large request bodies and process files:

```javascript
// Increase body limit for file uploads
app.use(express.json({ limit: "50mb" }));

// Process files in /chat endpoint
app.post('/chat', async (req, res) => {
  const { message, session_id, files } = req.body;

  let systemMessage = '你是OpenClaw AI Agent...';
  
  if (files && files.length > 0) {
    const fileInfos = files.map(f => 
      `- 文件名: ${f.name} (类型: ${f.type}, 大小: ${Math.round(f.size / 1024)}KB)`
    ).join('\n');

    systemMessage += '\n\n用户上传了以下文件:\n' + fileInfos;

    // Extract text-based file content
    const textBasedFiles = files.filter(f => 
      f.type && (f.type.includes('text') || f.type.includes('application/json'))
    );

    if (textBasedFiles.length > 0) {
      systemMessage += '\n\n文件内容:\n';
      textBasedFiles.forEach(f => {
        if (f.content && f.encoding === 'base64') {
          const content = Buffer.from(f.content, 'base64').toString('utf-8');
          const preview = content.length > 2000 ? 
            content.substring(0, 2000) + '...(内容已截断)' : content;
          systemMessage += `\n--- ${f.name} ---\n${preview}\n`;
        }
      });
    }
  }

  // Continue with API call...
});
```

## Deployment

Apply these changes to the remote agent server:

```bash
# SSH to remote agent server
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52

# Backup current files
cp /opt/openclaw-agent/agent-ws-updated.js /opt/openclaw-agent/agent-ws-updated.js.backup
cp /opt/openclaw-service/src/index.js /opt/openclaw-service/src/index.js.backup

# Apply agent changes (already done in production)
# The modified agent-ws-updated.js includes file extraction

# Apply OpenClaw service changes (already done in production)
# Body limit increased to 50MB

# Restart services
systemctl restart openclaw-agent
systemctl restart openclaw-service

# Verify services are running
systemctl status openclaw-agent
systemctl status openclaw-service
```

## Verification

Test file upload functionality:

1. Upload a document through the platform
2. Send a message referencing the document
3. Check agent logs: `journalctl -u openclaw-agent -f`
4. Check service logs: `journalctl -u openclaw-service -f`
5. Verify AI response uses document content

## Files Modified

- `/opt/openclaw-agent/agent-ws-updated.js` - Agent WebSocket handler
- `/opt/openclaw-service/src/index.js` - OpenClaw API service

## Date Applied

2026-03-18

## Status

✅ Production deployed and verified
