import React, { createContext, useContext } from 'react';
import { useAuth as useAuthHook } from '../hooks/useAuth';
import type { AuthState } from '../hooks/useAuth';

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthHook();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(options: { requireAuth?: boolean } = {}) {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const { requireAuth = false } = options;
  
  if (requireAuth && !context.user && !context.loading) {
    // If auth is required and user is not authenticated, redirect to login
    window.location.href = '/login';
    return { ...context, loading: true };
  }

  return context;
} 