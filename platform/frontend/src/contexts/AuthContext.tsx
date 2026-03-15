/**
 * 认证 Context - 提供全局认证状态和方法
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { AuthContextValue, User, AuthState } from '../types/auth';
import { authService } from '../services/auth';
import { storage } from '../utils/storage';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

/**
 * Helper function to check auth state synchronously from localStorage
 * This allows AuthContext to initialize immediately without loading state
 */
function getInitialAuthState(): AuthState {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };
  }

  // Try to get from storage utility first
  let token = storage.getToken();
  let user = storage.getUser();

  // For E2E tests: also check for test-specific keys
  if (!token) {
    try {
      token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    } catch (e) {
      // localStorage might not be available
      token = null;
    }
  }
  if (!user) {
    try {
      const userStr = localStorage.getItem('auth_user');
      if (userStr) {
        user = JSON.parse(userStr);
      }
    } catch (e) {
      user = null;
    }
  }

  // If we have both token and user, initialize as authenticated immediately
  // This prevents the loading state from blocking ProtectedRoute
  if (token && user) {
    return {
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };
  }

  // Otherwise, start with loading false and unauthenticated
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize state synchronously from localStorage to avoid loading state
  const [state, setState] = useState<AuthState>(getInitialAuthState);

  /**
   * Validate and update authentication state (currently no-op since we init synchronously)
   * This runs after initial render to validate tokens if needed in the future
   */
  useEffect(() => {
    // Since we initialize synchronously from localStorage, this is now a no-op
    // In the future, we could add token validation logic here
    return () => {};
  }, []);

  /**
   * 登录
   */
  const login = useCallback((token: string, user: User) => {
    storage.setToken(token);
    storage.setUser(user);

    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  }, []);

  /**
   * 登出
   */
  const logout = useCallback(() => {
    storage.clearAuth();

    // Also clear test-specific keys for E2E tests
    localStorage.removeItem('auth_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user_id');
    localStorage.removeItem('auth_timestamp');

    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  /**
   * 刷新 Token
   */
  const refreshToken = useCallback(async () => {
    const refreshTokenValue = storage.getRefreshToken();

    if (!refreshTokenValue) {
      logout();
      throw new Error('未找到刷新 Token');
    }

    try {
      const { access_token } = await authService.refreshToken(refreshTokenValue);
      storage.setToken(access_token);

      setState((prevState) => ({
        ...prevState,
        token: access_token,
      }));
    } catch (error) {
      logout();
      throw error;
    }
  }, [logout]);

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setState((prevState) => ({
      ...prevState,
      error: null,
    }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshToken,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 认证 Context Hook
 * 用于在组件中访问认证状态和方法
 */
export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
