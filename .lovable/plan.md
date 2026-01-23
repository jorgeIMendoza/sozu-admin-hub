
# Plan: Corregir URL del Webhook N8N en la Función SAT

## Problema Identificado

La función `public.check_sat_notification_conditions` tiene una URL hardcodeada incorrecta:

```sql
-- Actual (incorrecto)
v_webhook_url TEXT := 'https://n8n.sozu.mx/webhook/generaNotificacionSAT';

-- Correcto (según configuración del proyecto)
v_webhook_url TEXT := 'https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/generaNotificacionSAT';
```

## Solución

Crear una migración SQL para actualizar la función `check_sat_notification_conditions` con la URL correcta del webhook N8N.

## Migración SQL

```sql
-- Actualizar función con la URL correcta del webhook
CREATE OR REPLACE FUNCTION public.check_sat_notification_conditions(p_cuenta_cobranza_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_propiedad_id INTEGER;
  v_estatus INTEGER;
  v_tiene_factura BOOLEAN;
  v_tiene_constancia BOOLEAN;
  v_tiene_archivo_sat BOOLEAN;
  v_webhook_url TEXT := 'https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/generaNotificacionSAT';
BEGIN
  -- [resto de la lógica existente sin cambios]
  ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

## Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/[timestamp]_fix_sat_webhook_url.sql` | Migración para corregir la URL del webhook |

## Nota Técnica

La URL correcta según la configuración del proyecto (`src/lib/config.ts`, `.env.production`, `.env.development`) es:
- **Base**: `https://automatizacion-n8n.fbqqbe.easypanel.host/webhook`
- **Endpoint completo**: `https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/generaNotificacionSAT`
