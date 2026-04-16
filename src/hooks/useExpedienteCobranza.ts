import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ExpedienteCuenta {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
  fecha_compra: string | null;
  id_oferta: number | null;
  activo: boolean;
  collection_id: number | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  cliente_rfc: string | null;
  cliente_tipo: string | null;
  proyecto_id: number | null;
  proyecto_nombre: string | null;
  edificio: string | null;
  modelo: string | null;
  numero_propiedad: string | null;
  propiedad_id: number | null;
  metraje: number | null;
}

export interface ExpedienteFinanzas {
  total_acuerdos: number;
  total_pagado: number;
  parcialidades_vencidas: number;
  monto_vencido: number;
  saldo_pendiente: number;
  proximo_vencimiento: string | null;
  total_parcialidades: number;
  parcialidades_pagadas: number;
}

export interface ExpedienteParcialidad {
  id: number;
  orden: number;
  fecha_pago: string | null;
  monto: number;
  pago_completado: boolean;
  concepto: string | null;
  aplicado: number;
}

export interface ExpedientePago {
  id: number;
  fecha_pago: string;
  monto: number;
  descripcion: string | null;
  clave_rastreo: string | null;
  url_recibo: string | null;
  url_cep: string | null;
  metodo: string | null;
}

export interface ExpedienteComprador {
  nombre_legal: string;
  rfc: string | null;
  email: string | null;
  telefono: string | null;
  porcentaje_copropiedad: number | null;
}

export interface Expediente {
  cuenta: ExpedienteCuenta | null;
  compradores: ExpedienteComprador[];
  finanzas: ExpedienteFinanzas;
  parcialidades: ExpedienteParcialidad[];
  pagos: ExpedientePago[];
}

export function useExpedienteCobranza(cuentaId: number | null) {
  return useQuery({
    queryKey: ['expediente-cobranza', cuentaId],
    enabled: !!cuentaId,
    queryFn: async (): Promise<Expediente> => {
      const { data, error } = await supabase.rpc('get_expediente_cobranza', {
        p_cuenta_id: cuentaId!,
      } as any);
      if (error) throw error;
      return data as unknown as Expediente;
    },
    staleTime: 2 * 60 * 1000,
  });
}
