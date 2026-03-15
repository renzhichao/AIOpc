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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  /**
   * 初始化认证状态
   */
  useEffect(() => {
    const initAuth = () => {
      const token = storage.getToken();
      const user = storage.getUser();

      if (token && user) {
        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState({
          ...initialState,
          isLoading: false,
        });
      }
    };

    initAuth();
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
