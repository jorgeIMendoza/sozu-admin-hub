
# Plan: Agregar filtro `es_draft=false` en SATNotificationService

## Problema Identificado
El servicio `SATNotificationService` actualmente no filtra documentos de factura por el campo `es_draft`. Esto causa que facturas en estado borrador (draft) sean consideradas como válidas para habilitar el botón de notificación SAT.

## Cambios Requeridos

### Archivo: `src/services/satNotificationService.ts`

**Modificación 1: Query de Factura PDF (líneas 64-71)**
Agregar `.eq('es_draft', false)` a la consulta de factura PDF para asegurar que solo facturas finales sean consideradas.

**Modificación 2: Query de Factura XML (líneas 77-84)**
Agregar `.eq('es_draft', false)` a la consulta de factura XML para asegurar que solo facturas finales sean consideradas.

## Detalles Técnicos

```typescript
// Query Factura PDF - ANTES:
const { data: facturaPdf } = await supabase
  .from('documentos')
  .select('id, id_estatus_verificacion')
  .eq('id_cuenta_cobranza', cuentaCobranzaId)
  .eq('id_tipo_documento', 22)
  .eq('activo', true)
  .order('fecha_creacion', { ascending: false })
  .limit(1);

// Query Factura PDF - DESPUÉS:
const { data: facturaPdf } = await supabase
  .from('documentos')
  .select('id, id_estatus_verificacion')
  .eq('id_cuenta_cobranza', cuentaCobranzaId)
  .eq('id_tipo_documento', 22)
  .eq('activo', true)
  .eq('es_draft', false)  // ← NUEVO FILTRO
  .order('fecha_creacion', { ascending: false })
  .limit(1);
```

```typescript
// Query Factura XML - ANTES:
const { data: facturaXml } = await supabase
  .from('documentos')
  .select('id, id_estatus_verificacion')
  .eq('id_cuenta_cobranza', cuentaCobranzaId)
  .eq('id_tipo_documento', 21)
  .eq('activo', true)
  .order('fecha_creacion', { ascending: false })
  .limit(1);

// Query Factura XML - DESPUÉS:
const { data: facturaXml } = await supabase
  .from('documentos')
  .select('id, id_estatus_verificacion')
  .eq('id_cuenta_cobranza', cuentaCobranzaId)
  .eq('id_tipo_documento', 21)
  .eq('activo', true)
  .eq('es_draft', false)  // ← NUEVO FILTRO
  .order('fecha_creacion', { ascending: false })
  .limit(1);
```

## Resultado Esperado

Con estos cambios:
- Solo facturas finales (no draft) serán consideradas para habilitar el botón SAT
- `tieneFacturaPdf` y `tieneFacturaXml` solo serán `true` si existen documentos con `es_draft=false`
- La condición `canGenerate` requerirá facturas finales verificadas, no borradores
