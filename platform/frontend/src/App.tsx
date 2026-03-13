/**
 * 应用入口 - 配置路由和全局状态
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './pages/components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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

          {/* 404 页面 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
