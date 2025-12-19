import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook that sets up real-time subscriptions for permission changes.
 * When permissions, project access, or user status change, it triggers
 * appropriate refreshes to update the UI immediately.
 */
export function useRealtimePermissions() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleForceLogout = useCallback(async () => {
    // Clear all queries and sign out immediately
    queryClient.clear();
    await signOut();
    // Force reload to ensure clean state
    window.location.href = '/auth/login';
  }, [queryClient, signOut]);

  const handlePermissionChange = useCallback(() => {
    // Invalidate all permission-related queries
    queryClient.invalidateQueries({ queryKey: ['role-project-config'] });
    queryClient.invalidateQueries({ queryKey: ['user-project-access'] });
    queryClient.invalidateQueries({ queryKey: ['user-entity-data'] });
    // Refresh profile to get updated role info
    refreshProfile();
  }, [queryClient, refreshProfile]);

  const handleProjectAccessChange = useCallback(() => {
    // Invalidate project access queries
    queryClient.invalidateQueries({ queryKey: ['user-project-access'] });
    queryClient.invalidateQueries({ queryKey: ['user-entity-data'] });
  }, [queryClient]);

  useEffect(() => {
    if (!user || !profile) return;

    const userEmail = user.email;
    const rolId = profile.rol_id;

    // Clean up existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create a single channel for all permission-related subscriptions
    const channel = supabase.channel('permission-updates');

    // 1. Subscribe to user status changes (activo field)
    // This will force logout if user is deactivated
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'usuarios',
        filter: `email=eq.${userEmail}`,
      },
      (payload) => {
        const newRecord = payload.new as { activo?: boolean; rol_id?: number };
        
        // If user was deactivated, force logout
        if (newRecord.activo === false) {
          console.log('User deactivated, forcing logout');
          handleForceLogout();
          return;
        }

        // If role changed, refresh permissions
        if (newRecord.rol_id !== rolId) {
          console.log('User role changed, refreshing permissions');
          handlePermissionChange();
        }
      }
    );

    // 2. Subscribe to role permission changes (submenus_permisos)
    // This updates when permissions are added/removed for the user's role
    channel.on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'submenus_permisos',
        filter: `rol_id=eq.${rolId}`,
      },
      (payload) => {
        console.log('Role permissions changed, refreshing');
        handlePermissionChange();
      }
    );

    // 3. Subscribe to role configuration changes
    // This updates when role settings like ver_todos_proyectos_propiedades change
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'roles',
        filter: `id=eq.${rolId}`,
      },
      (payload) => {
        console.log('Role configuration changed, refreshing');
        handlePermissionChange();
      }
    );

    // 4. Subscribe to project access changes for this user
    if (userEmail) {
      channel.on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'proyectos_acceso',
          filter: `usuario_id=eq.${userEmail}`,
        },
        (payload) => {
          console.log('Project access changed, refreshing');
          handleProjectAccessChange();
        }
      );
    }

    // Subscribe to the channel
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Real-time permission subscriptions active');
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, profile, handleForceLogout, handlePermissionChange, handleProjectAccessChange]);
}
