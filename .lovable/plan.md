

# Plan: Factura Comision Sozu en vista de Comisiones + Detalle de Cuenta

## Resumen

Mover la columna "Fact. Comision Sozu" de la vista de **Pagar Comisiones** a la vista de **Comisiones** (`src/pages/admin/Comisiones.tsx`). Ademas, agregar la posibilidad de **generar** la factura manualmente si aun no existe y la propiedad ya esta en estatus Vendido. Tambien agregar indicadores y acciones en el **Detalle de Cuenta de Cobranza**.

## Cambios en la vista de Comisiones (`Comisiones.tsx`)

1. **Query**: Agregar `id_documento_factura_comision_sozu` al SELECT de `cuentas_cobranza`. Obtener las facturas de tipo 47 (Factura de comision de venta Sozu) para mapear el estado (Draft/Timbrada/No existe) y tambien obtener el `id_estatus_disponibilidad` de la propiedad para saber si esta en Vendido (5).

2. **Nueva columna "Fact. Comision Sozu"** en la tabla:
   - **Sin factura + propiedad Vendida**: Boton "Generar" que invoca la Edge Function `generar-factura-comision-sozu`
   - **Sin factura + propiedad NO vendida**: Texto "-" o "No aplica"
   - **Draft**: Badge amarillo "Draft" + boton "Timbrar"
   - **Timbrada**: Badge verde "Timbrada" + icono para ver/descargar

3. **Acciones**: Dialogo de confirmacion para Timbrar (reutilizando la logica que ya existe en `ComisionesPorPagarTab.tsx`) y boton de Generar con loading state.

## Cambios en Detalle de Cuenta (`DetalleCuentaCobranza.tsx`)

1. **Query**: Incluir `id_documento_factura_comision_sozu` en la consulta principal.
2. **Indicador en header**: Mostrar un Badge junto al ID de la cuenta indicando el estado de la factura Sozu (No generada / Draft / Timbrada).
3. **Acciones**: Boton para generar la factura si no existe (y propiedad esta en Vendido), y boton para timbrar si esta en Draft.

## Limpieza en Pagar Comisiones

Mantener la columna en `PagarComisiones.tsx` / `ComisionesPorPagarTab.tsx` como esta, ya que es util tenerla ahi tambien. No se elimina.

---

## Detalle Tecnico

### Archivo: `src/pages/admin/Comisiones.tsx`

**Query modificada:**
- Agregar `id_documento_factura_comision_sozu` al select de `cuentas_cobranza`
- Despues de obtener las cuentas, hacer una consulta batch a `documentos` con `id_tipo_documento = 47` y `activo = true` para las cuentas que tengan `id_documento_factura_comision_sozu` no nulo, obteniendo `id`, `es_draft`, `url`
- Agregar `id_estatus_disponibilidad` al select de `propiedades` para determinar si la propiedad esta en Vendido

**Nuevos estados y acciones en la tabla:**
- Importar `Stamp`, `FileText`, `Loader2`, `Eye` de lucide-react
- Agregar state para `timbrarDialog` y `generarLoading`
- Funcion `handleGenerar(cuentaId)`: llama a `supabase.functions.invoke('generar-factura-comision-sozu', { body: { id_cuenta_cobranza } })` y refresca la query
- Funcion `handleTimbrar(cuentaId, docId)`: llama a `supabase.functions.invoke('timbrar-factura-comision-sozu', { body: { id_cuenta_cobranza, id_documento } })` y refresca
- Dialogo de confirmacion para timbrar

### Archivo: `src/pages/admin/DetalleCuentaCobranza.tsx`

- Agregar `id_documento_factura_comision_sozu` al select principal
- Consultar el documento asociado (tipo 47) para obtener `es_draft` y `url`
- Mostrar Badge en el header de la cuenta
- Botones de accion (Generar / Timbrar) segun corresponda

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/Comisiones.tsx` | Agregar columna Fact. Comision Sozu con acciones de generar y timbrar |
| `src/pages/admin/DetalleCuentaCobranza.tsx` | Agregar badge de estado y acciones en el header |

No se eliminan cambios previos de `PagarComisiones.tsx` ni `ComisionesPorPagarTab.tsx`.
