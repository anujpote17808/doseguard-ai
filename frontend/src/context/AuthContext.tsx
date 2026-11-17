import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  cognitoGetCurrentSessionToken,
  cognitoSignIn,
  cognitoSignOut,
  isCognitoConfigured,
} from '../services/cognitoAuth';
import { api } from '../services/api';
import { UserProfile } from '../types';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const token = await cognitoGetCurrentSessionToken();
      if (!token) {
        setIsAuthenticated(false);
        setProfile(null);
        return;
      }
      const res = await api.getProfile();
      setProfile(res.profile);
      setIsAuthenticated(true);
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
    await cognitoSignIn(email, password);
    await refreshProfile();
  };

  const signOut = () => {
    cognitoSignOut();
    setIsAuthenticated(false);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        profile,
        error,
        signIn,
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

