-- Asegurarse de que existen todos los estatus necesarios
-- Los estatus ya existen según la consulta previa, pero vamos a verificar

-- Asegurarse de que el estatus Reagendada existe (id=6)
-- Ya existe según la consulta

-- Crear función para actualizar estatus de reservas automáticamente
CREATE OR REPLACE FUNCTION actualizar_estatus_reservas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Actualizar a "Pagado" (id=2) cuando el acuerdo de pago está completado
  UPDATE reservas r
  SET id_estatus_reserva = 2
  FROM acuerdos_pago ap
  WHERE r.id_acuerdo_pago = ap.id
    AND ap.pago_completado = true
    AND r.id_estatus_reserva = 1  -- Solo si está en "Agendada"
    AND r.activo = true;

  -- Actualizar a "En progreso" (id=3) cuando la fecha/hora actual coincide con la reserva
  UPDATE reservas
  SET id_estatus_reserva = 3
  WHERE id_estatus_reserva = 2  -- Solo si está en "Pagado"
    AND activo = true
    AND CONCAT(fecha_reserva::text, ' ', hora_reserva)::timestamp <= NOW()
    AND CONCAT(fecha_reserva::text, ' ', hora_reserva)::timestamp > NOW() - INTERVAL '1 hour';

  -- Actualizar a "Terminada" (id=4) cuando termina la duración de la reserva
  UPDATE reservas r
  SET id_estatus_reserva = 4
  FROM espacios_reservables_edificio ere
  WHERE r.id_espacio_reservable_edificio = ere.id
    AND r.id_estatus_reserva = 3  -- Solo si está en "En progreso"
    AND r.activo = true
    AND (CONCAT(r.fecha_reserva::text, ' ', r.hora_reserva)::timestamp + 
         COALESCE(ere.duracion_reserva, INTERVAL '1 hour')) <= NOW();
END;
$$;

-- Comentario sobre la función
COMMENT ON FUNCTION actualizar_estatus_reservas() IS 'Actualiza automáticamente los estatus de las reservas según las reglas de negocio';