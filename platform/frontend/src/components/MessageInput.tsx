/**
 * MessageInput Component
 *
 * Input area for sending chat messages with keyboard shortcuts.
 * This is a simplified version that will be enhanced in TASK-013.
 */

import React, { useState, KeyboardEvent, ChangeEvent, FormEvent } from 'react';

export interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');

  /**
   * Handle input change
   */
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  /**
   * Handle keyboard shortcuts
   * - Enter: Send message
   * - Shift+Enter: New line
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle send button click
   */
  const handleSend = () => {
    const trimmedValue = inputValue.trim();

    if (trimmedValue && !disabled) {
      onSend(trimmedValue);
      setInputValue('');
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const isSendDisabled = disabled || !inputValue.trim();

  return (
    <div
      className={`
        border-t border-gray-200 bg-white p-4
        ${className}
      `}
      data-testid="message-input"
    >
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              className={`
                w-full px-4 py-3 pr-4
                border border-gray-300 rounded-lg
                resize-none overflow-hidden
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                disabled:bg-gray-100 disabled:cursor-not-allowed
                transition-all
                ${disabled ? 'opacity-50' : ''}
              `}
              style={{ minHeight: '48px', maxHeight: '200px' }}
              aria-label="消息输入框"
              aria-disabled={disabled}
            />
          </div>

          <button
            type="submit"
            disabled={isSendDisabled}
            className={`
              px-6 py-3 rounded-lg font-medium
              transition-all
              ${
                isSendDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
              }
            `}
            aria-label="发送消息"
            aria-disabled={isSendDisabled}
          >
            发送
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-400 text-center">
          按 Enter 发送，Shift + Enter 换行
        </div>
      </form>
    </div>
  );
};

export default MessageInput;
