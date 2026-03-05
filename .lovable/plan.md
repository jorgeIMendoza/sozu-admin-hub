

## Plan: Manejo especial de ofertas "Asignadas" y "De Registro" en el detalle del Pipeline

### Contexto
Actualmente el diálogo de detalle muestra "Manual" para todas las ofertas con esquema manual, sin distinguir casos especiales:
- **Asignadas** (`estatus_disponibilidad = 10`): No tienen pagos reales, solo son asignaciones.
- **Registro** (`precio_final = 0` en `cuentas_cobranza`): Ofertas creadas solo para registrar la unidad, sin pagos.

### Cambios

**1. `InmobPipeline.tsx` — Enriquecer card con `precio_final`**
- En `enrichOfertas`, agregar `precio_final` del `cuentas_cobranza` al objeto card.
- Agregar `precio_final` al tipo `PipelineCard`.

**2. `InmobPipelineOfferDetailDialog.tsx` — Lógica condicional**
- Antes de la sección de Esquemas de Pago, evaluar dos casos especiales:
  - **`estatus_disponibilidad === 10`**: Mostrar un bloque informativo tipo "Propiedad Asignada — esta oferta no genera esquema de pagos" y ocultar la sección de esquemas.
  - **`precio_final === 0`** (en cuenta de cobranza, no confundir con precio_lista): Mostrar "Oferta generada para registro de unidad — sin pagos asociados" y ocultar esquemas.
- Solo para ofertas que no caigan en estos dos casos se mostrará la lógica actual de esquemas (manual = solo ese; estándar = todos los del proyecto).

### Flujo resultante

```text
¿estatus_disponibilidad === 10?
  → SÍ → Mostrar "Asignada" + sin esquemas
  → NO → ¿precio_final === 0 en cuenta de cobranza?
           → SÍ → Mostrar "Registro de unidad" + sin esquemas
           → NO → ¿esquema es manual?
                    → SÍ → Solo ese esquema, label "Manual"
                    → NO → Todos los esquemas del proyecto
```

