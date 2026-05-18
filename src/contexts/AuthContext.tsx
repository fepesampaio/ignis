import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'professor' | 'aluno' | 'polo';

interface AccessStatus {
  hasAccess: boolean;
  blocked: boolean;
  reason?: string;
  contractStatus?: string;
  paymentStatus?: string;
  overduePayments?: Array<{
    id: string;
    asaas_payment_id: string;
    amount: number;
    dueDate: string;
    courseName?: string;
    installment: number;
    totalInstallments: number;
  }>;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  isRecoveryMode: boolean;
  accessStatus: AccessStatus | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkAccess: () => Promise<AccessStatus | null>;
  signInWithBiometrics: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const recoveryStorageKey = 'auth-recovery-mode';

  const detectRecoveryModeFromUrl = () => {
    if (typeof window === 'undefined') return false;

    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    return (
      params.get('type') === 'recovery' ||
      (params.has('access_token') && params.get('type') === 'recovery')
    );
  };

  const persistRecoveryMode = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    if (enabled) {
      window.sessionStorage.setItem(recoveryStorageKey, 'true');
    } else {
      window.sessionStorage.removeItem(recoveryStorageKey);
    }
  };

  const getPersistedRecoveryMode = () => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(recoveryStorageKey) === 'true';
  };

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching role:', error);
        return null;
      }

      return data?.role as AppRole;
    } catch (error) {
      console.error('Error fetching role:', error);
      return null;
    }
  };

  const syncAuthState = async (event: string | null, nextSession: Session | null) => {
    setLoading(true);
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    const recoveryMode =
      event === 'PASSWORD_RECOVERY' ||
      detectRecoveryModeFromUrl() ||
      getPersistedRecoveryMode();

    setIsRecoveryMode(recoveryMode);
    persistRecoveryMode(recoveryMode);

    if (nextSession?.user) {
      const nextRole = await fetchUserRole(nextSession.user.id);
      setRole(nextRole);
    } else {
      setRole(null);
      setAccessStatus(null);
    }

    setLoading(false);
  };

  const checkAccess = async (): Promise<AccessStatus | null> => {
    if (!session) return null;

    try {
      const response = await supabase.functions.invoke('check-student-access');
      
      if (response.error) {
        console.error('Error checking access:', response.error);
        return null;
      }

      const status = response.data as AccessStatus;
      setAccessStatus(status);
      return status;
    } catch (error) {
      console.error('Error in checkAccess:', error);
      return null;
    }
  };

  useEffect(() => {
    if (detectRecoveryModeFromUrl()) {
      persistRecoveryMode(true);
      setIsRecoveryMode(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        void syncAuthState(event, session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncAuthState(null, session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (role === 'aluno' && session) {
      checkAccess();
    }
  }, [role, session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signInWithBiometrics = async () => {
    try {
      const { getBiometricCredentials, verifyBiometricIdentity } = await import('@/lib/nativeAuth');
      await verifyBiometricIdentity();
      const credentials = await getBiometricCredentials();

      const { error } = await supabase.auth.signInWithPassword({
        email: credentials.username,
        password: credentials.password,
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const requestPasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/auth`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error as Error | null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setIsRecoveryMode(false);
      persistRecoveryMode(false);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsRecoveryMode(false);
    persistRecoveryMode(false);
    setAccessStatus(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        loading,
        isRecoveryMode,
        accessStatus,
        signIn,
        signUp,
        requestPasswordReset,
        updatePassword,
        signOut,
        checkAccess,
        signInWithBiometrics,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
