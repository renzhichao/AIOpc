/**
 * MessageInput Component
 *
 * Input area for sending chat messages with file upload support.
 * Features:
 * - Message input with keyboard shortcuts
 * - File upload via button or drag-and-drop
 * - File preview with removal option
 * - Upload progress indication
 */

import { useState, useRef, type KeyboardEvent, type ChangeEvent, type FormEvent } from 'react';

/**
 * Uploaded file info
 */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  preview?: string;
}

export interface MessageInputProps {
  onSend: (content: string, files?: UploadedFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

// Format file size for display
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// Check if file is an image
const isImage = (type: string): boolean => type.startsWith('image/');

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Get API URL from environment
   */
  const getApiUrl = (): string => {
    return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api';
  };

  /**
   * Get auth token
   */
  const getToken = (): string | null => {
    return (
      sessionStorage.getItem('auth_token') ||
      sessionStorage.getItem('access_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('access_token')
    );
  };

  /**
   * Upload file to backend
   */
  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const apiUrl = getApiUrl();
    const token = getToken();

    if (!token) {
      throw new Error('No authentication token found');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${apiUrl}/chat/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload file');
    }

    const result = await response.json();

    if (!result.success || !result.file) {
      throw new Error('Upload failed');
    }

    return result.file as UploadedFile;
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = async (files: FileList) => {
    if (isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileArray = Array.from(files);
      const totalFiles = fileArray.length;
      const uploadedFiles: UploadedFile[] = [];

      for (let i = 0; i < totalFiles; i++) {
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        const uploaded = await uploadFile(fileArray[i]);
        uploadedFiles.push(uploaded);
      }

      setSelectedFiles(prev => [...prev, ...uploadedFiles]);
      setUploadProgress(100);
    } catch (error) {
      console.error('File upload failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /**
   * Handle file input change
   */
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Handle drag over
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  /**
   * Handle drag leave
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Handle drop
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  /**
   * Remove file from selection
   */
  const handleRemoveFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  };

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

    if ((trimmedValue || selectedFiles.length > 0) && !disabled && !isUploading) {
      onSend(trimmedValue, selectedFiles.length > 0 ? selectedFiles : undefined);
      setInputValue('');
      setSelectedFiles([]);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const isSendDisabled = disabled || (!inputValue.trim() && selectedFiles.length === 0) || isUploading;

  return (
    <div
      className={`
        border-t border-gray-200 bg-white p-4
        ${className}
      `}
      data-testid="message-input"
    >
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        {/* File previews */}
        {selectedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200"
              >
                {isImage(file.type) && file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-200 rounded">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.id)}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>上传中... {uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div
          className={`flex items-end gap-3 ${isDragging ? 'ring-2 ring-green-500 rounded-lg' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
            multiple
            accept="image/*,.pdf,.txt,.csv,.json,.md,.xls,.xlsx,.xml"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className={`
              p-3 rounded-lg border-2 border-dashed transition-all
              ${disabled || isUploading
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-500'
              }
            `}
            aria-label="上传文件"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isUploading}
              placeholder={selectedFiles.length > 0 ? '输入消息（可选）...' : placeholder}
              rows={1}
              className={`
                w-full px-4 py-3 pr-4
                border border-gray-300 rounded-lg
                resize-none overflow-hidden
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                disabled:bg-gray-100 disabled:cursor-not-allowed
                transition-all
                ${disabled || isUploading ? 'opacity-50' : ''}
              `}
              style={{ minHeight: '48px', maxHeight: '200px' }}
              aria-label="消息输入框"
              aria-disabled={disabled || isUploading}
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
            {isUploading ? '上传中' : '发送'}
          </button>
        </div>

        <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
          <span>按 Enter 发送，Shift + Enter 换行</span>
          <span>{isDragging ? '释放以上传文件' : '拖拽文件到此处或点击附件按钮'}</span>
        </div>
      </form>
    </div>
  );
};

export default MessageInput;
