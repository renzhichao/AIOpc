/**
 * 使用 Auth Context 的 Hook
 */

import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from '../types/auth';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }

  return context;
}
