

## Corregir error al liberar propiedad en juicio terminado

### Qué está pasando

En el flujo **Juicio Terminado → Liberar propiedad**, el código intenta registrar la devolución al cliente como un **acuerdo de pago con monto negativo** (concepto 9 - "Devolución de pago"):

```ts
// JuicioTerminadoDialog.tsx, línea 155
monto: -montoDevolucion,  // -1,243,715.03
```

Pero la tabla `acuerdos_pago` tiene una restricción en la base de datos:

```sql
CHECK (monto >= 0 AND monto = round(monto, 2))
```

Es decir, **no se permiten montos negativos** en `acuerdos_pago`. Por eso PostgreSQL rechaza el INSERT con el error 23514 (`chk_acpago_monto_positivo`) y la transacción aborta. Como además todo se ejecuta sin transacción explícita, lo que ya se insertó antes (los documentos del juicio y posiblemente el acuerdo de cancelación con monto positivo) queda en la base, dejando datos basura.

Esto también explica por qué la imagen muestra "Devolución al cliente: $1,243,715.03" en verde — el cálculo está correcto, pero la forma de persistirlo viola las reglas del esquema.

### Solución propuesta

Alinear el flujo de "Juicio Terminado → Liberar" con el patrón ya usado en cancelaciones normales (`CancelCuentaDialog`), que sí respeta la convención de la BD: **las devoluciones se registran como pagos con monto positivo y un concepto que las distingue** (concepto 9 - Devolución), no como acuerdos negativos.

**Cambios en `src/components/admin/JuicioTerminadoDialog.tsx`** (función `agregarPagosCancelacionYDevolucion`):

1. **Acuerdo de cancelación (concepto 7)**: se mantiene igual — INSERT en `acuerdos_pago` con `monto = montoCancelacion` (positivo). ✓
2. **Devolución al cliente (concepto 9)**: en lugar de insertar un `acuerdos_pago` con monto negativo, se hará lo mismo que hace el flujo de cancelación estándar:
   - Verificar el patrón exacto en `CancelCuentaDialog.tsx` (registro como `pagos` con concepto 9, o como ajuste a aplicaciones existentes — confirmar al implementar).
   - Replicar ese mismo mecanismo aquí para que la devolución quede trazada correctamente sin violar la restricción.
3. **Robustez**: envolver el bloque "documentos + acuerdos + actualización de cuenta + actualización de propiedad" para que, si una etapa falla, no queden documentos huérfanos. Como Supabase JS no permite transacciones multi-tabla desde el cliente, se mover la lógica de inserción de acuerdos **antes** de subir los registros de documentos a la BD (los archivos en Storage ya están subidos antes de confirmar, eso no cambia), o bien implementar limpieza compensatoria si falla el paso crítico.

### Verificación post-cambio

- Reabrir el diálogo "Juicio Terminado" sobre la cuenta 318 (la del error).
- Seleccionar "Liberar propiedad" + "Rescisión por demanda", monto cancelación 366,247.88.
- Confirmar que:
  - Se registra el acuerdo de cancelación por $366,247.88 (concepto 7).
  - Se registra la devolución de $1,243,715.03 conforme al estándar de cancelaciones (concepto 9, monto positivo).
  - La cuenta queda `activo = false`, tipo cancelación = 2.
  - La propiedad pasa a estatus 2 (Disponible) con nueva CLABE generada.
  - No aparece el error de constraint.

### Archivos afectados

- `src/components/admin/JuicioTerminadoDialog.tsx` — único archivo a modificar.
- Sin migraciones de BD (la restricción `chk_acpago_monto_positivo` es correcta y debe respetarse).
- Sin cambios en RLS.

### Notas

- El mismo bug podría existir si alguien volvió a procesar liberaciones desde otra UI; por eso conviene dejar la lógica alineada al estándar global de cancelaciones (memoria `collection-accounts/cancellation-data-standard`).
- El monto en la imagen (`-1243715.03`) confirma exactamente el cálculo `totalPagado - montoCancelacion = 1,609,962.91 - 366,247.88 = 1,243,715.03`, multiplicado por -1 al insertar.

