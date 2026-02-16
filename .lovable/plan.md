

## Corregir payload de factura de comision hacia n8n

### Problema

Las edge functions `generar-factura-comision-sozu` y `timbrar-factura-comision-sozu` envian un payload minimo a n8n (`{ tipo_factura: "comision" }`), cuando el endpoint `/generaFactura` espera un payload completo con datos de propiedad, compradores, escrituracion, etc. -- identico al que construye `FacturasTab.tsx` via `buildInvoicePayload()`.

### Solucion

Replicar la logica de `buildInvoicePayload()` dentro de ambas edge functions, usando los secrets existentes para el api_key:

- **Draft (generar)**: `COMISIONES_SOZU_API_KEY_DRAFT` + `es_draft: true`
- **Timbrar**: `COMISIONES_SOZU_API_KEY` + `es_draft: false`

### Cambios

#### 1. `supabase/functions/generar-factura-comision-sozu/index.ts`

Reescribir para que, despues de las validaciones existentes (propiedad vendida, entidad con facturar_comision_sozu), recopile todos los datos necesarios:

1. Leer `COMISIONES_SOZU_API_KEY_DRAFT` del environment
2. Obtener datos de la propiedad: `numero_propiedad`, `m2_interiores`, `m2_exteriores`, `numero_piso`
3. Obtener direccion del proyecto via `entidades_relacionadas.id_proyecto` -> `proyectos.direccion`
4. Obtener compradores de la cuenta con datos fiscales completos (RFC, regimen, uso CFDI, CURP, direccion fiscal con pais/estado/municipio resueltos por nombre)
5. Obtener estacionamientos y bodegas de la propiedad
6. Obtener datos de escrituracion de la cuenta (numero_escritura, fecha, libro, hoja, clave_catastral, numero_unidad_privativa)
7. Obtener datos del notario si existe
8. Construir payload identico a `buildInvoicePayload` pero con `tipo_factura: "comision"` y campos adicionales `monto_comision` y `porcentaje_comision`
9. Enviar a `N8N_WEBHOOK_BASE_URL/generaFactura`
10. Guardar resultado en `url_factura_comision` y `es_draft_factura_comision = true`

#### 2. `supabase/functions/timbrar-factura-comision-sozu/index.ts`

Misma logica de recopilacion de datos pero:

1. Leer `COMISIONES_SOZU_API_KEY` del environment
2. Enviar con `es_draft: false`
3. Actualizar `es_draft_factura_comision = false` y la URL resultante

### Estructura del payload (identica a FacturasTab)

```text
{
  api_key: <COMISIONES_SOZU_API_KEY_DRAFT o COMISIONES_SOZU_API_KEY>,
  environment: "produccion",
  tipo_factura: "comision",
  id_propiedad: number,
  id_cuenta_cobranza: number,
  es_draft: boolean,
  monto_comision: number,
  porcentaje_comision: number,
  propiedad: {
    numero_propiedad, metraje_escriturable, direccion, precio_final, piso
  },
  estacionamientos: [{ nombre, tipo, m2, ubicacion, es_incluido }],
  bodegas: [{ nombre, m2, ubicacion, es_incluido }],
  escrituracion: {
    numero_escritura, fecha_escritura, libro, hoja, clave_catastral,
    numero_unidad_privativa,
    notario: { nombre, notaria, direccion, email, telefono } | null
  },
  compradores: [{
    id_persona, nombre_completo, porcentaje_propiedad, email, telefono,
    rfc, curp, regimen, uso_cfdi,
    direccion_fiscal: {
      calle, numero_exterior, numero_interior, colonia,
      codigo_postal, municipio, estado, pais
    }
  }]
}
```

### Notas

- Los secrets `COMISIONES_SOZU_API_KEY_DRAFT` y `COMISIONES_SOZU_API_KEY` ya existen en el proyecto
- No se requieren cambios en frontend ni en la base de datos
- Se mantienen las notificaciones por correo existentes
- Se mantiene la logica de permitir regenerar drafts

