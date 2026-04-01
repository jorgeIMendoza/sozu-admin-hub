

# Agregar agente como attendee visible y ocultar organizador

## Resumen
Modificar la Edge Function `agendar-capacitacion` para que los attendees del evento incluyan el nombre del agente y la propiedad `organizer: false` en el dueño del calendario, de modo que el prospecto vea quién lo atenderá.

## Cambios en `supabase/functions/agendar-capacitacion/index.ts`

### 1. Cambiar tipo de attendees a objetos enriquecidos
Actualmente los attendees son `{ email: string }[]`. Se cambiará a `{ email: string; displayName?: string; organizer?: boolean; responseStatus?: string }[]` para soportar nombre y control de organizer.

### 2. Agregar `displayName` al agente
En la sección donde se agrega al agente (línea ~1180), incluir `displayName: agentName` para que el prospecto vea el nombre del agente en la invitación.

### 3. Agregar al dueño del calendario con `organizer: false`
Cuando el calendario destino (scheduleCalendarId) sea diferente al email del agente, se agregará como attendee con `organizer: false` para que no aparezca como organizador visible ante los demás invitados.

### 4. Actualizar `createCalendarEvent`
Cambiar el tipo del parámetro `attendees` de `{ email: string }[]` a un tipo más amplio que acepte `displayName` y `organizer`.

## Detalle técnico

```text
Antes (attendees):
  [{ email: prospecto }, { email: agente }, { email: enterado1 }]

Después (attendees):
  [
    { email: prospecto },
    { email: agente, displayName: "Nombre Agente" },
    { email: enterado1 },
    { email: calendario_owner, organizer: false }  // si aplica
  ]
```

> Nota: Google Calendar solo permite cambiar `organizer` si el evento se crea con DWD (Domain-Wide Delegation). Si no se usa DWD, Google ignorará la propiedad silenciosamente, sin causar error.

