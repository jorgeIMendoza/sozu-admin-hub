import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCobranzaImpersonation } from '@/contexts/CobranzaImpersonationContext';

export interface DashboardKPIs {
  cobrado_total: number;
  vencido_total: number;
  pendiente_total: number;
  cobrado_mes: number;
  programado_mes: number;
  recovery_rate: number;
  aging: { rango: string; monto: number; cantidad: number }[] | null;
  morosidad: { grupo: string; cuentas: number }[] | null;
  por_proyecto: { proyecto: string; proyecto_id: number; cobrado: number; vencido: number; pendiente: number }[] | null;
  cobrado_mensual: { mes: string; cobrado: number }[] | null;
  programado_mensual: { mes: string; programado: number }[] | null;
}

export function useCobranzaDashboard(proyectoId?: number | null) {
  return useQuery({
    queryKey: ['cobranza-dashboard-kpis', proyectoId],
    queryFn: async (): Promise<DashboardKPIs> => {
      const { data, error } = await supabase.rpc('get_dashboard_cobranza_kpis', {
        p_proyecto_id: proyectoId ?? null,
      });
      if (error) throw error;
      return data as unknown as DashboardKPIs;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Returns only projects the current user has access to via proyectos_acceso.
 * Super Admins (rol_id 1) and Admins (rol_id 2) see all active projects.
 */
export function useProyectosCobranza() {
  const { user, profile } = useAuth();
  const { impersonatedEmail, impersonatedRoleId, isImpersonating } = useCobranzaImpersonation();
  const effectiveEmail = isImpersonating ? impersonatedEmail : user?.email;
  const effectiveRoleId = isImpersonating ? impersonatedRoleId : profile?.rol_id;
  const hasFullProjectAccess = effectiveRoleId === 1 || effectiveRoleId === 2;

  return useQuery({
    queryKey: ['cobranza-proyectos-filtro', effectiveEmail, effectiveRoleId, isImpersonating],
    queryFn: async () => {
      if (!effectiveEmail && !hasFullProjectAccess) return [];

      if (hasFullProjectAccess) {
        // Effective Super Admin / Admin see all active projects
        const { data, error } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        return data ?? [];
      }

      // Other roles: filter by proyectos_acceso
      const { data: accesos, error: accError } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id, proyectos!proyectos_acceso_proyecto_id_fkey(id, nombre)')
        .eq('usuario_id', effectiveEmail)
        .eq('activo', true) as any;

      if (accError) throw accError;
      if (!accesos) return [];

      return accesos
        .filter((a: any) => a.proyectos)
        .map((a: any) => ({ id: a.proyectos.id, nombre: a.proyectos.nombre }))
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: hasFullProjectAccess || !!effectiveEmail,
    staleTime: 30 * 60 * 1000,
  });
}
