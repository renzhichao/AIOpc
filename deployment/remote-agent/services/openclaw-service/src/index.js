const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// DeepSeek API配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-test';
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * 聊天接口 - 连接到DeepSeek API
 */
app.post('/chat', async (req, res) => {
  const startTime = Date.now();
  const { message, session_id } = req.body;

  console.log('收到消息:', { session_id, message: message?.substring(0, 50) });

  try {
    // 调用DeepSeek API
    const response = await axios.post(
      `${DEEPSEEK_API_BASE}/v1/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是OpenClaw AI Agent，一个强大的AI助手，可以帮助用户完成各种任务。' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const reply = response.data.choices[0].message.content;

    const result = {
      reply,
      session_id: session_id || generateSessionId(),
      model: 'deepseek-chat',
      timestamp: new Date().toISOString(),
      metadata: {
        tokens_used: response.data.usage?.total_tokens || 0,
        processing_time_ms: Date.now() - startTime
      }
    };

    res.json(result);
  } catch (error) {
    console.error('DeepSeek API调用失败:', error.response?.data || error.message);

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
      model: 'mock-deepseek',
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
    model: 'deepseek-chat',
    tools: ['read', 'write', 'web_search', 'memory', 'exec', 'web_fetch', 'cron'],
    skills: ['customer_service', 'data_analysis', 'knowledge_base', 'report_generation', 'task_management']
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
  console.log('========================================');
});
