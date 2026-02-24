
# Plan: Recrear eventos eliminados al guardar configuracion

## Problema

Cuando se guarda la configuracion de una cita (ej: "Capacitacion Daiku Presencial" para Jueves 11am hasta 8 de marzo), el sistema detecta que el evento del 26 de febrero fue eliminado manualmente de Google Calendar. En lugar de recrearlo, lo marca como `cancelado_externamente = true` y lo agrega a la lista de "cubiertos", bloqueando su recreacion. Esto es incorrecto: al guardar explicitamente la configuracion, el usuario esta diciendo "quiero que existan estos eventos".

## Solucion

Cambiar el Step 3 de la edge function `agendar-capacitacion` para que, en lugar de marcar los eventos eliminados como bloqueados, los **recree** en Google Calendar y actualice el registro en la base de datos con el nuevo `google_event_id`, reseteando `cancelado_externamente = false`.

## Cambios

### 1. Edge Function `supabase/functions/agendar-capacitacion/index.ts`

**Step 3 (lineas ~799-823)**: Reemplazar la logica actual de "marcar como cancelado" por:

1. Para cada evento detectado como eliminado (`deletedEvents`):
   - Crear un **nuevo evento** en Google Calendar con la misma fecha, hora, summary y configuracion (usando la misma logica de creacion del Step 4)
   - Actualizar el registro en `citas_calendar_events` con:
     - El nuevo `google_event_id`
     - `cancelado_externamente = false`
     - `activo = true`
   - Reportar la accion como `"regenerated"` en vez de `"cancelled_externally"`
2. NO cancelar las reservas activas (ya que el slot se esta restaurando)

**Step 4 (lineas ~868-874)**: Mantener los eventos regenerados en `coveredByStored` para evitar duplicados, ya que ahora SI fueron recreados.

### 2. Comportamiento del bloqueo `cancelado_externamente`

El flag `cancelado_externamente` seguira existiendo para cuando el sistema detecte la eliminacion en otros contextos (ej: `verify-event`, o `check-availability-by-project`), pero al hacer un guardado explicito desde la UI de configuracion, se regenera el evento y se limpia el flag.

## Detalle tecnico del Step 3 corregido

```text
Para cada evento eliminado (deletedEvents):
  1. Calcular horaInicio, horaFin usando duracionMinutos
  2. Construir attendees (CC + reservaciones activas)
  3. Construir description con attendees
  4. Crear evento nuevo en Google Calendar (con Meet si es posible)
  5. UPDATE citas_calendar_events SET google_event_id = nuevo, cancelado_externamente = false
  6. Push a createdEvents con action: "regenerated"
```

## Archivos a modificar

- `supabase/functions/agendar-capacitacion/index.ts` - Step 3 de `create-recurring-meets`
