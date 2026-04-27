
## Diagnóstico: dónde se usa `manda_notificacion`

El endpoint `https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/manda_notificacion` está **hardcodeado en un único lugar**:

- **`supabase/functions/enviar-notificacion/index.ts`** (línea 8) — única definición de `N8N_WEBHOOK_URL`.

Esta edge function actúa como **proxy centralizado**. Todos los demás puntos del sistema NO llaman al webhook directamente; pasan por `enviar-notificacion`.

### Callers del proxy `enviar-notificacion` (no requieren cambios)

**Frontend** (vía `supabase.functions.invoke('enviar-notificacion', ...)`):
1. `src/pages/admin/ComisionesExternas.tsx` (línea 435)
2. `src/pages/admin/Inmobiliarias.tsx` (líneas 581 y 1168)

**Edge Functions** (vía fetch a `${SUPABASE_URL}/functions/v1/enviar-notificacion`):
3. `supabase/functions/enviar-aviso-bulk/index.ts` (línea 326) — envío masivo de avisos de cobranza
4. `supabase/functions/evaluar-triggers-evento/index.ts` (línea 707) — disparadores cron de notificaciones
5. `supabase/functions/generar-factura-comision-sozu/index.ts` (línea 287)
6. `supabase/functions/notificar-agentes/index.ts` (línea 274)
7. `supabase/functions/registro-inmobiliaria-publica/index.ts` (línea 344)
8. `supabase/functions/timbrar-factura-comision-sozu/index.ts` (línea 230)

**Conclusión**: como todo pasa por la edge function proxy, basta con modificar **un solo archivo** para que el endpoint sea dinámico.

El secreto `N8N_WEBHOOK_BASE_URL` ya existe en el entorno (lo usan `generar-factura-comision-sozu`, `timbrar-factura-comision-sozu` y `trigger-sat-notification`), por lo que no hace falta crearlo.

---

## Plan de cambios

### 1. Modificar `supabase/functions/enviar-notificacion/index.ts`

Reemplazar la constante hardcodeada por una construcción dinámica desde el secreto:

```ts
const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
if (!n8nBaseUrl) {
  return new Response(
    JSON.stringify({ error: 'N8N_WEBHOOK_BASE_URL no está configurado' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
const N8N_WEBHOOK_URL = `${n8nBaseUrl.replace(/\/$/, '')}/manda_notificacion`;
```

- Se normaliza la base eliminando una posible barra final.
- Se concatena `/manda_notificacion` para preservar el path exacto.
- Se valida que el secreto exista, devolviendo 500 con mensaje claro si falta.
- La validación se hace dentro del handler (no a nivel de módulo) para devolver un error HTTP útil en lugar de romper el cold start.

### 2. Redeploy automático

Lovable redespliega `enviar-notificacion` automáticamente al guardar el archivo.

### 3. Cómo alternar entre producción y test después del cambio

Se hace **únicamente** actualizando el secreto `N8N_WEBHOOK_BASE_URL` en Supabase Edge Function Secrets, sin tocar código:

- Producción: `https://automatizacion-n8n.fbqqbe.easypanel.host/webhook`
- Pruebas: `https://automatizacion-n8n.fbqqbe.easypanel.host/webhook-test`

> Nota importante: este secreto también lo consumen otras 3 edge functions (facturación SAT, timbrado, trigger SAT). Cambiarlo a `webhook-test` afectará también a esos flujos. Si se necesita aislar solo las notificaciones, se podría introducir un secreto separado (ej. `N8N_NOTIFICACION_BASE_URL`) con fallback a `N8N_WEBHOOK_BASE_URL`. Esto NO se incluye en el plan; solo se menciona como consideración.

---

## Resultado esperado

- El endpoint `manda_notificacion` deja de estar hardcodeado.
- Cambiar de `webhook` (prod) a `webhook-test` (pruebas) se hace en segundos desde la configuración de secretos de Supabase.
- Todas las rutas que envían notificaciones (avisos de cobranza, registro de inmobiliarias, comisiones externas, facturas Sozu, notificación de agentes, triggers de eventos) heredarán automáticamente el cambio porque todas pasan por el proxy `enviar-notificacion`.
- Cero cambios necesarios en frontend ni en las otras 8 funciones que invocan al proxy.
