import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_persona?: number;
}

interface CashPayment {
  fecha_pago: string;
  monto: number;
}

export interface CuentaCobranza {
  id: number;
  tipo: 'Propiedad' | 'Producto' | 'Servicio';
  producto_nombre?: string;
  clabe_stp: string | null;
  precio_final: number;
  precio_lista: number | null;
  es_comision_venta_efectivo?: boolean;
  porcentaje_comision_venta?: number;
  pagado: number;
  restante: number;
  compradores: Comprador[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  activo: boolean;
  id_oferta: number;
  motivo_cancelacion?: string | null;
  apartado_pagado: boolean;
  tiene_acuerdos: boolean;
  tiene_multas_pendientes?: boolean;
  cash_limit?: number;
  cash_paid?: number;
  cash_remaining?: number;
  cash_percentage?: number;
  cash_payments?: CashPayment[];
  id_estatus_disponibilidad?: number;
  estatus_propiedad?: string;
  collection_id?: number | null;
  total_acuerdos?: number;
  discrepancia?: number;
  metraje?: number;
  precio_por_m2?: number;
  id_proyecto?: number;
  id_entidad_relacionada_dueno?: number;
}

interface UseCuentasCobranzaParams {
  page: number;
  perPage?: number;
  idCuenta?: string;
  proyecto?: string;
  clabe?: string;
  noPropiedad?: string;
  modelo?: string;
  compradores?: string;
  producto?: string;
  estatusIds?: number[];
  tipos?: ('Propiedad' | 'Producto' | 'Servicio')[];
  activo: boolean;
  enabled?: boolean;
}

interface CuentaCobranzaRPCResult {
  id: number;
  tipo: string;
  producto_nombre: string | null;
  clabe_stp: string | null;
  precio_final: number;
  precio_lista: number | null;
  es_comision_venta_efectivo: boolean;
  porcentaje_comision_venta: number;
  pagado: number;
  restante: number;
  cash_limit: number;
  cash_paid: number;
  cash_remaining: number;
  cash_percentage: number;
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  activo: boolean;
  id_oferta: number;
  motivo_cancelacion: string | null;
  apartado_pagado: boolean;
  tiene_acuerdos: boolean;
  tiene_multas_pendientes: boolean;
  id_estatus_disponibilidad: number | null;
  estatus_propiedad: string | null;
  collection_id: number | null;
  total_acuerdos: number;
  discrepancia: number;
  metraje: number | null;
  precio_por_m2: number | null;
  id_proyecto: number | null;
  id_entidad_relacionada_dueno: number | null;
  compradores: Comprador[];
  total_count: number;
}

export function useCuentasCobranzaPaginadas({
  page,
  perPage = 50,
  idCuenta,
  proyecto,
  clabe,
  noPropiedad,
  modelo,
  compradores,
  producto,
  estatusIds,
  tipos,
  activo,
  enabled = true,
}: UseCuentasCobranzaParams) {
  const { 
    accessibleProjectIds, 
    hasUnrestrictedAccess, 
    isLoading: isLoadingAccess,
    isRepresentanteEmpresaDuena,
    ownershipEntityIds 
  } = useProjectAccess();

  return useQuery({
    queryKey: [
      "cuentas_cobranza_paginadas",
      page,
      perPage,
      idCuenta,
      proyecto,
      clabe,
      noPropiedad,
      modelo,
      compradores,
      producto,
      estatusIds,
      tipos,
      activo,
      hasUnrestrictedAccess,
      accessibleProjectIds,
      ownershipEntityIds,
    ],
    enabled: enabled && !isLoadingAccess,
    queryFn: async () => {
      // @ts-expect-error - RPC function exists but types are not generated
      const { data, error } = await supabase.rpc('get_cuentas_cobranza_paginadas', {
        p_page: page,
        p_per_page: perPage,
        p_id_cuenta: idCuenta ? parseInt(idCuenta) : null,
        p_proyecto: proyecto || null,
        p_clabe: clabe || null,
        p_no_propiedad: noPropiedad || null,
        p_modelo: modelo || null,
        p_compradores: compradores || null,
        p_producto: producto || null,
        p_estatus_ids: estatusIds && estatusIds.length > 0 ? estatusIds : null,
        p_tipos: tipos && tipos.length > 0 ? tipos : null,
        p_activo: activo,
        p_proyecto_ids: hasUnrestrictedAccess ? null : (accessibleProjectIds.length > 0 ? accessibleProjectIds : null),
        p_dueno_entity_ids: isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0 ? ownershipEntityIds : null,
      });

      if (error) {
        console.error('Error fetching cuentas cobranza:', error);
        throw error;
      }

      // Transform the result to match the expected interface
      const result = (data as unknown as CuentaCobranzaRPCResult[]) || [];
      const totalCount = result.length > 0 ? result[0].total_count : 0;

      const cuentas: CuentaCobranza[] = result.map(row => ({
        id: row.id,
        tipo: row.tipo as 'Propiedad' | 'Producto' | 'Servicio',
        producto_nombre: row.producto_nombre || undefined,
        clabe_stp: row.clabe_stp,
        precio_final: Number(row.precio_final) || 0,
        precio_lista: row.precio_lista ? Number(row.precio_lista) : null,
        es_comision_venta_efectivo: row.es_comision_venta_efectivo,
        porcentaje_comision_venta: Number(row.porcentaje_comision_venta) || 0,
        pagado: Number(row.pagado) || 0,
        restante: Number(row.restante) || 0,
        cash_limit: Number(row.cash_limit) || 0,
        cash_paid: Number(row.cash_paid) || 0,
        cash_remaining: Number(row.cash_remaining) || 0,
        cash_percentage: Number(row.cash_percentage) || 0,
        cash_payments: [], // Not included in RPC for performance, can be fetched separately if needed
        dueno: row.dueno,
        proyecto: row.proyecto,
        edificio: row.edificio,
        numero_propiedad: row.numero_propiedad,
        modelo: row.modelo,
        activo: row.activo,
        id_oferta: row.id_oferta,
        motivo_cancelacion: row.motivo_cancelacion,
        apartado_pagado: row.apartado_pagado,
        tiene_acuerdos: row.tiene_acuerdos,
        tiene_multas_pendientes: row.tiene_multas_pendientes,
        id_estatus_disponibilidad: row.id_estatus_disponibilidad || undefined,
        estatus_propiedad: row.estatus_propiedad || undefined,
        collection_id: row.collection_id,
        total_acuerdos: Number(row.total_acuerdos) || 0,
        discrepancia: Number(row.discrepancia) || 0,
        metraje: row.metraje ? Number(row.metraje) : undefined,
        precio_por_m2: row.precio_por_m2 ? Number(row.precio_por_m2) : undefined,
        id_proyecto: row.id_proyecto || undefined,
        id_entidad_relacionada_dueno: row.id_entidad_relacionada_dueno || undefined,
        compradores: Array.isArray(row.compradores) ? row.compradores : [],
      }));

      return {
        cuentas,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      };
    },
  });
}
