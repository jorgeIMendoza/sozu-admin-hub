

## Plan: Columna de Factura en Comisiones

### Lógica de datos

**Sozu**: Agregar `url_factura_comision` y `es_draft_factura_comision` al select de `cuentas_cobranza` en `fetchSozuComisiones` (línea 442). Mapear al row como `facturaUrl` cuando `es_draft_factura_comision === false`, sino `null`.

**Externos**: Ya se consultan documentos tipo 46 (línea 639-646). Ampliar el select para incluir `url_documento` y mapear por `id_cuenta_cobranza` para obtener la URL. Guardar en el row como `facturaUrl`.

Ambos fetchers agregarán `facturaUrl: string | null` a cada row.

### Columna en la tabla

- Nuevo `TableHead`: "Factura" después de "Fecha Pago"
- `TableCell`:
  - Si `r.facturaUrl` existe → botón/ícono para abrir el PDF con `PdfViewerDialog`
  - Si no existe y **es Sozu** → texto "Sin factura"
  - Si no existe y **no es Sozu** → botón "Subir factura" que abre un input file, sube al bucket correspondiente, e inserta un registro en `documentos` con `id_tipo_documento = 46`

### Upload para externos

- Componente inline `FacturaUploadButton` dentro del archivo
- Al hacer click abre un `<input type="file" accept=".pdf">` oculto
- Sube al bucket `documentos-generales` (o el que ya usen para tipo 46)
- Inserta en tabla `documentos`: `id_cuenta_cobranza`, `id_tipo_documento: 46`, `url_documento`, `id_persona` (de la inmobiliaria), `numero: inmobEmail`, `activo: true`
- Tras éxito, invalida el query para refrescar

### Archivos a modificar

- `src/pages/admin/portal-inmobiliaria/InmobComisiones.tsx`: Todo lo descrito arriba, incluyendo import de `PdfViewerDialog`, estado para el visor, y el componente de upload.

