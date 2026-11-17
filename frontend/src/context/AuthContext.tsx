import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  cognitoGetCurrentSessionToken,
  cognitoSignIn,
  cognitoSignOut,
  isCognitoConfigured,
} from '../services/cognitoAuth';
import {
  isInteractiveDemoMode,
  resetInteractiveDemoStore,
  setInteractiveDemoMode,
} from '../services/demoDataService';
import { api } from '../services/api';
import { UserProfile } from '../types';

interface AuthContextValue {
  isAuthenticated: boolean;
  isDemoMode: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  enterDemoMode: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(isInteractiveDemoMode());
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      if (isInteractiveDemoMode()) {
        const res = await api.getProfile();
        setProfile(res.profile);
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setError(null);
        return;
      }

      const token = await cognitoGetCurrentSessionToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setProfile(null);
        return;
      }
      const res = await api.getProfile();
      setProfile(res.profile);
      setIsAuthenticated(true);
      setIsDemoMode(false);
      setError(null);
    } catch (err) {
      setIsAuthenticated(false);
      setProfile(null);
      setError(err instanceof Error ? err.message : 'Session check failed');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (isInteractiveDemoMode()) {
        await refreshProfile();
        if (mounted) setIsLoading(false);
        return;
      }
      if (!isCognitoConfigured()) {
        if (mounted) setIsLoading(false);
        return;
      }
      await refreshProfile();
      if (mounted) setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshProfile]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    setInteractiveDemoMode(false);
    setIsDemoMode(false);
    await cognitoSignIn(email, password);
    await refreshProfile();
  };

  const enterDemoMode = async () => {
    setError(null);
    setInteractiveDemoMode(true);
    setIsDemoMode(true);
    await refreshProfile();
  };

  const resetDemoData = async () => {
    resetInteractiveDemoStore();
    await refreshProfile();
  };

  const signOut = () => {
    setInteractiveDemoMode(false);
    setIsDemoMode(false);
    cognitoSignOut();
    setIsAuthenticated(false);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isDemoMode,
        isLoading,
        profile,
        error,
        signIn,
        enterDemoMode,
        resetDemoData,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
