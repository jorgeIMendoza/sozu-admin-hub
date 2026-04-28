# Plan: Inyectar `URL_WA_base` / `instanciaWA` en notificaciones de pago manual

## Problema

Cuando se aplica un **pago manual** desde `AddManualPaymentDialog`, el frontend llama directamente al webhook de N8N `${N8N_WEBHOOK_BASE_URL}/aplicaPago`. Ese workflow internamente arma el payload de notificación (con `templateId`, `mensajeWA`, recibo PDF, etc.) y dispara el envío de Email + WhatsApp, pero **nunca recibe** los campos `URL_WA_base`, `instanciaWA` ni `urlEndpointWA`. Resultado: WhatsApp termina usando un valor por defecto/cableado ("Pruebas de todo") en vez de la instancia real definida en el secret `INSTANCIA_EVOLUTION_WHATSAPP`.

A diferencia, el flujo de avisos automáticos pasa por la edge function `enviar-notificacion` que sí inyecta esos campos desde los secrets antes de reenviar a N8N.

## Solución

Hacer que el flujo de pago manual también pase por una capa de proxy que inyecte la configuración WA desde los secrets. Como el endpoint de N8N en este caso es **`/aplicaPago`** (no `/manda_notificacion`) y el payload tiene una estructura distinta, lo más limpio es **extender la edge function `enviar-notificacion`** para soportar un endpoint configurable, o crear una helper análoga.

### Cambios

**1. `supabase/functions/enviar-notificacion/index.ts`**

- Aceptar un campo opcional `n8nPath` en el body (ej: `"aplicaPago"`). Si no viene, mantener el comportamiento actual (`manda_notificacion`).
- Inyectar siempre `URL_WA_base`, `instanciaWA` y además `urlEndpointWA` (alias por compatibilidad con N8N) en el `enrichedBody`, sin importar el endpoint destino.
- Mantener el reenvío del header `apikey` (`EVOLUTION_WA_COBRANZA_TOKEN`).

**2. `src/components/admin/AddManualPaymentDialog.tsx`** (línea 541-561)

- Reemplazar el `fetch` directo a `${N8N_WEBHOOK_BASE_URL}/aplicaPago` por:
  ```ts
  await supabase.functions.invoke('enviar-notificacion', {
    body: { ...webhookBody, n8nPath: 'aplicaPago' },
    headers: { apikey: EVOLUTION_WA_COBRANZA_TOKEN } // si aplica
  })
  ```
- Mantener exactamente el mismo `webhookBody` que hoy se envía; los campos WA los añadirá la edge function.

**3. Validar otros flujos análogos** (mismo bug latente):
- `src/components/admin/CancelCuentaDialog.tsx` (`/aplicaPago`)
- `src/components/admin/EditCuentaCobranzaDialog.tsx` (`/aplicaPago`)
- `src/components/admin/FacturasTab.tsx` (`/generaFactura`)

Si el equipo confirma que también disparan notificaciones WA por dentro del workflow, aplicar el mismo enrutamiento por `enviar-notificacion` con el `n8nPath` correspondiente. (Para el alcance inmediato me limito a **pago manual**; los demás se pueden hacer en una segunda iteración si confirmas.)

## Verificación post-deploy

1. Aplicar un pago manual de prueba.
2. En **Edge Function logs** de `enviar-notificacion`, confirmar el log:
   `WA config -> URL_WA_base: ... | instanciaWA: <valor real del secret>`
3. En N8N (`aplicaPago`), inspeccionar el body recibido y verificar que `URL_WA_base`, `instanciaWA` y `urlEndpointWA` ya estén presentes con los valores correctos (no "Pruebas de todo").
4. Confirmar que el WhatsApp llega al cliente desde la instancia productiva.

## Alcance

- **Sí** incluye: edge function `enviar-notificacion` + `AddManualPaymentDialog.tsx`.
- **No** incluye (a menos que lo apruebes ahora): cancelación de cuenta, edición de cuenta y generación de factura. Avísame y lo agrego al mismo plan.
