import { supabase } from '@/integrations/supabase/client';

// IDs de actividades (deben coincidir con la tabla actividades)
export const ACTIVIDADES = {
  CREAR: 1,
  ACTUALIZAR: 2,
  ELIMINAR: 3,
  INICIAR_SESION: 4,
  CERRAR_SESION: 5,
  VER: 6,
  EXPORTAR: 7,
  RESTAURAR: 8,
  APROBAR: 9,
  RECHAZAR: 10,
  ASIGNAR: 11,
  DESASIGNAR: 12,
  GENERAR_OFERTA: 13,
  GENERAR_CONTRATO: 14,
  SUBIR_DOCUMENTO: 15,
  REGISTRAR_PAGO: 16,
  CANCELAR: 17,
} as const;

export type TipoActividad = keyof typeof ACTIVIDADES;

interface LogParams {
  usuarioId: string;
  actividadId: number;
  valorAnterior?: Record<string, unknown> | null;
  nuevoValor?: Record<string, unknown> | null;
  estatusEjecucion: 'exito' | 'error';
  datosPayload?: Record<string, unknown> | null;
  workflow?: string | null;
  primerNodo?: string | null;
  ultimoNodo?: string | null;
}

const getAmbiente = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    if (hostname.includes('preview') || hostname.includes('staging')) {
      return 'staging';
    }
  }
  return 'production';
};

const insertarLog = async (params: LogParams): Promise<void> => {
  try {
    const { error } = await supabase.from('logs_actividad').insert({
      usuario_id: params.usuarioId,
      actividad_id: params.actividadId,
      valor_anterior: params.valorAnterior || null,
      nuevo_valor: params.nuevoValor || null,
      estatus_ejecucion: params.estatusEjecucion,
      datos_payload: params.datosPayload || null,
      workflow: params.workflow || null,
      primer_nodo: params.primerNodo || null,
      ultimo_nodo: params.ultimoNodo || null,
      ambiente: getAmbiente(),
    });

    if (error) {
      console.error('Error al registrar actividad:', error);
    }
  } catch (e) {
    // Silenciar errores para no afectar la operación principal
    console.error('Error en activityLoggerService:', e);
  }
};

export const activityLoggerService = {
  registrarCreacion: async (
    usuarioId: string,
    entidad: string,
    nuevoValor: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.CREAR,
      nuevoValor: { entidad, ...nuevoValor },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `crear_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarActualizacion: async (
    usuarioId: string,
    entidad: string,
    valorAnterior: Record<string, unknown> | null,
    nuevoValor: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.ACTUALIZAR,
      valorAnterior: valorAnterior ? { entidad, ...valorAnterior } : null,
      nuevoValor: { entidad, ...nuevoValor },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `actualizar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarEliminacion: async (
    usuarioId: string,
    entidad: string,
    valorAnterior: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.ELIMINAR,
      valorAnterior: { entidad, ...valorAnterior },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `eliminar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarInicioSesion: async (
    usuarioId: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.INICIAR_SESION,
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: 'iniciar_sesion',
      primerNodo: 'autenticacion',
      ultimoNodo: 'autenticacion',
    });
  },

  registrarCierreSesion: async (usuarioId: string) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.CERRAR_SESION,
      estatusEjecucion: 'exito',
      workflow: 'cerrar_sesion',
      primerNodo: 'autenticacion',
      ultimoNodo: 'autenticacion',
    });
  },

  registrarVista: async (
    usuarioId: string,
    ruta: string,
    datos?: Record<string, unknown>
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.VER,
      nuevoValor: { ruta, ...datos },
      estatusEjecucion: 'exito',
      workflow: 'ver_pagina',
      primerNodo: ruta,
      ultimoNodo: ruta,
    });
  },

  registrarExportacion: async (
    usuarioId: string,
    tipo: string,
    datos?: Record<string, unknown>
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.EXPORTAR,
      nuevoValor: { tipo, ...datos },
      estatusEjecucion: 'exito',
      workflow: `exportar_${tipo}`,
      primerNodo: tipo,
      ultimoNodo: tipo,
    });
  },

  registrarRestauracion: async (
    usuarioId: string,
    entidad: string,
    valorAnterior: Record<string, unknown>,
    nuevoValor: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.RESTAURAR,
      valorAnterior: { entidad, ...valorAnterior },
      nuevoValor: { entidad, ...nuevoValor },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `restaurar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarAprobacion: async (
    usuarioId: string,
    entidad: string,
    datos: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.APROBAR,
      nuevoValor: { entidad, ...datos },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `aprobar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarRechazo: async (
    usuarioId: string,
    entidad: string,
    datos: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.RECHAZAR,
      nuevoValor: { entidad, ...datos },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `rechazar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarAsignacion: async (
    usuarioId: string,
    entidad: string,
    datos: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.ASIGNAR,
      nuevoValor: { entidad, ...datos },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `asignar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarDesasignacion: async (
    usuarioId: string,
    entidad: string,
    datos: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.DESASIGNAR,
      nuevoValor: { entidad, ...datos },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `desasignar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },

  registrarGeneracionOferta: async (
    usuarioId: string,
    datos: Record<string, unknown>,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.GENERAR_OFERTA,
      nuevoValor: datos,
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: 'generar_oferta',
      primerNodo: 'ofertas',
      ultimoNodo: 'ofertas',
    });
  },

  registrarGeneracionContrato: async (
    usuarioId: string,
    datos: Record<string, unknown>,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.GENERAR_CONTRATO,
      nuevoValor: datos,
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: 'generar_contrato',
      primerNodo: 'contratos',
      ultimoNodo: 'contratos',
    });
  },

  registrarSubidaDocumento: async (
    usuarioId: string,
    datos: Record<string, unknown>,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.SUBIR_DOCUMENTO,
      nuevoValor: datos,
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: 'subir_documento',
      primerNodo: 'documentos',
      ultimoNodo: 'documentos',
    });
  },

  registrarPago: async (
    usuarioId: string,
    datos: Record<string, unknown>,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.REGISTRAR_PAGO,
      nuevoValor: datos,
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: 'registrar_pago',
      primerNodo: 'pagos',
      ultimoNodo: 'pagos',
    });
  },

  registrarCancelacion: async (
    usuarioId: string,
    entidad: string,
    datos: Record<string, unknown>,
    workflow?: string,
    estatus: 'exito' | 'error' = 'exito',
    mensajeError?: string
  ) => {
    await insertarLog({
      usuarioId,
      actividadId: ACTIVIDADES.CANCELAR,
      nuevoValor: { entidad, ...datos },
      estatusEjecucion: estatus,
      datosPayload: mensajeError ? { error: mensajeError } : null,
      workflow: workflow || `cancelar_${entidad}`,
      primerNodo: entidad,
      ultimoNodo: entidad,
    });
  },
};
