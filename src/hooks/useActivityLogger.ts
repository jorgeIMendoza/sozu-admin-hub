import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { activityLoggerService } from '@/services/activityLoggerService';

export function useActivityLogger() {
  const { profile } = useAuth();
  const usuarioId = profile?.email || 'sistema';

  const registrarCreacion = useCallback(
    async (
      entidad: string,
      nuevoValor: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarCreacion(
        usuarioId,
        entidad,
        nuevoValor,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarActualizacion = useCallback(
    async (
      entidad: string,
      valorAnterior: Record<string, unknown> | null,
      nuevoValor: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarActualizacion(
        usuarioId,
        entidad,
        valorAnterior,
        nuevoValor,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarEliminacion = useCallback(
    async (
      entidad: string,
      valorAnterior: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarEliminacion(
        usuarioId,
        entidad,
        valorAnterior,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarVista = useCallback(
    async (ruta: string, datos?: Record<string, unknown>) => {
      await activityLoggerService.registrarVista(usuarioId, ruta, datos);
    },
    [usuarioId]
  );

  const registrarExportacion = useCallback(
    async (tipo: string, datos?: Record<string, unknown>) => {
      await activityLoggerService.registrarExportacion(usuarioId, tipo, datos);
    },
    [usuarioId]
  );

  const registrarRestauracion = useCallback(
    async (
      entidad: string,
      valorAnterior: Record<string, unknown>,
      nuevoValor: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarRestauracion(
        usuarioId,
        entidad,
        valorAnterior,
        nuevoValor,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarAprobacion = useCallback(
    async (
      entidad: string,
      datos: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarAprobacion(
        usuarioId,
        entidad,
        datos,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarRechazo = useCallback(
    async (
      entidad: string,
      datos: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarRechazo(
        usuarioId,
        entidad,
        datos,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarAsignacion = useCallback(
    async (
      entidad: string,
      datos: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarAsignacion(
        usuarioId,
        entidad,
        datos,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarDesasignacion = useCallback(
    async (
      entidad: string,
      datos: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarDesasignacion(
        usuarioId,
        entidad,
        datos,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarGeneracionOferta = useCallback(
    async (
      datos: Record<string, unknown>,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarGeneracionOferta(
        usuarioId,
        datos,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarGeneracionContrato = useCallback(
    async (
      datos: Record<string, unknown>,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarGeneracionContrato(
        usuarioId,
        datos,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarSubidaDocumento = useCallback(
    async (
      datos: Record<string, unknown>,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarSubidaDocumento(
        usuarioId,
        datos,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarPago = useCallback(
    async (
      datos: Record<string, unknown>,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarPago(
        usuarioId,
        datos,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  const registrarCancelacion = useCallback(
    async (
      entidad: string,
      datos: Record<string, unknown>,
      workflow?: string,
      estatus: 'exito' | 'error' = 'exito',
      mensajeError?: string
    ) => {
      await activityLoggerService.registrarCancelacion(
        usuarioId,
        entidad,
        datos,
        workflow,
        estatus,
        mensajeError
      );
    },
    [usuarioId]
  );

  return {
    registrarCreacion,
    registrarActualizacion,
    registrarEliminacion,
    registrarVista,
    registrarExportacion,
    registrarRestauracion,
    registrarAprobacion,
    registrarRechazo,
    registrarAsignacion,
    registrarDesasignacion,
    registrarGeneracionOferta,
    registrarGeneracionContrato,
    registrarSubidaDocumento,
    registrarPago,
    registrarCancelacion,
  };
}
