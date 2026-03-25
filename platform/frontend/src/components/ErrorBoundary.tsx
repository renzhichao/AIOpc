/**
 * ErrorBoundary Component
 *
 * Catches catastrophic React errors and displays a fallback UI
 * instead of showing a blank white screen.
 *
 * This is critical for file upload debugging in Feishu WebView environment.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Class Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    // Note: Error is logged in componentDidCatch instead
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to the console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Store error info for debugging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__LAST_ERROR__ = {
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    };

    // Also store in upload debug logs if available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__UPLOAD_DEBUG__) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__UPLOAD_DEBUG__.push({
        time: new Date().toISOString(),
        level: 'error',
        message: 'React Error Boundary caught error',
        data: {
          error: error.toString(),
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        },
      });
    }

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex items-center justify-center p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">界面出错</h3>
                <p className="text-sm text-red-600">发生了一个意外错误</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-red-700 mb-2">
                {this.state.error?.message || '未知错误'}
              </p>
              {this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                    查看错误详情
                  </summary>
                  <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {'\n\n'}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
              >
                刷新页面
              </button>
            </div>

            <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              <p className="font-semibold mb-1">调试信息已保存</p>
              <p className="text-gray-600">
                错误详情已保存到 <code className="bg-yellow-100 px-1 rounded">window.__LAST_ERROR__</code>
              </p>
              <p className="text-gray-600">
                上传调试日志: <code className="bg-yellow-100 px-1 rounded">window.__UPLOAD_DEBUG__</code>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
