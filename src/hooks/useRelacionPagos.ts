import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export interface PagoRecord {
  pago_id: number;
  monto: number;
  fecha_pago: string;
  clave_rastreo: string | null;
  url_cep: string | null;
  url_recibo: string | null;
  descripcion: string | null;
  id_cuenta_cobranza: number;
  metodo_pago: string | null;
  clabe_stp: string | null;
  cliente: string | null;
  num_propiedad: string | null;
  producto: string | null;
  tipo_cuenta: 'propiedad' | 'producto' | null;
  proyecto: string | null;
  proyecto_id: number | null;
  tiene_cep: boolean;
  monto_aplicado: number;
  num_aplicaciones: number;
  aplicaciones_detalle: Array<{ concepto: string | null; orden: number | null; monto: number }>;
}

export interface RelacionPagosFilters {
  proyectoId?: number | null;
  metodoPago?: string | null;
  search?: string;
  hasCep?: boolean | null;
  tipoCuenta?: 'propiedad' | 'producto' | null;
  page: number;
  pageSize: number;
}

export interface RelacionPagosResult {
  pagos: PagoRecord[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

export function useRelacionPagos(filters: RelacionPagosFilters): RelacionPagosResult {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search || '');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search || ''), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const queryKey = useMemo(() => [
    'relacion-pagos',
    filters.proyectoId,
    filters.metodoPago,
    debouncedSearch,
    filters.hasCep,
    filters.tipoCuenta,
    filters.page,
    filters.pageSize,
  ], [filters.proyectoId, filters.metodoPago, debouncedSearch, filters.hasCep, filters.tipoCuenta, filters.page, filters.pageSize]);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_relacion_pagos', {
        p_proyecto_id: filters.proyectoId ?? null,
        p_metodo_pago: filters.metodoPago ?? null,
        p_search: debouncedSearch || null,
        p_has_cep: filters.hasCep ?? null,
        p_tipo_cuenta: filters.tipoCuenta ?? null,
        p_limit: filters.pageSize,
        p_offset: (filters.page - 1) * filters.pageSize,
      });
      if (error) throw error;
      return data as unknown as { total: number; pagos: PagoRecord[] };
    },
    staleTime: 30_000,
  });

  return {
    pagos: data?.pagos ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
