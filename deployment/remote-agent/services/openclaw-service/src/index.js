const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// API 配置 - 支持 DeepSeek 和 OpenRouter
const API_KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || 'sk-test';
const API_BASE = process.env.LLM_API_BASE || process.env.OPENROUTER_API_BASE || process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
const API_MODEL = process.env.LLM_API_MODEL || process.env.DEEPSEEK_API_MODEL || 'deepseek-chat';
const API_PROVIDER = process.env.LLM_API_PROVIDER || (API_BASE.includes('openrouter') ? 'openrouter' : 'deepseek');

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-service',
    version: '1.0.0',
    provider: API_PROVIDER,
    model: API_MODEL,
    timestamp: new Date().toISOString()
  });
});

/**
 * 聊天接口 - 连接到 LLM API (DeepSeek 或 OpenRouter)
 */
app.post('/chat', async (req, res) => {
  const startTime = Date.now();
  const { message, session_id } = req.body;

  console.log('收到消息:', { session_id, message: message?.substring(0, 50) });

  try {
    // 构建请求
    const apiConfig = {
      method: 'post',
      url: `${API_BASE}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: API_MODEL,
        messages: [
          { role: 'system', content: '你是OpenClaw AI Agent，一个强大的AI助手，可以帮助用户完成各种任务。' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      timeout: 30000
    };

    // OpenRouter 特殊配置
    if (API_PROVIDER === 'openrouter') {
      apiConfig.headers['HTTP-Referer'] = 'https://openclaw.ai';
      apiConfig.headers['X-Title'] = 'OpenClaw AI Agent';
    }

    const response = await axios(apiConfig);
    const reply = response.data.choices[0].message.content;

    const result = {
      reply,
      session_id: session_id || generateSessionId(),
      model: API_MODEL,
      provider: API_PROVIDER,
      timestamp: new Date().toISOString(),
      metadata: {
        tokens_used: response.data.usage?.total_tokens || 0,
        processing_time_ms: Date.now() - startTime
      }
    };

    console.log('API 调用成功:', {
      provider: API_PROVIDER,
      model: API_MODEL,
      tokens: result.metadata.tokens_used,
      time: result.metadata.processing_time_ms + 'ms'
    });

    res.json(result);
  } catch (error) {
    console.error('LLM API调用失败:', {
      provider: API_PROVIDER,
      model: API_MODEL,
      error: error.response?.data || error.message
    });

    // 降级到mock响应
    const mockReply = `OpenClaw AI Agent 收到您的消息: "${message || '(空消息)'}"\n\n` +
      `我是OpenClaw，一个强大的AI助手。我可以帮助您：\n` +
      `• 回答问题和提供建议\n` +
      `• 分析数据和生成报告\n` +
      `• 编写和优化代码\n` +
      `• 网络搜索和信息整理\n\n` +
      `当前时间: ${new Date().toLocaleString('zh-CN')}`;

    res.json({
      reply: mockReply,
      session_id: session_id || generateSessionId(),
      model: API_MODEL,
      provider: 'mock',
      timestamp: new Date().toISOString(),
      metadata: {
        tokens_used: 0,
        processing_time_ms: 100,
        note: 'API调用失败，返回mock响应'
      }
    });
  }
});

/**
 * Agent状态
 */
app.get('/agent/status', (req, res) => {
  res.json({
    status: 'running',
    agent_type: 'openclaw-agent',
    provider: API_PROVIDER,
    model: API_MODEL,
    tools: ['read', 'write', 'web_search', 'memory', 'exec', 'web_fetch', 'cron'],
    skills: ['customer_service', 'data_analysis', 'knowledge_base', 'report_generation', 'task_management', 'image_generation']
  });
});

function generateSessionId() {
  return 'session_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
}

app.listen(PORT, () => {
  console.log('========================================');
  console.log('OpenClaw AI Agent Service');
  console.log('========================================');
  console.log(`✅ 服务运行在: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`💬 聊天接口: http://localhost:${PORT}/chat`);
  console.log(`🔑 API提供商: ${API_PROVIDER}`);
  console.log(`🤖 模型: ${API_MODEL}`);
  console.log('========================================');
});
