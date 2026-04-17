
## Cómo funcionan hoy "Monto" y "Saldo" en Estado de Cuenta

En `CobranzaExpediente.tsx` (tab Estado de Cuenta) la tabla "Movimientos Financieros" se construye así:

1. Se mezclan dos fuentes en una línea de tiempo:
   - **Parcialidades** (acuerdos) → renderizadas como `cargo` con la `fecha_pago` (que en tu modelo es la **fecha de vencimiento**) y `monto` positivo.
   - **Pagos** → renderizados como `pago` con `fecha_pago` real y `monto`.
2. Se ordenan por fecha ascendente.
3. Se acumula un `saldo` corriendo: `saldo += cargo` o `saldo -= pago`.

### Por qué se ve raro en tu screenshot
- **Monto en pagos sale negativo y en verde** (`-$242,416.00`): el código fuerza un `'-'` delante del monto en pagos. Visualmente parece "saldo a favor", pero en realidad es solo "abono".
- **Saldo arranca negativo** (`-$242,416.00` el 17 abr 2023): porque ese día el primer movimiento fue un **pago** (Efectivo - Enganche) y el cargo de la Parc. 1 quedó registrado con fecha del 18 abr. El acumulador resta antes de sumar el cargo, generando un saldo negativo temporal.
- **No se muestran las multas** en lo absoluto, aunque existen en la tabla `multas` ligadas a `acuerdos_pago` (con `es_pagada`, `monto`, `descripcion`).

---

## Propuesta de mejora

### A. Rediseño de columnas (UX)

Reemplazar `Monto` + `Saldo` por columnas separadas y claras, estilo estado de cuenta bancario:

```text
Fecha | Tipo | Concepto | Referencia | Cargo (+) | Abono (−) | Saldo
```

- **Cargo**: solo se llena cuando es parcialidad o multa (color neutro/foreground).
- **Abono**: solo se llena cuando es pago (color success, sin signo `-` redundante).
- **Saldo**: corre acumulado; pintado en `text-warning` si > 0 (debe), `text-success` si ≤ 0 (al corriente o a favor), `text-danger` si vencido.
- Footer con totales: **Total cargos**, **Total abonos**, **Saldo final**.

### B. Orden estable y arranque limpio del saldo

- Ordenar por `(fecha asc, prioridad asc)` donde `cargo` tiene prioridad menor que `pago` el mismo día → así el saldo nunca arranca negativo por un pago anticipado al cargo del mismo día.
- Mostrar fila inicial "Saldo inicial: $0.00" para dar contexto.

### C. Incluir multas como un tercer tipo de movimiento

Sí, tiene mucho sentido incluirlas. Plan:

1. **Backend**: extender el RPC `get_expediente_cobranza` para devolver un array `multas`:
   ```sql
   SELECT m.id, m.monto, m.descripcion, m.fecha_creacion, m.es_pagada,
          m.id_acuerdo_pago, ap.fecha_pago AS fecha_acuerdo
   FROM multas m
   JOIN acuerdos_pago ap ON ap.id = m.id_acuerdo_pago
   WHERE ap.id_cuenta_cobranza = p_cuenta_id
     AND m.activo = true AND ap.activo = true
   ```
2. **Tipado**: agregar `ExpedienteMulta` en `useExpedienteCobranza.ts` y exponerlo en el `Expediente`.
3. **UI Estado de Cuenta**: insertar las multas como movimientos `tipo: 'multa'` con chip rojo (`bg-danger-bg text-danger`), columna **Cargo** llena, concepto = `Multa · {descripcion}`, fecha = `fecha_creacion`. Si `es_pagada = true`, marcar visualmente con un check pequeño junto al concepto.
4. **KPI header**: agregar (opcional) un mini badge "Multas pendientes: $X" si hay multas activas no pagadas, junto a los KPIs existentes.

### D. Filtros y mejoras menores

- Toggle arriba de la tabla: `Todos | Cargos | Pagos | Multas` para filtrar tipos.
- Buscador opcional por `Referencia` (clave de rastreo) cuando hay muchos pagos STP.
- Resaltar la fila del último movimiento con un borde sutil.

---

## Cambios técnicos a aplicar

1. **Migración SQL**: actualizar `get_expediente_cobranza` para incluir `multas` en el JSON de retorno.
2. **`src/hooks/useExpedienteCobranza.ts`**: añadir interface `ExpedienteMulta` y campo `multas` en `Expediente`.
3. **`src/pages/admin/portal-cobranza/CobranzaExpediente.tsx`**:
   - Rehacer `EstadoCuentaTab`: nuevas columnas Cargo/Abono/Saldo, footer con totales, ordenamiento estable, integración de multas, filtro por tipo.
   - Actualizar `Resumen` (header) con badge "Multas pendientes" si aplica.

## Pregunta rápida

¿Quieres que las **multas pagadas** también se muestren en el estado de cuenta (con su pago correspondiente generando el abono), o solo las **pendientes**? Por defecto propongo **mostrar todas** (pagadas y pendientes) para tener trazabilidad completa, igual que con parcialidades.
