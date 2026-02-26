import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { activityLoggerService } from "@/services/activityLoggerService";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";

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
  permissionVersion: number; // Incremented when permissions change
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  triggerPermissionRefresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inactivity timeout: 5 minutes
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [permissionVersion, setPermissionVersion] = useState(0);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      // Auto-mark email as confirmed if user can log in (Auth confirmed it)
      try {
        await supabase.rpc("mark_email_confirmed");
      } catch (e) {
        console.error("Error marking email confirmed:", e);
      }

      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timeout")), 15000)
      );
      const fetchPromise = supabase.rpc("get_current_user_profile");
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) {
        console.error("Error fetching profile:", error);
        setProfile(null);
        return;
      }

      if (data && data.length > 0) {
        setProfile(data[0] as UserProfile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("Error in fetchProfile:", err);
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  const triggerPermissionRefresh = useCallback(() => {
    setPermissionVersion((v) => v + 1);
  }, []);

  const handleForceLogout = useCallback(async () => {
    // Clean up realtime channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    // Force reload to ensure clean state
    window.location.href = "/auth/login";
  }, []);

  // Visibility change: refresh permissions when tab becomes visible (throttled 30s)
  const lastVisibilityRefreshRef = useRef<number>(0);
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user && profile) {
        const now = Date.now();
        if (now - lastVisibilityRefreshRef.current > 30000) {
          lastVisibilityRefreshRef.current = now;
          triggerPermissionRefresh();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, profile, triggerPermissionRefresh]);

  // Set up realtime subscriptions for permission changes
  useEffect(() => {
    if (!user || !profile) return;

    const userEmail = user.email;
    const rolId = profile.rol_id;

    // Clean up existing channel if any
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    // Create a single channel for all permission-related subscriptions
    const channel = supabase.channel("auth-permission-updates");

    // 1. Subscribe to user status changes (activo field)
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "usuarios",
        filter: `email=eq.${userEmail}`,
      },
      (payload) => {
        const newRecord = payload.new as { activo?: boolean; rol_id?: number };

        // If user was deactivated, force logout
        if (newRecord.activo === false) {
          console.log("User deactivated, forcing logout");
          handleForceLogout();
          return;
        }

        // If role changed, refresh profile and permissions
        if (newRecord.rol_id !== rolId) {
          console.log("User role changed, refreshing permissions");
          fetchProfile();
          triggerPermissionRefresh();
        }
      },
    );

    // 2. Subscribe to role permission changes (submenus_permisos)
    channel.on(
      "postgres_changes",
      {
        event: "*", // INSERT, UPDATE, DELETE
        schema: "public",
        table: "submenus_permisos",
        filter: `rol_id=eq.${rolId}`,
      },
      () => {
        console.log("Role permissions changed, refreshing");
        triggerPermissionRefresh();
      },
    );

    // 3. Subscribe to role configuration changes
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "roles",
        filter: `id=eq.${rolId}`,
      },
      () => {
        console.log("Role configuration changed, refreshing");
        fetchProfile();
        triggerPermissionRefresh();
      },
    );

    // 4. Subscribe to project access changes for this user
    if (userEmail) {
      channel.on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "proyectos_acceso",
          filter: `usuario_id=eq.${userEmail}`,
        },
        () => {
          console.log("Project access changed, refreshing");
          triggerPermissionRefresh();
        },
      );
    }

    // Subscribe to the channel
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Real-time permission subscriptions active");
      }
    });

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [user, profile?.rol_id, profile?.email, fetchProfile, triggerPermissionRefresh, handleForceLogout]);

  useEffect(() => {
    let isMounted = true;
    let profileFetchPromise: Promise<void> | null = null;
    let currentUserId: string | null = null;

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;

      // Si es solo un refresh de token y el usuario es el mismo, solo actualizar sesión
      // Esto evita re-cargar el perfil innecesariamente al cambiar de pestaña
      if (event === "TOKEN_REFRESHED" && currentUserId && newSession?.user?.id === currentUserId) {
        setSession(newSession);
        return; // No disparar re-carga de perfil
      }

      currentUserId = newSession?.user?.id ?? null;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
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
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;

      currentUserId = session?.user?.id ?? null;
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
        activityLoggerService.registrarInicioSesion(email, "error", error.message);
        return { error };
      }

      // Registrar inicio de sesión exitoso
      activityLoggerService.registrarInicioSesion(email, "exito");

      // mark_email_confirmed is now called automatically in fetchProfile
      // so no need to call it here separately

      return { error: null };
    } catch (err) {
      activityLoggerService.registrarInicioSesion(email, "error", (err as Error).message);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    const userEmail = profile?.email || user?.email || "desconocido";
    activityLoggerService.registrarCierreSesion(userEmail);

    // Clean up realtime channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // Handle inactivity logout
  const handleInactivityTimeout = useCallback(async () => {
    console.log("Session expired due to inactivity");
    try {
      // Clean up realtime channel
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during inactivity signOut:", err);
    }
    // Siempre redirigir, sin importar si signOut falló
    window.location.href = "/auth/login?reason=inactivity";
  }, []);

  // Auto-logout after inactivity - only active when user is logged in
  useInactivityTimeout({
    timeoutMs: INACTIVITY_TIMEOUT_MS,
    onTimeout: handleInactivityTimeout,
    enabled: !!user && !isLoading,
  });

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { error };
      }

      // Mark password as changed in usuarios table
      await supabase.rpc("mark_password_changed");

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
    permissionVersion,
    signIn,
    signOut,
    updatePassword,
    refreshProfile,
    triggerPermissionRefresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
