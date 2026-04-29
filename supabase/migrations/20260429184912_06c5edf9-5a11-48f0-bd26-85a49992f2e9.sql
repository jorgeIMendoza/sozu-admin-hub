INSERT INTO public.aviso_triggers_fuentes (clave, nombre, descripcion, activo)
VALUES (
  'acuerdos_vencidos_acumulados',
  'Adeudos acumulados al día de corte',
  'Notifica un correo por cliente con TODOS sus acuerdos cuya fecha_pago <= (hoy − offset), activo=true y pago_completado=false. Usar offset 0 y opcionalmente cron_expression del aviso para limitar el día del mes (ej. 0 9 30 * *).',
  true
)
ON CONFLICT (clave) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    activo = true;