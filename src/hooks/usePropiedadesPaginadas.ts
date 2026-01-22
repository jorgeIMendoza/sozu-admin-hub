import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";

export interface PropertyPaginated {
  id: number;
  numero_propiedad: string;
  numero_piso: string | null;
  m2_interiores: number;
  m2_exteriores: number;
  m2_reales: number;
  precio_lista: number;
  monto_apartado: number | null;
  monto_apartado_pagando: number | null;
  clabe_stp_tmp_apartado: string | null;
  activo: boolean;
  es_aprobado: boolean;
  id_entidad_relacionada_dueno: number;
  id_edificio_modelo: number;
  id_vista: number | null;
  id_estatus_disponibilidad: number;
  id_tipo_transaccion: number | null;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  modelo_id: number;
  numero_recamaras: number;
  numero_completo_banos: number;
  numero_medio_bano: number;
  vista: string | null;
  disponibilidad: string;
  tipo_transaccion: string | null;
  propietario: string | null;
  cuenta_cobranza_id: number | null;
  clabe_stp: string | null;
  precio_final: number | null;
  es_comision_venta_efectivo: boolean;
  porcentaje_comision_venta: number;
  total_pagado: number;
  restante: number;
  apartado_pagado: boolean;
  cuenta_sin_esquema: boolean;
  tiene_cuenta_pagada: boolean;
  estacionamientos_count: number;
  bodegas_count: number;
  tiene_ofertas: boolean;
  tiene_ofertas_productos: boolean;
  // For compatibility with existing Property interface
  configuracion_modelo?: {
    numero_recamaras: number;
    numero_completo_banos: number;
    numero_medio_bano: number;
  };
  tieneOfertas?: boolean;
  tieneOfertasProductos?: boolean;
}

interface UsePropiedadesPaginadasParams {
  page: number;
  perPage?: number;
  search?: string;
  proyectoIds?: number[];
  modeloIds?: number[];
  recamaras?: number | null;
  banos?: number | null;
  disponibilidadIds?: number[];
  tipoTransaccionIds?: number[];
  areaMin?: number | null;
  areaMax?: number | null;
  precioMin?: number | null;
  precioMax?: number | null;
  tieneBodegas?: string | null;
  tieneEstacionamientos?: string | null;
  tieneCuenta?: string | null;
  activo?: boolean;
  esAprobado?: boolean;
  ordenPrecio?: 'asc' | 'desc' | null;
  enabled?: boolean;
}

interface PropiedadRPCResult {
  id: number;
  numero_propiedad: string;
  numero_piso: string | null;
  m2_interiores: number;
  m2_exteriores: number;
  m2_reales: number;
  precio_lista: number;
  monto_apartado: number | null;
  monto_apartado_pagando: number | null;
  clabe_stp_tmp_apartado: string | null;
  activo: boolean;
  es_aprobado: boolean;
  id_entidad_relacionada_dueno: number;
  id_edificio_modelo: number;
  id_vista: number | null;
  id_estatus_disponibilidad: number;
  id_tipo_transaccion: number | null;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  modelo_id: number;
  numero_recamaras: number;
  numero_completo_banos: number;
  numero_medio_bano: number;
  vista: string | null;
  disponibilidad: string;
  tipo_transaccion: string | null;
  propietario: string | null;
  cuenta_cobranza_id: number | null;
  clabe_stp: string | null;
  precio_final: number | null;
  es_comision_venta_efectivo: boolean;
  porcentaje_comision_venta: number;
  total_pagado: number;
  restante: number;
  apartado_pagado: boolean;
  cuenta_sin_esquema: boolean;
  tiene_cuenta_pagada: boolean;
  estacionamientos_count: number;
  bodegas_count: number;
  tiene_ofertas: boolean;
  tiene_ofertas_productos: boolean;
  total_count: number;
}

export function usePropiedadesPaginadas({
  page,
  perPage = 50,
  search,
  proyectoIds,
  modeloIds,
  recamaras,
  banos,
  disponibilidadIds,
  tipoTransaccionIds,
  areaMin,
  areaMax,
  precioMin,
  precioMax,
  tieneBodegas,
  tieneEstacionamientos,
  tieneCuenta,
  activo = true,
  esAprobado = true,
  ordenPrecio,
  enabled = true,
}: UsePropiedadesPaginadasParams) {
  const { 
    accessibleProjectIds, 
    hasUnrestrictedAccess, 
    isLoading: isLoadingAccess,
    isRepresentanteEmpresaDuena,
    ownershipEntityIds 
  } = useProjectAccess();

  return useQuery({
    queryKey: [
      "propiedades_paginadas",
      page,
      perPage,
      search,
      proyectoIds,
      modeloIds,
      recamaras,
      banos,
      disponibilidadIds,
      tipoTransaccionIds,
      areaMin,
      areaMax,
      precioMin,
      precioMax,
      tieneBodegas,
      tieneEstacionamientos,
      tieneCuenta,
      activo,
      esAprobado,
      ordenPrecio,
      hasUnrestrictedAccess,
      accessibleProjectIds,
      ownershipEntityIds,
    ],
    enabled: enabled && !isLoadingAccess,
    queryFn: async () => {
      // @ts-expect-error - RPC function exists but types are not generated
      const { data, error } = await supabase.rpc('get_propiedades_paginadas', {
        p_page: page,
        p_per_page: perPage,
        p_search: search || null,
        p_proyecto_ids: proyectoIds && proyectoIds.length > 0 ? proyectoIds : null,
        p_modelo_ids: modeloIds && modeloIds.length > 0 ? modeloIds : null,
        p_recamaras: recamaras ?? null,
        p_banos: banos ?? null,
        p_disponibilidad_ids: disponibilidadIds && disponibilidadIds.length > 0 ? disponibilidadIds : null,
        p_tipo_transaccion_ids: tipoTransaccionIds && tipoTransaccionIds.length > 0 ? tipoTransaccionIds : null,
        p_area_min: areaMin ?? null,
        p_area_max: areaMax ?? null,
        p_precio_min: precioMin ?? null,
        p_precio_max: precioMax ?? null,
        p_tiene_bodegas: tieneBodegas || null,
        p_tiene_estacionamientos: tieneEstacionamientos || null,
        p_tiene_cuenta: tieneCuenta || null,
        p_activo: activo,
        p_es_aprobado: esAprobado,
        p_orden_precio: ordenPrecio || null,
        p_accessible_project_ids: hasUnrestrictedAccess ? null : (accessibleProjectIds.length > 0 ? accessibleProjectIds : null),
        p_ownership_entity_ids: isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0 ? ownershipEntityIds : null,
      });

      if (error) {
        console.error('Error fetching propiedades:', error);
        throw error;
      }

      const result = (data as unknown as PropiedadRPCResult[]) || [];
      const totalCount = result.length > 0 ? result[0].total_count : 0;

      const propiedades: PropertyPaginated[] = result.map(row => ({
        id: row.id,
        numero_propiedad: row.numero_propiedad,
        numero_piso: row.numero_piso,
        m2_interiores: Number(row.m2_interiores) || 0,
        m2_exteriores: Number(row.m2_exteriores) || 0,
        m2_reales: Number(row.m2_reales) || 0,
        precio_lista: Number(row.precio_lista) || 0,
        monto_apartado: row.monto_apartado ? Number(row.monto_apartado) : null,
        monto_apartado_pagando: row.monto_apartado_pagando ? Number(row.monto_apartado_pagando) : null,
        clabe_stp_tmp_apartado: row.clabe_stp_tmp_apartado,
        activo: row.activo,
        es_aprobado: row.es_aprobado,
        id_entidad_relacionada_dueno: row.id_entidad_relacionada_dueno,
        id_edificio_modelo: row.id_edificio_modelo,
        id_vista: row.id_vista,
        id_estatus_disponibilidad: row.id_estatus_disponibilidad,
        id_tipo_transaccion: row.id_tipo_transaccion,
        proyecto: row.proyecto,
        proyecto_id: row.proyecto_id,
        edificio: row.edificio,
        modelo: row.modelo,
        modelo_id: row.modelo_id,
        numero_recamaras: row.numero_recamaras,
        numero_completo_banos: row.numero_completo_banos,
        numero_medio_bano: row.numero_medio_bano,
        vista: row.vista,
        disponibilidad: row.disponibilidad,
        tipo_transaccion: row.tipo_transaccion,
        propietario: row.propietario,
        cuenta_cobranza_id: row.cuenta_cobranza_id,
        clabe_stp: row.clabe_stp,
        precio_final: row.precio_final ? Number(row.precio_final) : null,
        es_comision_venta_efectivo: row.es_comision_venta_efectivo,
        porcentaje_comision_venta: Number(row.porcentaje_comision_venta) || 0,
        total_pagado: Number(row.total_pagado) || 0,
        restante: Number(row.restante) || 0,
        apartado_pagado: row.apartado_pagado,
        cuenta_sin_esquema: row.cuenta_sin_esquema,
        tiene_cuenta_pagada: row.tiene_cuenta_pagada,
        estacionamientos_count: row.estacionamientos_count,
        bodegas_count: row.bodegas_count,
        tiene_ofertas: row.tiene_ofertas,
        tiene_ofertas_productos: row.tiene_ofertas_productos,
        // For compatibility
        configuracion_modelo: {
          numero_recamaras: row.numero_recamaras,
          numero_completo_banos: row.numero_completo_banos,
          numero_medio_bano: row.numero_medio_bano,
        },
        tieneOfertas: row.tiene_ofertas,
        tieneOfertasProductos: row.tiene_ofertas_productos,
      }));

      return {
        propiedades,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      };
    },
  });
}
