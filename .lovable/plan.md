

## Plan: Agregar Domain-Wide Delegation (subject/sub) al JWT de la cuenta de servicio

### Problema actual
La función `getAccessToken` genera un JWT sin el campo `sub`, por lo que Google Calendar ve las operaciones como hechas por la cuenta de servicio directamente. Esto impide que los invitados reciban correos de notificación del evento.

### Cambio necesario

**Archivo**: `supabase/functions/agendar-capacitacion/index.ts`

1. **Modificar `getAccessToken`** para aceptar un parámetro opcional `subject` (el email del dueño del calendario) y agregarlo al payload JWT:
   ```
   sub: subject  // e.g. "jorge.mendoza@sozu.com"
   ```

2. **Actualizar la llamada** a `getAccessToken(sa)` → `getAccessToken(sa, calendarOwnerEmail)` en el `Deno.serve` principal (línea 519), para que el token se genere impersonando al dueño del calendario.

3. Agregar el scope `https://www.googleapis.com/auth/calendar.events` al JWT (ya lo tienes en el Admin Console, pero el código solo pide `calendar`).

### Detalle técnico

```text
// Antes (línea 18-23):
payload = { iss, scope: "...calendar", aud, iat, exp }

// Después:
payload = { iss, sub: subject, scope: "...calendar ...calendar.events", aud, iat, exp }
```

La llamada cambia de:
```text
const token = await getAccessToken(sa);
```
A:
```text
const token = await getAccessToken(sa, calendarOwnerEmail);
```

Esto hará que Google Calendar trate las operaciones como si las hiciera el usuario real (calendarOwnerEmail), permitiendo el envío automático de correos a los invitados.

