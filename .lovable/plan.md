
# Plan: Corregir Inconsistencia del Indicador de Progreso de Entrega

## Problema Identificado

La cuenta 522 muestra:
- **Listado**: Restante = $0.18 (correcto, basado en pagos reales)
- **Progreso para Entrega**: 3 circulos verdes (incorrecto, dice que todo esta completado)

El indicador de progreso marca la etapa "Pagos" como completada porque todos los 39 acuerdos tienen `pago_completado = true`. Sin embargo, la suma de los acuerdos ($3,061,803.86) es menor que el `precio_final` ($3,061,804.04), dejando $0.18 pendientes.

---

## Causa Raiz

Ambos componentes (`PropertyProgressBadge` y `PropertyProgressTimeline`) calculan el progreso de pagos basandose UNICAMENTE en si los acuerdos tienen `pago_completado = true`, sin verificar que la suma real de pagos iguale o supere el `precio_final`.

**Logica actual (incorrecta)**:
```typescript
const pagosTodos = acuerdosPago?.filter(a => a.id_concepto !== 9) ?? [];
const pagosCompletados = pagosTodos.filter(p => p.pago_completado).length;
// Marca como completo si X/X acuerdos estan pagados - IGNORA el restante
```

---

## Solucion Propuesta

Agregar una nueva condicion en la etapa "Pagos" que valide que el saldo pendiente sea <= $0.01. Esta condicion usara el valor `restante` que ya se calcula en la RPC (precio_final - suma de pagos).

### Cambios en PropertyProgressBadge.tsx

1. **Agregar nueva prop `restante`** a la interfaz:
```typescript
interface PropertyProgressBadgeProps {
  cuentaId: number;
  estatusActual: number;
  restante?: number; // NUEVO
  cuentaDetalle?: {...};
}
```

2. **Agregar condicion de saldo pendiente** en la etapa "Pagos":
```typescript
// Nueva condicion: Saldo pendiente
const saldoPagado = (restante ?? 0) <= 0.01;
pagosConditions.push({
  label: 'Saldo cubierto',
  completed: saldoPagado,
  detail: saldoPagado ? 'Sin saldo pendiente' : `Restante: $${(restante ?? 0).toFixed(2)}`
});
```

3. **Actualizar logica de "Escrituracion"** para usar la misma validacion de saldo:
```typescript
// En lugar de solo verificar acuerdos, verificar saldo real
const cuentaPagada = (restante ?? 0) <= 0.01;
```

### Cambios en PropertyProgressTimeline.tsx

Aplicar los mismos cambios:
1. Agregar prop `restante` a la interfaz
2. Agregar condicion "Saldo cubierto" en la etapa Pagos
3. Usar `restante` para determinar si la cuenta esta pagada en Escrituracion

### Cambios en Pagos.tsx (listado)

Pasar el prop `restante` al componente:
```typescript
<PropertyProgressBadge 
  cuentaId={cuenta.id} 
  estatusActual={cuenta.id_estatus_disponibilidad}
  restante={cuenta.restante}  // NUEVO
/>
```

### Cambios en EditCuentaCobranzaDialog.tsx (modal de edicion)

Pasar el prop `restante` al componente `PropertyProgressTimeline`:
```typescript
<PropertyProgressTimeline
  cuentaId={cuentaId}
  propiedadId={propiedadId}
  estatusActual={estatusActual}
  restante={cuentaData?.restante ?? 0}  // NUEVO
  cuentaDetalle={cuentaDetalle}
/>
```

---

## Resultado Esperado

| Cuenta | Antes | Despues |
|--------|-------|---------|
| 522 | 3 circulos verdes (incorrecto) | Primer circulo azul con "39/39 pagos, Saldo: $0.18 pendiente" |
| 326 | Verde (correcto) | Sin cambio si el restante es $0.00 |

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/PropertyProgressBadge.tsx` | Agregar prop `restante`, nueva condicion "Saldo cubierto", usar restante en Escrituracion |
| `src/components/admin/PropertyProgressTimeline.tsx` | Agregar prop `restante`, nueva condicion "Saldo cubierto", usar restante en Escrituracion |
| `src/pages/admin/Pagos.tsx` | Pasar `restante={cuenta.restante}` al PropertyProgressBadge |
| `src/components/admin/EditCuentaCobranzaDialog.tsx` | Pasar `restante` al PropertyProgressTimeline |

---

## Beneficios

1. **Consistencia visual**: El progreso de entrega ahora reflejara la misma logica que el campo "Restante" del listado
2. **Deteccion de discrepancias**: Si hay diferencia entre suma de acuerdos y precio final, el usuario vera que falta cubrir el saldo
3. **Sin regresiones**: Las cuentas donde restante = 0 seguiran mostrando verde como antes
