

## Diagnóstico

El error ocurre en la **llamada interna** de `notificar-agentes` hacia `enviar-notificacion` (linea 186-193). La función `enviar-notificacion` NO existe en este repositorio (no está en `supabase/functions/`), lo que significa que está desplegada externamente en tu proyecto Supabase.

El problema es que la llamada usa solo `Authorization: Bearer ${supabaseServiceKey}`, pero falta el header `apikey` que Supabase requiere para rutear y autenticar llamadas a Edge Functions.

Otras funciones en el proyecto que llaman a `enviar-notificacion` (como `registro-inmobiliaria-publica`, `generar-factura-comision-sozu`) usan el mismo patrón incorrecto, pero posiblemente no han fallado porque se invocan con menos frecuencia o en contextos diferentes.

## Plan de corrección

### Archivo: `supabase/functions/notificar-agentes/index.ts`

Agregar el header `apikey` con el anon key al hacer la llamada interna a `enviar-notificacion`:

```typescript
// Líneas 186-193 - Cambiar de:
const notifResponse = await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceKey}`,
  },
  body: JSON.stringify(notificationPayload),
});

// A:
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const notifResponse = await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'apikey': supabaseAnonKey,
  },
  body: JSON.stringify(notificationPayload),
});
```

Adicionalmente, agregar `notificar-agentes` a `supabase/config.toml` con `verify_jwt = false` si no está ya (actualmente no aparece en el archivo).

### Verificación

Después de desplegar, re-ejecutar la prueba desde n8n con el mismo payload para confirmar que el 401 se resuelve.

