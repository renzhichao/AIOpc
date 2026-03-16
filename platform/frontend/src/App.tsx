/**
 * 应用入口 - 配置路由和全局状态
 *
 * TESTING MODE: Uses HashRouter during E2E tests to avoid React hydration issues.
 * Set USE_HASH_ROUTER=true in .env.test or via environment variable to enable.
 */

import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './pages/components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import InstanceListPage from './pages/InstanceListPage';
import InstanceDetailPage from './pages/InstanceDetailPage';
import InstanceCreatePage from './pages/InstanceCreatePage';
import InstanceConfigPage from './pages/InstanceConfigPage';
import NotFoundPage from './pages/NotFoundPage';
import { ChatRoom } from './components/ChatRoom';

// Use HashRouter for E2E testing to avoid React hydration issues
// Set environment variable USE_HASH_ROUTER=true to enable
const useHashRouter = import.meta.env.USE_HASH_ROUTER === 'true';

const Router = useHashRouter ? HashRouter : BrowserRouter;

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* 根路径重定向到登录页 */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* 登录页 */}
          <Route path="/login" element={<LoginPage />} />

          {/* OAuth 回调页 */}
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          {/* 受保护的路由 */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* 实例管理 */}
          <Route
            path="/instances"
            element={
              <ProtectedRoute>
                <InstanceListPage />
              </ProtectedRoute>
            }
          />

          {/* 实例详情 */}
          <Route
            path="/instances/:id"
            element={
              <ProtectedRoute>
                <InstanceDetailPage />
              </ProtectedRoute>
            }
          />

          {/* 创建实例 */}
          <Route
            path="/instances/create"
            element={
              <ProtectedRoute>
                <InstanceCreatePage />
              </ProtectedRoute>
            }
          />

          {/* 实例配置 */}
          <Route
            path="/instances/:id/config"
            element={
              <ProtectedRoute>
                <InstanceConfigPage />
              </ProtectedRoute>
            }
          />

          {/* 聊天室 */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatRoom />
              </ProtectedRoute>
            }
          />

          {/* 404 页面 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
