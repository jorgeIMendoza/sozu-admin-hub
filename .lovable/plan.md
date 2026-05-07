## Contexto detectado

En `src/pages/admin/ComisionesExternas.tsx` las cuentas con estatus de propiedad ≥ 4 (Apartado/Vendido) **sí se cargan** (filtro línea 394). Lo que las "esconde" en tu segunda imagen es:

1. El botón **Aprobar** (línea 895) está deshabilitado cuando `cuenta.es_pagada_comision_venta = false`, con tooltip *"La comisión Sozu debe estar pagada antes de aprobar comisiones externas"*.
2. La columna "Comisión Sozu" muestra `Pendiente`, pero no hay un aviso visible que invite a continuar el flujo.

Tus dos cuentas (CCP-001758 y CC-001750) están en estatus **Vendido (5)** pero `es_pagada_comision_venta = false`, por eso aparecen en *Comisiones Sozu / Por Pagar* y siguen ocultas operativamente en *Aprobación de Externas*.

## Análisis de implicaciones (downstream)

Revisé los hooks/queries siguientes:
- `subirFacturaMutation` (ComisionesExternas, línea 471): solo requiere `aprobada=true`. **No depende** de `es_pagada_comision_venta`.
- `PagarComisiones.tsx` (línea 160): filtra `comisionistas.aprobada=true`. **No depende** de `es_pagada_comision_venta`.
- `AgentComisiones.tsx` (portal del agente): el estatus *factura_requerida* depende de `aprobada && !hasFactura`. **No depende** de Sozu pagada.
- Edge function `generar-factura-comision-sozu` y `timbrar-factura-comision-sozu`: son del lado de Sozu (factura que recibe Sozu del cliente), no afectan a la factura del externo.

**Conclusión**: aprobar antes de que Sozu cobre **NO rompe** el flujo. El agente externo podrá subir factura, y cuando después se marque la comisión Sozu como pagada, los pagos a externos siguen su curso normal en *Pagar Comisiones*.

Único riesgo de negocio: que un externo se llegue a pagar antes que Sozu cobre. Para mitigarlo, mantengo bloqueado el **pago al externo** hasta que Sozu esté pagada (sólo libero la aprobación y la subida de factura).

## Cambios propuestos (sólo `src/pages/admin/ComisionesExternas.tsx`)

### 1. Habilitar Aprobación con propiedad Vendida aunque Sozu no esté pagada
- Botón *Aprobar* (línea 887-901): quitar la condición `!cuenta.es_pagada_comision_venta` del `disabled`. Mantener únicamente `id_estatus_disponibilidad !== 5`.
- Actualizar el `title`/tooltip para reflejar la nueva regla.

### 2. Mantener bloqueo del pago final al externo
- Botón *Marcar como pagada* (sección ~927+): condicionarlo a `cuenta.es_pagada_comision_venta === true` con tooltip explicativo. Esto es el "candado" que protege el orden Sozu → externo.

### 3. Mostrar aviso visible cuando Sozu aún no ha cobrado
- En la fila expandida (encabezado de "Comisionistas Externos"), agregar un `<Alert variant="warning">` cuando `!cuenta.es_pagada_comision_venta`:
  > "Comisión Sozu aún no pagada. Puedes aprobar y permitir que el externo suba factura, pero el pago al externo se habilitará una vez que Sozu cobre su comisión."
- Adicional: en la columna *Comisión Sozu* (línea 804-812), añadir un ícono `AlertCircle` cuando esté Pendiente para hacerlo más evidente a primera vista.

### 4. Sin cambios en backend / RLS / esquema
No hay tablas, policies ni RPCs que tocar. La query ya trae los registros; sólo se ajusta UI/lógica de habilitación.

## Validación

- Verificar que las cuentas CCP-001758 y CC-001750 aparezcan en *Por Pagar* con botón *Aprobar* habilitado.
- Verificar que tras aprobar, el agente externo (`AgentComisiones.tsx`) entre en estado `factura_requerida` y pueda subir la factura.
- Verificar que el botón *Marcar como pagada* permanece deshabilitado hasta que `es_pagada_comision_venta` cambie a true (puedes simularlo en *Comisiones Sozu*).
- Verificar que el aviso aparece sólo cuando Sozu está pendiente y desaparece al marcar Sozu como pagada.
