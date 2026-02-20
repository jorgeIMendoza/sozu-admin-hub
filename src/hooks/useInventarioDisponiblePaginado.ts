import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProjectAccess } from '@/hooks/useProjectAccess';
import type { InventarioPropiedad } from '@/hooks/useInventarioDisponible';

export interface InventarioPaginadoFilters {
  projectNames?: string[];
  modelNames?: string[];
  bedrooms?: number[];
  levels?: string[];
  hasBodega?: boolean | null;
  hasEstacionamiento?: boolean | null;
  sortPrice?: 'asc' | 'desc' | null;
  page: number;
  pageSize?: number;
}

export interface InventarioPaginadoResult {
  propiedades: InventarioPropiedad[];
  totalCount: number;
  totalPages: number;
  filterOptions: {
    proyectos: string[];
    modelos: string[];
    recamaras: number[];
    niveles: string[];
  };
}

export function useInventarioDisponiblePaginado(filters: InventarioPaginadoFilters) {
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  const pageSize = filters.pageSize ?? 30;

  const { data, isLoading: isLoadingData, isFetching } = useQuery({
    queryKey: [
      'inventario-disponible-v2',
      hasUnrestrictedAccess ? 'all' : accessibleProjectIds,
      filters.projectNames,
      filters.modelNames,
      filters.bedrooms,
      filters.levels,
      filters.hasBodega,
      filters.hasEstacionamiento,
      filters.sortPrice,
      filters.page,
      pageSize,
    ],
    queryFn: async (): Promise<InventarioPaginadoResult> => {
      if (hasNoAccess) return { propiedades: [], totalCount: 0, totalPages: 0, filterOptions: { proyectos: [], modelos: [], recamaras: [], niveles: [] } };

      const params: Record<string, any> = {
        p_page: filters.page,
        p_page_size: pageSize,
      };

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        params.p_accessible_project_ids = accessibleProjectIds;
      }
      if (filters.projectNames?.length) params.p_project_names = filters.projectNames;
      if (filters.modelNames?.length) params.p_model_names = filters.modelNames;
      if (filters.bedrooms?.length) params.p_bedrooms = filters.bedrooms;
      if (filters.levels?.length) params.p_levels = filters.levels;
      if (filters.hasBodega != null) params.p_has_bodega = filters.hasBodega;
      if (filters.hasEstacionamiento != null) params.p_has_estacionamiento = filters.hasEstacionamiento;
      if (filters.sortPrice) params.p_sort_price = filters.sortPrice;

      const { data, error } = await supabase.rpc(
        'get_inventario_disponible_v2' as any,
        params as any
      );

      if (error) {
        console.error('Error fetching inventario paginado:', error);
        return { propiedades: [], totalCount: 0, totalPages: 0, filterOptions: { proyectos: [], modelos: [], recamaras: [], niveles: [] } };
      }

      const result = data as any;
      const rawProps = (result?.propiedades || []) as any[];
      const modeloImagenesMap = (result?.modelo_imagenes || {}) as Record<string, { id: number; url: string }[]>;
      const esquemasPagoMap = (result?.esquemas_pago_proyecto || {}) as Record<string, any[]>;
      const totalCount = result?.total_count || 0;
      const filterOpts = result?.filter_options || {};

      const propiedades: InventarioPropiedad[] = rawProps.map((p: any) => ({
        id: p.id,
        numero_propiedad: p.numero_propiedad,
        numero_piso: p.numero_piso,
        precio_lista: p.precio_lista,
        m2_interiores: p.m2_interiores,
        m2_exteriores: p.m2_exteriores,
        proyecto_id: p.proyecto_id,
        proyecto_nombre: p.proyecto_nombre,
        edificio_nombre: p.edificio_nombre,
        modelo_id: p.modelo_id,
        modelo_nombre: p.modelo_nombre,
        numero_recamaras: p.numero_recamaras,
        numero_completo_banos: p.numero_completo_banos,
        numero_medio_bano: p.numero_medio_bano,
        bodegas_count: p.bodegas_count,
        estacionamientos_count: p.estacionamientos_count,
        estacionamientos_tipos: p.estacionamientos_tipos || [],
        propiedad_imagenes: p.propiedad_imagenes || [],
        modelo_imagenes: modeloImagenesMap[String(p.modelo_id)] || [],
        esquemas_pago: esquemasPagoMap[String(p.proyecto_id)] || [],
      }));

      return {
        propiedades,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        filterOptions: {
          proyectos: (filterOpts.proyectos || []) as string[],
          modelos: (filterOpts.modelos || []) as string[],
          recamaras: (filterOpts.recamaras || []) as number[],
          niveles: (filterOpts.niveles || []) as string[],
        },
      };
    },
    enabled: !isLoadingAccess,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    data: data ?? { propiedades: [], totalCount: 0, totalPages: 0, filterOptions: { proyectos: [], modelos: [], recamaras: [], niveles: [] } },
    isLoading: isLoadingAccess || isLoadingData,
    isFetching,
    hasNoAccess,
  };
}
