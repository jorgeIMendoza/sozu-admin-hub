import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { activityLoggerService } from '@/services/activityLoggerService';

interface UserProfile {
  email: string;
  nombre: string;
  rol_id: number;
  rol_nombre: string;
  debe_cambiar_password: boolean;
  id_persona: number | null;
  activo: boolean;
  ver_todos_prospectos_compradores: boolean;
  ver_filtros_avanzados_eliminados: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_current_user_profile');
      
      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
        return;
      }
      
      if (data && data.length > 0) {
        setProfile(data[0] as UserProfile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let profileFetchPromise: Promise<void> | null = null;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile fetch to avoid Supabase deadlock
          profileFetchPromise = fetchProfile().finally(() => {
            if (isMounted) {
              setIsLoading(false);
            }
          });
        } else {
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile().finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        // Registrar intento fallido
        activityLoggerService.registrarInicioSesion(email, 'error', error.message);
        return { error };
      }
      
      // Registrar inicio de sesión exitoso
      activityLoggerService.registrarInicioSesion(email, 'exito');
      return { error: null };
    } catch (err) {
      activityLoggerService.registrarInicioSesion(email, 'error', (err as Error).message);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    const userEmail = profile?.email || user?.email || 'desconocido';
    activityLoggerService.registrarCierreSesion(userEmail);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (error) {
        return { error };
      }
      
      // Mark password as changed in usuarios table
      await supabase.rpc('mark_password_changed');
      
      // Refresh profile to get updated debe_cambiar_password
      await fetchProfile();
      
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const refreshProfile = async () => {
    await fetchProfile();
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    isLoading,
    mustChangePassword: profile?.debe_cambiar_password ?? false,
    signIn,
    signOut,
    updatePassword,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
