

## Plan: Crear eventos en Google Calendar solo al agendar (no al configurar)

### Problema actual
Al guardar configuración de horarios, se llama `createRecurringMeetsMutation` que invoca `create-recurring-meets` en el edge function, creando eventos de Google Calendar para **todos** los slots configurados (ej. Lun-Sáb 9am-9pm). Esto satura el calendario del dueño con cientos de eventos vacíos.

### Cambios

#### 1. `ConfiguracionCitas.tsx` — Eliminar creación masiva de eventos al guardar
- **Línea 591**: Eliminar `if (calendarioEmail) createRecurringMeetsMutation.mutate();` del `onSuccess` de `saveHorariosMutation`
- Eliminar toda la definición de `createRecurringMeetsMutation` (líneas 596-643)
- Los slots configurados seguirán guardándose en `configuracion_citas_horarios` (BD) como ya ocurre

#### 2. `agendar-capacitacion/index.ts` — Deprecar acción `create-recurring-meets`
- Eliminar o comentar el bloque de la acción `create-recurring-meets` (línea ~952 en adelante)
- La acción `schedule` (que se ejecuta cuando un agente agenda una cita real) ya crea el evento en Google Calendar — eso se mantiene intacto
- Si la acción `schedule` busca instancias recurrentes previas (`findRecurringEventInstance`), simplificar para que siempre cree un evento standalone nuevo

#### 3. Sin cambios en BD ni en "Todas las Citas"
- `configuracion_citas_horarios` ya almacena los slots disponibles
- `TodasLasCitas.tsx` ya combina horarios configurados + reservas para pintar la grilla (gris = disponible, color = agendada)
- No se necesita columna JSON adicional

### Resultado
- Al guardar configuración: solo se guardan los horarios en BD, **sin tocar Google Calendar**
- Al agendar una cita (agente inmobiliario): se crea el evento en Google Calendar con Meet link, asistentes y enterados
- El calendario del dueño deja de saturarse con eventos vacíos

