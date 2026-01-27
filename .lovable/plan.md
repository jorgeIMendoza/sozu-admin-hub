
# Plan: Deshabilitar Triggers de Notificación SAT

## Resumen
Deshabilitar temporalmente los dos triggers que automatizan la generación de notificaciones SAT, sin eliminarlos para poder reactivarlos en el futuro.

## Triggers a Deshabilitar

| Trigger | Tabla | Función que ejecuta | Propósito |
|---------|-------|---------------------|-----------|
| `on_property_pagada_completamente` | `propiedades` | `trigger_property_status_sat()` | Se dispara cuando el estatus cambia a 9 (Pagada completamente) |
| `on_document_insert_or_update_sat` | `documentos` | `trigger_document_insert_sat()` | Se dispara al insertar/actualizar documentos tipo 6, 21 o 22 |

## Migración SQL

```sql
-- Deshabilitar trigger en propiedades (cuando cambia a estatus 9)
ALTER TABLE public.propiedades DISABLE TRIGGER on_property_pagada_completamente;

-- Deshabilitar trigger en documentos (cuando se sube factura o CSF)
ALTER TABLE public.documentos DISABLE TRIGGER on_document_insert_or_update_sat;
```

## Detalles Técnicos

### Estados de Triggers en PostgreSQL
- **O (Origin)**: Trigger habilitado (estado actual)
- **D (Disabled)**: Trigger deshabilitado (estado objetivo)
- **R (Replica)**: Solo se dispara en sesiones de replicación
- **A (Always)**: Se dispara siempre, incluso durante replicación

### Cómo Reactivar en el Futuro
Cuando necesites volver a activar los triggers:

```sql
-- Reactivar trigger en propiedades
ALTER TABLE public.propiedades ENABLE TRIGGER on_property_pagada_completamente;

-- Reactivar trigger en documentos
ALTER TABLE public.documentos ENABLE TRIGGER on_document_insert_or_update_sat;
```

## Impacto
- Las notificaciones SAT ya **no se generarán automáticamente** cuando una propiedad cambie a estatus 9
- Las notificaciones SAT ya **no se generarán automáticamente** al subir documentos fiscales
- El proceso manual desde el diálogo `SATNotificationDialog` seguirá funcionando normalmente
- Las funciones `check_sat_notification_conditions`, `trigger_property_status_sat` y `trigger_document_insert_sat` permanecerán intactas

## Resultado Esperado
Después de aplicar esta migración, podrás ejecutar el UPDATE de las 53 propiedades sin que se dispare ningún proceso de notificación SAT automático.
