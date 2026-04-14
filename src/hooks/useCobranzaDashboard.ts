import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export function useProyectosCobranza() {
  return useQuery({
    queryKey: ['cobranza-proyectos-filtro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });
}
