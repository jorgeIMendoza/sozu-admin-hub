import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BandejaCuenta {
  cuenta_id: number;
  clabe_stp: string | null;
  precio_final: number | null;
  fecha_compra: string | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  proyecto: string | null;
  proyecto_id: number | null;
  edificio: string | null;
  numero_propiedad: string | null;
  modelo: string | null;
  parcialidades_vencidas: number;
  monto_vencido: number;
  saldo_pendiente: number;
  proximo_vencimiento: string | null;
  ultima_fecha_pago: string | null;
  dias_sin_pagar: number;
  prioridad: 'purple' | 'red_dark' | 'red' | 'yellow' | 'green' | 'blue' | 'gray';
}

interface BandejaFilters {
  proyectoId?: number | null;
  search?: string;
  soloVencidas?: boolean;
}

export function useBandejaOperativa(filters: BandejaFilters = {}) {
  return useQuery({
    queryKey: ['bandeja-operativa', filters.proyectoId, filters.search, filters.soloVencidas],
    queryFn: async (): Promise<BandejaCuenta[]> => {
      const { data, error } = await supabase.rpc('get_bandeja_operativa', {
        p_proyecto_id: filters.proyectoId ?? null,
        p_search: filters.search || null,
        p_solo_vencidas: filters.soloVencidas ?? false,
      });
      if (error) throw error;
      return (data as unknown as BandejaCuenta[]) ?? [];
    },
    staleTime: 3 * 60 * 1000,
  });
}
