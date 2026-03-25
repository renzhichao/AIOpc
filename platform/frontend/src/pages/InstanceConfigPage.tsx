/**
 * 实例配置页面
 *
 * 允许用户自定义实例配置，包括：
 * - LLM 配置（API Key、模型、温度、最大 tokens）
 * - 技能管理（启用/禁用技能）
 * - 工具管理（启用/禁用工具，设置层级）
 * - 系统提示词编辑
 * - 使用限制配置
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';

interface LLMConfig {
  provider: string;
  api_key: string;
  api_base: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

interface SkillConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface ToolConfig {
  name: string;
  enabled: boolean;
  layer: 1 | 2;
}

interface UsageLimits {
  max_messages_per_day: number;
  max_storage_mb: number;
  max_users?: number;
}

interface InstanceConfig {
  llm: LLMConfig;
  skills: SkillConfig[];
  tools: ToolConfig[];
  system_prompt: string;
  limits: UsageLimits;
}

const SKILL_NAMES: Record<string, string> = {
  general_chat: '通用对话',
  web_search: '网络搜索',
  knowledge_base: '知识库',
  email_assistant: '邮件助手',
  code_helper: '代码助手',
  data_analyst: '数据分析',
};

const TOOL_NAMES: Record<string, string> = {
  read: '读取',
  write: '写入',
  web_search: '网络搜索',
  memory: '记忆',
  exec: '执行命令',
  web_fetch: '网页获取',
  cron: '定时任务',
};

export default function InstanceConfigPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [config, setConfig] = useState<InstanceConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<InstanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'llm' | 'skills' | 'tools' | 'prompt' | 'limits'>('llm');
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  /**
   * 加载实例配置
   */
  const loadConfig = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');

      const configData = await instanceService.getInstanceConfig(id);
      setConfig(configData);
      setOriginalConfig(configData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载配置失败';
      setError(message);
      console.error('加载配置失败:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  /**
   * 组件挂载时加载配置
   */
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /**
   * 检查配置是否有变化
   */
  useEffect(() => {
    if (originalConfig && config) {
      const changed = JSON.stringify(config) !== JSON.stringify(originalConfig);
      setHasChanges(changed);
    }
  }, [config, originalConfig]);

  /**
   * 保存配置
   */
  const handleSave = async () => {
    if (!id || !config || !originalConfig) return;

    try {
      setSaving(true);
      setError('');

      // 计算差异部分
      const partialUpdate: Partial<InstanceConfig> = {};

      if (JSON.stringify(config.llm) !== JSON.stringify(originalConfig.llm)) {
        partialUpdate.llm = config.llm;
      }

      if (JSON.stringify(config.skills) !== JSON.stringify(originalConfig.skills)) {
        partialUpdate.skills = config.skills;
      }

      if (JSON.stringify(config.tools) !== JSON.stringify(originalConfig.tools)) {
        partialUpdate.tools = config.tools;
      }

      if (config.system_prompt !== originalConfig.system_prompt) {
        partialUpdate.system_prompt = config.system_prompt;
      }

      if (JSON.stringify(config.limits) !== JSON.stringify(originalConfig.limits)) {
        partialUpdate.limits = config.limits;
      }

      await instanceService.updateInstanceConfig(id, partialUpdate);

      setSuccess(true);
      setOriginalConfig({ ...config });

      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存配置失败';
      setError(message);
      console.error('保存配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * 取消编辑
   */
  const handleCancel = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
      setError('');
    }
  };

  /**
   * 重置为默认配置
   */
  const handleReset = async () => {
    if (!id) return;

    try {
      setSaving(true);
      setShowResetConfirm(false);

      // 这里可以根据模板重置为默认配置
      // 暂时使用当前配置作为基准
      if (originalConfig) {
        setConfig({ ...originalConfig });
        setHasChanges(false);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '重置配置失败';
      setError(message);
      console.error('重置配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * 更新 LLM 配置
   */
  const updateLLMConfig = (field: keyof LLMConfig, value: string | number) => {
    if (!config) return;

    setConfig({
      ...config,
      llm: {
        ...config.llm,
        [field]: value,
      },
    });
  };

  /**
   * 切换技能状态
   */
  const toggleSkill = (skillName: string) => {
    if (!config) return;

    setConfig({
      ...config,
      skills: config.skills.map(skill =>
        skill.name === skillName ? { ...skill, enabled: !skill.enabled } : skill
      ),
    });
  };

  /**
   * 切换工具状态
   */
  const toggleTool = (toolName: string) => {
    if (!config) return;

    setConfig({
      ...config,
      tools: config.tools.map(tool =>
        tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool
      ),
    });
  };

  /**
   * 更新工具层级
   */
  const updateToolLayer = (toolName: string, layer: 1 | 2) => {
    if (!config) return;

    setConfig({
      ...config,
      tools: config.tools.map(tool =>
        tool.name === toolName ? { ...tool, layer } : tool
      ),
    });
  };

  /**
   * 更新使用限制
   */
  const updateLimit = (field: keyof UsageLimits, value: number) => {
    if (!config) return;

    setConfig({
      ...config,
      limits: {
        ...config.limits,
        [field]: value,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载配置中...</p>
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{error}</h3>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(-1)}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ← 返回
            </button>
          </div>

          <h1 className="text-3xl font-bold text-gray-900">实例配置</h1>
          <p className="mt-1 text-sm text-gray-600">自定义您的实例配置</p>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md">
          {/* 标签页导航 */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('llm')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'llm'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                LLM 配置
              </button>
              <button
                onClick={() => setActiveTab('skills')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'skills'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                技能管理
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tools'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                工具管理
              </button>
              <button
                onClick={() => setActiveTab('prompt')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'prompt'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                系统提示词
              </button>
              <button
                onClick={() => setActiveTab('limits')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'limits'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                使用限制
              </button>
            </nav>
          </div>

          {/* 标签页内容 */}
          <div className="p-6">
            {/* 错误提示 */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* 成功提示 */}
            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">配置保存成功！</p>
              </div>
            )}

            {/* LLM 配置 */}
            {activeTab === 'llm' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={config.llm.api_key}
                    onChange={(e) => updateLLMConfig('api_key', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="sk-..."
                  />
                  <p className="mt-1 text-xs text-gray-500">用于访问 LLM 服务的 API 密钥</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={config.llm.api_base}
                    onChange={(e) => updateLLMConfig('api_base', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="https://api.deepseek.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    模型
                  </label>
                  <input
                    type="text"
                    value={config.llm.model}
                    onChange={(e) => updateLLMConfig('model', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="deepseek-chat"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      温度 (Temperature)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={config.llm.temperature}
                      onChange={(e) => updateLLMConfig('temperature', parseFloat(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">0-2 之间，越高越随机</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      最大 Tokens
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="32000"
                      value={config.llm.max_tokens}
                      onChange={(e) => updateLLMConfig('max_tokens', parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">最大生成长度</p>
                  </div>
                </div>
              </div>
            )}

            {/* 技能管理 */}
            {activeTab === 'skills' && (
              <div className="space-y-4">
                {config.skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`skill-${skill.name}`}
                        checked={skill.enabled}
                        onChange={() => toggleSkill(skill.name)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label
                        htmlFor={`skill-${skill.name}`}
                        className="ml-3 text-sm font-medium text-gray-900 cursor-pointer"
                      >
                        {SKILL_NAMES[skill.name] || skill.name}
                      </label>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs rounded-full ${
                        skill.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {skill.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 工具管理 */}
            {activeTab === 'tools' && (
              <div className="space-y-4">
                {config.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center flex-1">
                      <input
                        type="checkbox"
                        id={`tool-${tool.name}`}
                        checked={tool.enabled}
                        onChange={() => toggleTool(tool.name)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label
                        htmlFor={`tool-${tool.name}`}
                        className="ml-3 text-sm font-medium text-gray-900 cursor-pointer"
                      >
                        {TOOL_NAMES[tool.name] || tool.name}
                      </label>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center">
                        <span className="text-xs text-gray-500 mr-2">层级:</span>
                        <select
                          value={tool.layer}
                          onChange={(e) => updateToolLayer(tool.name, parseInt(e.target.value) as 1 | 2)}
                          disabled={!tool.enabled}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                        >
                          <option value={1}>基础 (Layer 1)</option>
                          <option value={2}>高级 (Layer 2)</option>
                        </select>
                      </div>

                      <span
                        className={`px-3 py-1 text-xs rounded-full ${
                          tool.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {tool.enabled ? '已启用' : '已禁用'}
                      </span>

                      {tool.layer === 2 && tool.enabled && (
                        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                          需要审批
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 系统提示词 */}
            {activeTab === 'prompt' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    系统提示词
                  </label>
                  <textarea
                    value={config.system_prompt}
                    onChange={(e) =>
                      setConfig({ ...config, system_prompt: e.target.value })
                    }
                    rows={12}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="输入系统提示词..."
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {config.system_prompt.length} / 10000 字符
                    </p>
                    {config.system_prompt.length < 10 && (
                      <p className="text-xs text-red-600">至少需要 10 个字符</p>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">提示词建议</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• 明确指定助手的角色和职责</li>
                    <li>• 说明助手的能力和限制</li>
                    <li>• 定义回复的风格和语调</li>
                    <li>• 添加安全和使用指南</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 使用限制 */}
            {activeTab === 'limits' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    每日消息限制
                  </label>
                  <input
                    type="number"
                    min="-1"
                    value={config.limits.max_messages_per_day}
                    onChange={(e) => updateLimit('max_messages_per_day', parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">-1 表示无限制</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    最大存储空间 (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={config.limits.max_storage_mb}
                    onChange={(e) => updateLimit('max_storage_mb', parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {config.limits.max_users !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      最大用户数
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={config.limits.max_users}
                      onChange={(e) => updateLimit('max_users', parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      仅适用于团队版和企业版
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex items-center justify-between">
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={!hasChanges || saving}
              className="px-4 py-2 text-red-600 hover:text-red-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              重置为默认
            </button>

            <div className="flex items-center gap-4">
              <button
                onClick={handleCancel}
                disabled={!hasChanges || saving}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>

        {/* 变更提示 */}
        {hasChanges && (
          <div className="fixed bottom-4 right-4 px-4 py-2 bg-yellow-100 border border-yellow-300 rounded-lg shadow-lg">
            <p className="text-sm text-yellow-800">您有未保存的更改</p>
          </div>
        )}
      </div>

      {/* 重置确认对话框 */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">确认重置</h3>
              <p className="text-sm text-gray-600 mb-4">
                确定要重置为默认配置吗？所有自定义更改将丢失。
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                >
                  确认重置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
