
## Problema

En el modal "Editar Cuenta de Cobranza" el campo **Fecha de Compra** se guarda en `cuentas_cobranza.fecha_compra` (ver `EditCuentaCobranzaDialog.tsx` línea 1119–1142, mutation `updateFechaCompraMutation`).

Sin embargo, el PDF de Estado de Cuenta NO lee ese campo. Lee `ofertas.fecha_generacion`, que es la fecha en la que se generó la oferta original y nunca cambia cuando el usuario actualiza la fecha de compra de la cuenta.

Archivos afectados:
- `supabase/functions/generar-estado-cuenta/index.ts` línea 327:
  ```ts
  if (oferta.fecha_generacion) detailsRight.push({ label: 'Fecha de compra:', value: formatDate(oferta.fecha_generacion) });
  ```
- `src/services/estadoCuentaService.ts` línea 462: mismo patrón con `data.oferta.fecha_generacion`.

Por eso la cuenta 82 sigue mostrando 24/11/2025 (la fecha original en `ofertas`) aunque actualizaste a 21/05/2024 en `cuentas_cobranza.fecha_compra`.

## Cambios propuestos

1. **Edge Function `generar-estado-cuenta`**
   - Incluir `fecha_compra` en el SELECT de `cuentas_cobranza` (la consulta principal de la cuenta).
   - En el bloque que arma `detailsRight`, usar `cuenta.fecha_compra` con fallback a `oferta.fecha_generacion` si está vacío:
     ```ts
     const fechaCompraMostrada = cuenta.fecha_compra || oferta.fecha_generacion;
     if (fechaCompraMostrada) detailsRight.push({ label: 'Fecha de compra:', value: formatDate(fechaCompraMostrada) });
     ```

2. **Servicio cliente `src/services/estadoCuentaService.ts`**
   - Asegurar que `data.cuenta.fecha_compra` se traiga del query (revisar el fetch que arma `data`) y aplicar el mismo fallback en línea 462.

3. **No se requieren cambios de DB** — la columna `cuentas_cobranza.fecha_compra` ya existe y se está actualizando correctamente.

## Verificación

- Regenerar el estado de cuenta de la cuenta 82 y confirmar que ahora muestre **21/05/2024**.
- Confirmar que cuentas sin `fecha_compra` editada sigan mostrando `oferta.fecha_generacion` (fallback).
