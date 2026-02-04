
# Plan: Corrección de Discrepancias en Saldos de Cuentas de Cobranza

## Problema Identificado

Se detectó una inconsistencia entre la vista de lista y la vista de detalle para calcular saldos:

| Vista | Fuente de "Pagado" | Ejemplo Cuenta 522 |
|-------|-------------------|-------------------|
| **Listado (RPC)** | `SUM(pagos.monto)` - suma real de pagos | $3,061,803.86 |
| **Detalle** | `SUM(aplicaciones.monto)` - suma de aplicaciones | $3,061,804.04 |

Esto causa que:
- El listado muestre "$0.18 restante" (correcto, basado en pagos reales)
- El detalle muestre "39/39 completados" (engañoso, basado en acuerdos)
- El indicador de progreso diga 100% aunque el precio no está cubierto

---

## Solucion

### Cambio en la Logica del Detalle

Modificar el calculo de `totalPagado` y `totalPendiente` en `DetalleCuentaCobranza.tsx` para usar la suma real de pagos en lugar de las aplicaciones, tal como lo hace la RPC del listado.

**Archivo a modificar**: `src/pages/admin/DetalleCuentaCobranza.tsx`

### Cambios Especificos

1. **Agregar query para obtener suma real de pagos**:
   ```typescript
   const { data: sumaPagosReal } = useQuery({
     queryKey: ["suma_pagos_real", cuentaId],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('pagos')
         .select('monto')
         .eq('id_cuenta_cobranza', cuentaId)
         .eq('activo', true);
       
       if (error) throw error;
       return data?.reduce((sum, p) => sum + Number(p.monto), 0) || 0;
     }
   });
   ```

2. **Modificar calculo de totales**:
   
   **Antes** (basado en aplicaciones):
   ```typescript
   const totalPagado = acuerdosPago?.reduce((sum, acuerdo) => {
     return sum + (acuerdo.aplicaciones || []).reduce(...);
   }, 0) || 0;
   ```
   
   **Despues** (basado en pagos reales):
   ```typescript
   // Usar suma real de pagos cuando este disponible
   const totalPagadoReal = sumaPagosReal || 0;
   
   // Calcular pendiente basado en pagos reales
   const diferenciaReal = (cuentaDetalle?.precio_final || 0) - totalPagadoReal;
   const totalPendiente = Math.max(0, diferenciaReal);
   ```

3. **Agregar indicador visual cuando hay diferencia** entre suma de acuerdos y precio final:
   - Si `precio_final - suma_acuerdos > 0.01`, mostrar badge de advertencia
   - Ejemplo: "El plan de pagos suma $0.18 menos que el precio"

4. **Mantener calculo de aplicaciones para el progreso de acuerdos individuales** (39/39):
   - El indicador 39/39 seguira basandose en `pago_completado` de cada acuerdo
   - Pero el total pagado/pendiente usara pagos reales

---

## Resumen de Cambios

| Elemento | Antes | Despues |
|----------|-------|---------|
| Total Pagado | `SUM(aplicaciones.monto)` | `SUM(pagos.monto)` |
| Total Pendiente | `precio - aplicaciones` | `precio - pagos` |
| Progreso X/Y | Sin cambio | Sin cambio |
| Alerta | No existe | Nueva: "Discrepancia en plan de pagos" |

---

## Secuencia de Implementacion

1. Agregar nueva query `suma_pagos_real` en DetalleCuentaCobranza
2. Usar ese valor para calcular `totalPagadoReal` y `totalPendiente`
3. Agregar alerta visual cuando suma de acuerdos no coincide con precio
4. Probar con cuentas 326 y 522 para verificar correccion
