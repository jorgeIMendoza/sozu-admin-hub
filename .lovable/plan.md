

# Plan: Corregir Filtro de "Comisiones Externas" para Mostrar Cuentas con Comisión Pagada a Sozu

## Problema Identificado

La cuenta 1671 no aparece en la vista de "Comisiones externas" a pesar de que:
1. El rollback se ejecutó correctamente (`comisionistas.pagada = false`, `comisionistas.aprobada = false`)
2. Los datos están correctos en la base de datos
3. La oferta y propiedades existen y están vinculadas

**Causa Raíz**: La vista "Comisiones externas" actualmente muestra TODAS las comisiones de agentes externos sin importar si la comisión general de la cuenta ya fue pagada a Sozu (`es_pagada_comision_venta`). Sin embargo, según el flujo de negocio establecido en la documentación:

> Las comisiones externas solo deben entrar en este flujo después de que la comisión de venta haya sido pagada (a Sozu)

Esto significa que la vista **debería filtrar** únicamente las cuentas donde `cuentas_cobranza.es_pagada_comision_venta = true`.

## Solución Propuesta

Modificar la query en `fetchExternalAgentCommissions()` para incluir un filtro adicional que solo traiga comisionistas de cuentas donde la comisión de venta ya fue pagada.

### Cambio 1: Agregar campo `es_pagada_comision_venta` a la query

Modificar la query de Supabase (líneas 70-113) para incluir el campo `es_pagada_comision_venta`:

```typescript
cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
  id,
  precio_final,
  es_pagada_comision_venta,  // <- NUEVO
  acuerdos_pago!fk_acpago_cuenta(
    ...
  ),
  ...
)
```

### Cambio 2: Filtrar en el procesamiento de datos

En el `reduce` de agrupación (líneas 238-288), agregar una condición para solo incluir cuentas donde `es_pagada_comision_venta = true`:

```typescript
const grouped = comisionistas.reduce((acc: any, com: any) => {
  const cuenta = com.cuentas_cobranza;
  
  // Solo incluir cuentas donde la comisión de venta ya fue pagada
  if (!cuenta.es_pagada_comision_venta) return acc;
  
  // ... resto del código
}, {});
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/ComisionesExternas.tsx` | Agregar `es_pagada_comision_venta` a la query y filtrar solo cuentas pagadas |

## Resultado Esperado

Después de implementar estos cambios:
1. Solo aparecerán en "Comisiones externas" las cuentas donde `es_pagada_comision_venta = true`
2. La cuenta 1671 aparecerá porque `es_pagada_comision_venta = true` (fue simulado anteriormente)
3. El flujo será consistente: primero se paga la comisión general a Sozu, luego se gestionan las comisiones individuales a agentes externos

## Notas Técnicas

- Este cambio alinea la implementación con el flujo de negocio documentado
- Las cuentas con `es_pagada_comision_venta = false` seguirán apareciendo en las vistas generales de "Comisiones" y "Aprobación de comisiones"
- El filtro de "Pagar comisiones" general continuará funcionando de forma independiente

