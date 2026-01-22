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
  clabe_stp: string | null;
  fecha_compra: string | null;
  precio_final: number;
  activo: boolean;
  id_oferta: number;
  tipo: string;
  proyecto: string | null;
  id_proyecto: number | null;
  modelo: string | null;
  edificio: string | null;
  numero_propiedad: string | null;
  id_propiedad: number | null;
  producto: string | null;
  id_producto: number | null;
  comprador: string | null;
  compradores_json: Array<{ id_persona: number; nombre_legal: string; rfc: string | null; porcentaje_copropiedad: number }> | null;
  id_estatus_disponibilidad: number | null;
  estatus_disponibilidad_nombre: string | null;
  vendedor: string | null;
  id_cuenta_cobranza_padre: number | null;
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
      const { data, error } = await supabase.rpc('get_cuentas_cobranza_paginadas' as any, {
        p_page: page,
        p_per_page: perPage,
        p_id_cuenta: idCuenta || null,
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
        producto_nombre: row.producto || undefined,
        clabe_stp: row.clabe_stp,
        precio_final: Number(row.precio_final) || 0,
        precio_lista: null,
        pagado: 0,
        restante: 0,
        dueno: row.vendedor || '',
        proyecto: row.proyecto || '',
        edificio: row.edificio || '',
        numero_propiedad: row.numero_propiedad || '',
        modelo: row.modelo || '',
        activo: row.activo,
        id_oferta: row.id_oferta,
        apartado_pagado: false,
        tiene_acuerdos: false,
        id_estatus_disponibilidad: row.id_estatus_disponibilidad || undefined,
        estatus_propiedad: row.estatus_disponibilidad_nombre || undefined,
        cash_payments: [],
        id_proyecto: row.id_proyecto || undefined,
        compradores: (row.compradores_json || []).map(c => ({
          nombre_legal: c.nombre_legal,
          rfc: c.rfc,
          porcentaje_copropiedad: c.porcentaje_copropiedad,
          id_persona: c.id_persona,
        })),
      }));

      return {
        cuentas,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      };
    },
  });
}
