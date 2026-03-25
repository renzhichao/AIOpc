/**
 * 创建实例页面
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';
import type { InstanceTemplate } from '../types/instance';

export default function InstanceCreatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: 'personal' as InstanceTemplate,
  });

  // Form validation
  const [errors, setErrors] = useState({
    name: '',
    template: '',
  });

  // Template options with detailed configuration
  const templates = [
    {
      id: 'personal' as InstanceTemplate,
      name: '个人体验版',
      description: '适合个人用户的基本配置',
      config: {
        messages: '100条/天',
        storage: '100MB',
        users: '1人',
        skills: ['通用对话', '网络搜索', '知识问答'],
        features: ['基础能力', '个人使用'],
      },
    },
    {
      id: 'team' as InstanceTemplate,
      name: '团队协作版',
      description: '适合小团队协作的增强配置',
      config: {
        messages: '500条/天',
        storage: '500MB',
        users: '最多10人',
        skills: ['通用对话', '网络搜索', '知识问答', '邮件处理'],
        features: ['进阶能力', '团队协作', '任务管理'],
      },
    },
    {
      id: 'enterprise' as InstanceTemplate,
      name: '企业版',
      description: '企业级完整配置',
      config: {
        messages: '无限',
        storage: '5GB',
        users: '最多50人',
        skills: ['全部技能', '包括代码助手', '数据分析'],
        features: ['全部能力', '系统集成', '自动化', '企业支持'],
      },
    },
  ];

  /**
   * Validate form
   */
  const validateForm = (): boolean => {
    const newErrors = {
      name: '',
      template: '',
    };

    let isValid = true;

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = '实例名称不能为空';
      isValid = false;
    } else if (formData.name.length < 2) {
      newErrors.name = '实例名称至少需要2个字符';
      isValid = false;
    } else if (formData.name.length > 100) {
      newErrors.name = '实例名称不能超过100个字符';
      isValid = false;
    }

    // Validate template
    if (!formData.template) {
      newErrors.template = '请选择实例模板';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      await instanceService.createInstance({
        template: formData.template,
        config: {
          name: formData.name.trim(),
          description: formData.description.trim(),
        },
      });

      setSuccess(true);

      // Redirect to instances list after successful creation
      setTimeout(() => {
        navigate('/instances');
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建实例失败';
      setError(message);
      console.error('创建实例失败:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    navigate('/instances');
  };

  /**
   * Handle input change
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="create-instance-container">
      {/* 头部 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="create-instance-title">创建新实例</h1>
          <p className="mt-1 text-sm text-gray-600">
            配置并创建您的 OpenClaw 智能体实例
          </p>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-2xl">
          {/* 错误提示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" data-testid="error-message">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" data-testid="success-message">
              <p className="text-sm text-green-600">实例创建成功！正在跳转...</p>
            </div>
          )}

          {/* 创建表单 */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <form onSubmit={handleSubmit} data-testid="create-instance-form">
              {/* 实例名称 */}
              <div className="mb-6">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  实例名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="例如：我的工作助手"
                  disabled={loading}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  data-testid="instance-name-input"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600" data-testid="name-error">{errors.name}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  {formData.name.length} / 100 字符
                </p>
              </div>

              {/* 实例描述 */}
              <div className="mb-6">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  实例描述（可选）
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="简要描述此实例的用途..."
                  rows={3}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  data-testid="instance-description-input"
                />
              </div>

              {/* 模板选择 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择模板 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3" data-testid="template-selection">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        formData.template === template.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="template"
                        value={template.id}
                        checked={formData.template === template.id}
                        onChange={handleChange}
                        disabled={loading}
                        className="mt-1 mr-3"
                        data-testid={`template-${template.id}`}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{template.name}</div>
                        <div className="text-sm text-gray-600 mb-2">{template.description}</div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                          <div>💬 {template.config.messages}</div>
                          <div>💾 {template.config.storage}</div>
                          <div>👥 {template.config.users}</div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {errors.template && (
                  <p className="mt-1 text-sm text-red-600" data-testid="template-error">{errors.template}</p>
                )}
              </div>

              {/* 配置预览 */}
              {formData.template && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200" data-testid="config-preview">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    配置预览 - {templates.find(t => t.id === formData.template)?.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 mb-1">消息限制</div>
                      <div className="font-medium text-gray-900">
                        {templates.find(t => t.id === formData.template)?.config.messages}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">存储空间</div>
                      <div className="font-medium text-gray-900">
                        {templates.find(t => t.id === formData.template)?.config.storage}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">用户数量</div>
                      <div className="font-medium text-gray-900">
                        {templates.find(t => t.id === formData.template)?.config.users}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">启用技能</div>
                      <div className="font-medium text-gray-900">
                        {templates.find(t => t.id === formData.template)?.config.skills.join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-gray-600 mb-1 text-sm">特性</div>
                    <div className="flex flex-wrap gap-2">
                      {templates.find(t => t.id === formData.template)?.config.features.map((feature, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors duration-200"
                  data-testid="submit-button"
                >
                  {loading ? '创建中...' : '创建实例'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="py-3 px-6 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors duration-200"
                  data-testid="cancel-button"
                >
                  取消
                </button>
              </div>

              {/* 加载状态 */}
              {loading && (
                <div className="mt-4 flex items-center justify-center" data-testid="loading-state">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                  <span className="text-sm text-gray-600">正在创建实例...</span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
