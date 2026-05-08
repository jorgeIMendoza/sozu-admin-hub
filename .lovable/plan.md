## Diagnóstico

### Portal Inmobiliaria (`src/pages/admin/portal-inmobiliaria/InmobComisiones.tsx`)
El componente `FacturaUploadButton` SÍ existe (línea 112) y se renderiza en línea 407 dentro de la columna FACTURA. Pero:

- Sólo aparece cuando `r.facturaUrl` está vacía Y `!isSozu`.
- Está habilitado únicamente si `r.estatus === "Pendiente factura"` (línea 412).
- El estatus `"Pendiente factura"` se asigna sólo si `com.aprobada === true && !facturaSet.has(cuentaId)` (línea 901–902).

Resultado actual: si el admin no ha presionado "Aprobar" en `ComisionesExternas`, las filas se quedan en `"En revisión"` y el botón aparece **deshabilitado** (gris). Esto coincide con lo que el usuario está viendo: el cambio reciente permite aprobar antes de que Sozu cobre, pero en producción esas comisiones aún no han sido aprobadas por admin, así que el botón sigue inactivo.

### Portal Agente (`src/pages/admin/agent-portal/AgentComisiones.tsx`)
**No existe ningún botón de subir factura.** El portal sólo calcula el estatus `factura_requerida` (línea 170) pero no renderiza UI para subirla. El agente queda bloqueado: ve "Factura requerida" pero no puede actuar.

---

## Plan

### 1. Portal Agente — agregar botón "Subir factura" (cambio mayor)

En `AgentComisiones.tsx`, dentro de la tarjeta de cada comisión:

- Cuando `c.detailed_status === 'factura_requerida'`, mostrar un botón "Subir factura" debajo del badge de estatus.
- Crear un componente `AgentFacturaUploadButton` (puede vivir en el mismo archivo) que replique la lógica de `FacturaUploadButton` del portal inmobiliaria:
  - Acepta sólo `.pdf`.
  - Sube a `storage/documentos` en path `facturas-comision/{cuentaId}/{timestamp}-{file}`.
  - Inserta fila en `documentos` con `id_tipo_documento = 46`, `id_cuenta_cobranza`, `id_persona = personaId`, `numero = agentEmail`, `activo = true`.
  - Tras éxito, invalida la query `['agent-comisiones', agentEmail]`.
- Agregar tracking con `useCtaTracker` (`elementId: 'btn_subir_factura_agent'`).
- También mostrar enlace "Ver factura" cuando ya exista (conviene jalar `url` de `documentos` tipo 46 en el query y mapearlo a la fila como `facturaUrl`).

### 2. Portal Inmobiliaria — confirmar visibilidad del botón

`FacturaUploadButton` ya está implementado y enlazado correctamente. La causa de que no aparezca en producción es que las filas que el usuario espera ver con botón están en estatus distinto a `"Pendiente factura"` (probablemente `"En revisión"` porque admin aún no aprueba). No se requiere cambio funcional, pero para evitar confusión:

- Reemplazar el span "Sin factura" / botón deshabilitado por un mensaje contextual claro en la celda FACTURA cuando la comisión aún no esté aprobada: "Pendiente de aprobación admin" (tooltip explicativo).
- Cuando `r.estatus === "Pendiente factura"` el botón aparece habilitado (ya funciona).
- En el `Sheet` de detalle (línea 526), aplicar el mismo tratamiento.

### 3. Confirmación con el usuario antes de implementar

Conservar la regla "factura sólo después de aprobación admin" (ya confirmado). No se modifica `ComisionesExternas.tsx` ni la lógica de aprobación.

---

## Detalles técnicos

**Archivos a modificar:**
- `src/pages/admin/agent-portal/AgentComisiones.tsx` — agregar componente upload + lógica de fetch de `url` factura para mostrar "Ver factura".
- `src/pages/admin/portal-inmobiliaria/InmobComisiones.tsx` — mejorar UX del botón cuando está deshabilitado (tooltip + label).

**Sin cambios:**
- Tipos generados de Supabase.
- Edge functions.
- Lógica de aprobación en `ComisionesExternas.tsx`.

**Validación post-implementación:**
1. Como agente con comisión `aprobada=true` y sin documento tipo 46 → debe ver botón "Subir factura" habilitado.
2. Tras subir → estatus pasa a "Programada" y se ve enlace "Ver factura".
3. Como inmobiliaria con la misma condición → botón habilitado en columna FACTURA.
4. Como inmobiliaria/agente con comisión sin aprobar → mensaje claro "Pendiente de aprobación admin" (no botón muerto).
