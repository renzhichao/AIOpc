/**
 * MessageInput Component
 *
 * Input area for sending chat messages with file upload support.
 * Features:
 * - Message input with keyboard shortcuts
 * - File upload via button or drag-and-drop
 * - File preview with removal option
 * - Upload progress indication
 * - Comprehensive debugging for Feishu WebView
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

/**
 * Debug log entry
 */
interface DebugLog {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

/**
 * Initialize global debug storage for Feishu WebView
 */
const initDebugStorage = () => {
  if (!(window as any).__UPLOAD_DEBUG__) {
    (window as any).__UPLOAD_DEBUG__ = [] as DebugLog[];
  }
  return (window as any).__UPLOAD_DEBUG__ as DebugLog[];
};

/**
 * Add debug log
 */
const addDebugLog = (level: DebugLog['level'], message: string, data?: any) => {
  const logs = initDebugStorage();
  const log: DebugLog = {
    time: new Date().toISOString(),
    level,
    message,
    data,
  };
  logs.push(log);
  console.log(`[UploadDebug ${level.toUpperCase()}]`, message, data || '');

  // Keep only last 100 logs
  if (logs.length > 100) {
    logs.shift();
  }
};

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadButtonClickCount = useRef(0);
  const uploadButtonClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize debug on mount
  useState(() => {
    addDebugLog('info', 'MessageInput component mounted');
    addDebugLog('info', 'User Agent', navigator.userAgent);
  });

  /**
   * Get API URL from environment
   */
  const getApiUrl = (): string => {
    const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api';
    addDebugLog('info', 'API URL configured', { apiUrl });
    return apiUrl;
  };

  /**
   * Get auth token
   */
  const getToken = (): string | null => {
    const token =
      sessionStorage.getItem('auth_token') ||
      sessionStorage.getItem('access_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('access_token');

    if (token) {
      addDebugLog('info', 'Token found', {
        length: token.length,
        prefix: token.substring(0, 20) + '...',
      });
    } else {
      addDebugLog('error', 'No auth token found');
    }

    return token;
  };

  /**
   * Upload file to backend with comprehensive debugging
   */
  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const startTime = Date.now();
    const apiUrl = getApiUrl();
    const token = getToken();

    addDebugLog('info', 'Starting file upload', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      apiUrl: `${apiUrl}/chat/upload`,
    });

    try {
      // Validate token
      if (!token) {
        const error = 'No authentication token found';
        addDebugLog('error', error);
        throw new Error(error);
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      addDebugLog('info', 'FormData prepared', {
        hasFile: formData.has('file'),
        fileName: formData.get('file') instanceof File ? (formData.get('file') as File).name : 'unknown',
      });

      // Prepare fetch request
      const uploadUrl = `${apiUrl}/chat/upload`;
      addDebugLog('info', 'Initiating fetch request', { url: uploadUrl });

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Note: Don't set Content-Type for FormData - let browser set it with boundary
        },
        body: formData,
      });

      const elapsed = Date.now() - startTime;
      addDebugLog('info', `Response received (${elapsed}ms)`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      // Check response status
      if (!response.ok) {
        // Try to parse error response
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: response.statusText };
        }

        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        addDebugLog('error', 'Upload request failed', {
          status: response.status,
          errorData,
        });
        throw new Error(errorMessage);
      }

      // Parse success response
      const result = await response.json();
      addDebugLog('info', 'Response body parsed', { result });

      // Validate response structure
      if (!result.success) {
        const error = result.error || 'Upload failed';
        addDebugLog('error', 'Upload unsuccessful', { result });
        throw new Error(error);
      }

      if (!result.file) {
        addDebugLog('error', 'No file data in response', { result });
        throw new Error('Invalid response: missing file data');
      }

      const uploadTime = Date.now() - startTime;
      addDebugLog('success', `File uploaded successfully in ${uploadTime}ms`, {
        fileId: result.file.id,
        fileName: result.file.name,
      });

      return result.file as UploadedFile;
    } catch (error) {
      const uploadTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      addDebugLog('error', `Upload failed after ${uploadTime}ms`, {
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  };

  /**
   * Handle file selection with error recovery
   */
  const handleFileSelect = async (files: FileList) => {
    if (isUploading) {
      addDebugLog('warn', 'Upload already in progress, ignoring new selection');
      return;
    }

    addDebugLog('info', 'File selection started', {
      fileCount: files.length,
      fileNames: Array.from(files).map(f => f.name),
    });

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const fileArray = Array.from(files);
      const totalFiles = fileArray.length;
      const uploadedFiles: UploadedFile[] = [];

      addDebugLog('info', 'Starting batch upload', { totalFiles });

      for (let i = 0; i < totalFiles; i++) {
        const file = fileArray[i];
        const progress = Math.round(((i + 1) / totalFiles) * 100);
        setUploadProgress(progress);

        addDebugLog('info', `Uploading file ${i + 1}/${totalFiles}`, {
          fileName: file.name,
          progress: `${progress}%`,
        });

        try {
          const uploaded = await uploadFile(file);
          uploadedFiles.push(uploaded);
          addDebugLog('success', `File ${i + 1}/${totalFiles} uploaded successfully`);
        } catch (error) {
          // Continue with remaining files even if one fails
          addDebugLog('error', `File ${i + 1}/${totalFiles} failed, continuing with remaining files`, {
            fileName: file.name,
            error: error instanceof Error ? error.message : String(error),
          });
          // Show error but don't stop the batch
          setUploadError(`文件 "${file.name}" 上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }

      if (uploadedFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...uploadedFiles]);
        addDebugLog('success', `Batch upload completed: ${uploadedFiles.length}/${totalFiles} files succeeded`);
      } else {
        addDebugLog('error', 'All files failed to upload');
        throw new Error('所有文件上传失败，请重试');
      }

      setUploadProgress(100);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
      addDebugLog('error', 'File selection handler error', {
        error: errorMessage,
      });

      // Show user-friendly error
      setUploadError(errorMessage);

      // Auto-clear error after 5 seconds
      setTimeout(() => setUploadError(null), 5000);
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

  /**
   * Handle upload button click (with debug toggle on 5 clicks)
   */
  const handleUploadButtonClick = () => {
    uploadButtonClickCount.current += 1;

    // Clear existing timer
    if (uploadButtonClickTimer.current) {
      clearTimeout(uploadButtonClickTimer.current);
    }

    // Set new timer to reset click count after 2 seconds
    uploadButtonClickTimer.current = setTimeout(() => {
      uploadButtonClickCount.current = 0;
    }, 2000);

    // Toggle debug panel after 5 clicks
    if (uploadButtonClickCount.current === 5) {
      setShowDebug(prev => !prev);
      uploadButtonClickCount.current = 0;
      addDebugLog('info', 'Debug panel toggled via 5 clicks');
    }

    // Trigger file input
    fileInputRef.current?.click();
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

        {/* Upload error message */}
        {uploadError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-800">{uploadError}</p>
                <p className="text-xs text-red-600 mt-1">部分文件可能上传失败，您可以重试或继续发送已上传的文件</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="p-1 hover:bg-red-100 rounded transition-colors"
                aria-label="关闭错误提示"
              >
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Debug panel (shown via URL parameter ?upload_debug=true or click 5 times on upload button) */}
        {(showDebug || new URLSearchParams(window.location.search).get('upload_debug') === 'true') && (
          <div className="mb-3 p-3 bg-gray-900 rounded-lg text-xs font-mono">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-400 font-bold">🔍 文件上传调试信息</span>
              <button
                type="button"
                onClick={() => {
                  const logs = initDebugStorage();
                  const debugText = logs.map(log =>
                    `[${log.time}] [${log.level.toUpperCase()}] ${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`
                  ).join('\n');
                  navigator.clipboard.writeText(debugText).then(() => {
                    alert('调试日志已复制到剪贴板');
                  }).catch(() => {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = debugText;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('调试日志已复制到剪贴板');
                  });
                }}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
              >
                📋 复制日志
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto text-green-300 space-y-1">
              {initDebugStorage().length === 0 ? (
                <div className="text-gray-500">等待上传操作...</div>
              ) : (
                initDebugStorage().map((log, index) => (
                  <div key={index} className={`${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-yellow-400' :
                    log.level === 'success' ? 'text-green-400' :
                    'text-gray-300'
                  }`}>
                    <span className="text-gray-500">[{log.time}]</span>
                    <span className="font-bold">[{log.level.toUpperCase()}]</span>
                    {log.message}
                    {log.data && <pre className="ml-4 text-gray-400 overflow-x-auto">{JSON.stringify(log.data, null, 2)}</pre>}
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 text-gray-500 text-xs">
              提示: 在控制台输入 <code className="bg-gray-800 px-1 rounded">window.__UPLOAD_DEBUG__</code> 查看完整日志
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
            onClick={handleUploadButtonClick}
            disabled={disabled || isUploading}
            className={`
              p-3 rounded-lg border-2 border-dashed transition-all
              ${disabled || isUploading
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-500'
              }
            `}
            aria-label="上传文件"
            title="点击5次可切换调试面板"
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
