

## Plan: Corregir error de CLABE duplicada al generar ofertas con esquema de pago

### Problema
Al generar ofertas **con** esquemas de pago seleccionados para propiedades con bodega, la segunda oferta (bodega) falla con error `23505: duplicate key value violates unique constraint "ofertas_clabe_stp_tmp_producto_key"`.

La causa raíz es que `clearSourceOfferClabes` (que libera la CLABE de ofertas anteriores) se ejecuta **después** del INSERT, pero el INSERT ya falla porque la CLABE aún existe en la oferta anterior.

Sin esquemas de pago, `clabeData` es `null` y no se asigna CLABE, por lo que no hay conflicto.

### Solución

**Archivo:** `src/components/admin/NewOfferDialog.tsx`

**Cambio único:** Mover el bloque de `clearSourceOfferClabes` de **después** del INSERT exitoso a **antes** del INSERT.

Secuencia actual:
1. Obtener/crear CLABE → 2. INSERT oferta → 3. Limpiar CLABEs de ofertas fuente ❌

Secuencia corregida:
1. Obtener/crear CLABE → 2. **Limpiar CLABEs de ofertas fuente** → 3. INSERT oferta ✅

Esto es mover ~5 líneas dentro de la misma función. No se modifican otros archivos.

