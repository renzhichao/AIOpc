/**
 * Mock OpenClaw AI Agent Service
 *
 * 本地开发测试用的模拟 OpenClaw 服务
 * 实现基本的聊天接口和健康检查
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

/**
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-openclaw',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 聊天接口
 * POST /chat
 */
app.post('/chat', (req, res) => {
  const { message, session_id } = req.body;

  console.log(`[${new Date().toISOString()}] 收到消息:`, {
    session_id,
    message: message?.substring(0, 100) // 只记录前100个字符
  });

  // 模拟 AI 响应
  const mockResponse = {
    reply: `Mock OpenClaw 收到您的消息: "${message || '(空消息)'}"\n\n` +
            `这是一个模拟的 AI Agent 响应。在生产环境中，这里会调用真实的 DeepSeek API ` +
            `并返回 Agent 的处理结果。\n\n` +
            `当前会话 ID: ${session_id || 'N/A'}\n` +
            `响应时间: ${new Date().toISOString()}`,
    session_id: session_id || generateSessionId(),
    model: 'mock-deepseek-v3',
    timestamp: new Date().toISOString(),
    metadata: {
      tokens_used: Math.floor(Math.random() * 1000) + 100,
      processing_time_ms: Math.floor(Math.random() * 500) + 100
    }
  };

  res.json(mockResponse);
});

/**
 * 获取 Agent 状态
 * GET /agent/status
 */
app.get('/agent/status', (req, res) => {
  res.json({
    status: 'running',
    agent_type: 'mock-agent',
    tools: ['read', 'write', 'web_search', 'memory', 'exec', 'web_fetch', 'cron'],
    skills: [
      'customer_service',
      'data_analysis',
      'knowledge_base',
      'report_generation',
      'task_management'
    ],
    memory_usage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

/**
 * 列出可用的 Tools
 * GET /tools
 */
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      { name: 'read', description: '读取文件内容', enabled: true },
      { name: 'write', description: '写入文件', enabled: true },
      { name: 'web_search', description: '网络搜索', enabled: true },
      { name: 'memory', description: '记忆管理', enabled: true },
      { name: 'exec', description: '执行命令', enabled: true },
      { name: 'web_fetch', description: '获取网页内容', enabled: true },
      { name: 'cron', description: '定时任务', enabled: true }
    ]
  });
});

/**
 * 列出可用的 Skills
 * GET /skills
 */
app.get('/skills', (req, res) => {
  res.json({
    skills: [
      { name: 'customer_service', description: '客户服务', enabled: true },
      { name: 'data_analysis', description: '数据分析', enabled: true },
      { name: 'knowledge_base', description: '知识库查询', enabled: true },
      { name: 'report_generation', description: '报告生成', enabled: true },
      { name: 'task_management', description: '任务管理', enabled: true }
    ]
  });
});

/**
 * 测试 DeepSeek API 调用
 * POST /api/test
 */
app.post('/api/test', (req, res) => {
  const { prompt } = req.body;

  // 模拟 API 调用延迟
  setTimeout(() => {
    res.json({
      result: `Mock DeepSeek API 响应: "${prompt}"`,
      model: 'mock-deepseek-v3',
      usage: {
        prompt_tokens: prompt.length,
        completion_tokens: Math.floor(Math.random() * 500) + 100,
        total_tokens: prompt.length + Math.floor(Math.random() * 500) + 100
      }
    });
  }, 500);
});

/**
 * 会话管理
 * GET /sessions
 */
app.get('/sessions', (req, res) => {
  res.json({
    sessions: [
      {
        id: 'mock-session-1',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        message_count: 15,
        status: 'active'
      },
      {
        id: 'mock-session-2',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        message_count: 8,
        status: 'inactive'
      }
    ]
  });
});

/**
 * 404 处理
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    message: 'Mock OpenClaw 服务未找到该端点'
  });
});

/**
 * 错误处理
 */
app.use((err, req, res, next) => {
  console.error('Mock OpenClaw 错误:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

/**
 * 生成会话 ID
 */
function generateSessionId() {
  return 'session_' + Math.random().toString(36).substring(2, 15) +
         '_' + Date.now();
}

/**
 * 启动服务器
 */
app.listen(PORT, () => {
  console.log('========================================');
  console.log('Mock OpenClaw AI Agent Service');
  console.log('========================================');
  console.log(`✅ 服务运行在: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`💬 聊天接口: http://localhost:${PORT}/chat`);
  console.log(`🔧 Tools: http://localhost:${PORT}/tools`);
  console.log(`📚 Skills: http://localhost:${PORT}/skills`);
  console.log('========================================');
  console.log('⚠️  注意: 这是 Mock 服务，仅用于本地开发测试');
  console.log('========================================\n');
});
