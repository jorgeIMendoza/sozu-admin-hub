import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProjectAccess } from '@/hooks/useProjectAccess';

export interface InventarioPropiedad {
  id: number;
  numero_propiedad: string;
  numero_piso: string | null;
  precio_lista: number;
  m2_interiores: number;
  m2_exteriores: number;
  proyecto_id: number;
  proyecto_nombre: string;
  edificio_nombre: string;
  modelo_id: number;
  modelo_nombre: string;
  numero_recamaras: number;
  numero_completo_banos: number;
  numero_medio_bano: number;
  bodegas_count: number;
  estacionamientos_count: number;
  estacionamientos_tipos: string[];
  propiedad_imagenes: { id: number; url: string }[];
  modelo_imagenes: { id: number; url: string }[];
  esquemas_pago: {
    id: number;
    nombre: string;
    id_proyecto: number;
    porcentaje_enganche: number;
    porcentaje_mensualidades: number;
    porcentaje_entrega: number;
    numero_mensualidades: number;
    porcentaje_descuento_aumento: number;
  }[];
}

export function useInventarioDisponible() {
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();

  const { data: propiedades = [], isLoading: isLoadingData } = useQuery({
    queryKey: ['inventario-disponible', hasUnrestrictedAccess ? 'all' : accessibleProjectIds],
    queryFn: async () => {
      if (hasNoAccess) return [];

      const params: { p_accessible_project_ids?: number[] } = {};
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        params.p_accessible_project_ids = accessibleProjectIds;
      }

      const { data, error } = await supabase.rpc(
        'get_inventario_disponible' as any,
        params as any
      );

      if (error) {
        console.error('Error fetching inventario disponible:', error);
        return [];
      }

      return (data as unknown as InventarioPropiedad[]) || [];
    },
    enabled: !isLoadingAccess,
  });

  return {
    propiedades,
    isLoading: isLoadingAccess || isLoadingData,
    hasNoAccess,
  };
}
