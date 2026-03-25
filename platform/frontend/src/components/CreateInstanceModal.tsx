/**
 * 创建实例模态框组件
 */

import React, { useState } from 'react';
import type { InstanceTemplate } from '../types/instance';

interface CreateInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    template: InstanceTemplate;
    config: {
      name?: string;
      description?: string;
    };
  }) => Promise<void>;
  loading?: boolean;
}

interface TemplateInfo {
  id: InstanceTemplate;
  name: string;
  description: string;
  icon: string;
  features: string[];
}

export default function CreateInstanceModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}: CreateInstanceModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<InstanceTemplate | null>(null);
  const [instanceName, setInstanceName] = useState('');
  const [instanceDescription, setInstanceDescription] = useState('');
  const [error, setError] = useState('');

  const templates: TemplateInfo[] = [
    {
      id: 'personal',
      name: '个人版',
      description: '适合个人使用，基础功能完整',
      icon: '👤',
      features: ['单用户', '基础 AI 功能', '本地存储', '社区支持'],
    },
    {
      id: 'team',
      name: '团队版',
      description: '适合小团队协作，支持多用户',
      icon: '👥',
      features: ['最多 10 用户', '协作功能', '共享知识库', '邮件支持'],
    },
    {
      id: 'enterprise',
      name: '企业版',
      description: '适合企业大规模部署，功能完整',
      icon: '🏢',
      features: ['不限用户', '高级功能', '私有部署', '专属支持'],
    },
  ];

  /**
   * 重置表单
   */
  const resetForm = () => {
    setSelectedTemplate(null);
    setInstanceName('');
    setInstanceDescription('');
    setError('');
  };

  /**
   * 关闭模态框
   */
  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  /**
   * 提交表单
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate) {
      setError('请选择实例模板');
      return;
    }

    if (!instanceName.trim()) {
      setError('请输入实例名称');
      return;
    }

    try {
      setError('');
      await onSubmit({
        template: selectedTemplate,
        config: {
          name: instanceName.trim(),
          description: instanceDescription.trim() || undefined,
        },
      });
      resetForm();
    } catch {
      const message = err instanceof Error ? err.message : '创建实例失败';
      setError(message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">创建新实例</h2>
            <button
              onClick={handleClose}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 disabled:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容 */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* 错误提示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* 模板选择 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              选择模板 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template.id)}
                  disabled={loading}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                    selectedTemplate === template.id
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="text-3xl mb-2">{template.icon}</div>
                  <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                  <p className="text-xs text-gray-600 mb-3">{template.description}</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {template.features.map((feature, index) => (
                      <li key={index} className="flex items-center">
                        <span className="mr-1">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* 实例名称 */}
          <div className="mb-6">
            <label htmlFor="instanceName" className="block text-sm font-semibold text-gray-700 mb-2">
              实例名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="instanceName"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              disabled={loading}
              placeholder="例如：我的智能助手"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              maxLength={50}
            />
            <p className="mt-1 text-xs text-gray-500">最多 50 个字符</p>
          </div>

          {/* 实例描述 */}
          <div className="mb-6">
            <label htmlFor="instanceDescription" className="block text-sm font-semibold text-gray-700 mb-2">
              实例描述
            </label>
            <textarea
              id="instanceDescription"
              value={instanceDescription}
              onChange={(e) => setInstanceDescription(e.target.value)}
              disabled={loading}
              placeholder="描述一下这个实例的用途..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
              maxLength={200}
            />
            <p className="mt-1 text-xs text-gray-500">最多 200 个字符</p>
          </div>

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 rounded-lg transition-colors duration-200 font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !selectedTemplate}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition-colors duration-200 font-medium"
            >
              {loading ? '创建中...' : '创建实例'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
