
# Plan: Instrumentacion Completa de CTAs en Datos Inmobiliarios

## Resumen
Agregar tracking de todas las interacciones de usuario en las 3 paginas de datos inmobiliarios y sus modales, usando el hook existente `useCtaTracker` y la tabla `cta_events`. Luego redisenar la pagina de Mediciones CTA para mostrar dashboards especificos por pagina con graficas y tablas detalladas.

---

## Parte 1: Instrumentacion de Eventos (track calls)

Se usara el hook existente `useCtaTracker` insertando llamadas `track()` en cada interaccion. Cada evento tendra un `element_id` unico y descriptivo, y opcionalmente `metadata` con detalles adicionales (ej. que filtro se uso, que plataforma de compartir, que fase del perfil).

### 1.1 Pagina: Inventario (`InventarioGlobal.tsx`)

| Interaccion | element_id | metadata |
|---|---|---|
| Visita a la pagina | `page_view` | `{}` |
| Boton de busqueda (abrir filtros) | `btn_busqueda` | `{ filtro: "proyecto" \| "modelo" \| "recamaras" \| "nivel" \| "bodega" \| "estacionamiento" }` (se trackea al aplicar cada filtro) |
| Boton de ordenamiento | `btn_ordenamiento` | `{ orden: "asc" \| "desc" \| "none" }` |
| Boton de Desarrollos | `btn_desarrollos` | `{}` |
| Boton agregar Prospecto | `btn_agregar_prospecto` | `{}` |
| Boton agendar cita showroom | `btn_agendar_cita` | `{}` |
| Boton perfil de usuario | `btn_perfil_usuario` | `{}` |

### 1.2 Pagina: Desarrollos (`MisProyectos.tsx`)

| Interaccion | element_id | metadata |
|---|---|---|
| Visita a la pagina | `page_view` | `{}` |
| Boton de busqueda | `btn_busqueda` | `{ filtro: "..." }` (mismo esquema) |
| Boton agregar Prospecto | `btn_agregar_prospecto` | `{}` |
| Boton agendar cita showroom | `btn_agendar_cita` | `{}` |
| Boton perfil de usuario | `btn_perfil_usuario` | `{}` |
| Boton Modelos | `btn_modelos` | `{ proyecto: nombre }` |
| Boton Amenidades | `btn_amenidades` | `{ proyecto: nombre }` |
| Boton Compartir | `btn_compartir` | `{ proyecto: nombre }` |
| Compartir por plataforma | `btn_compartir_plataforma` | `{ plataforma: "whatsapp" \| "facebook" \| "email" \| "copy", proyecto: nombre }` |
| Descargar brochure | `btn_descargar_brochure` | `{ proyecto: nombre }` |
| Swipe/carrusel (1 por sesion-proyecto) | `carousel_swipe` | `{ proyecto: nombre }` |

### 1.3 Pagina: Detalle Desarrollo (`MiProyectoDetalle.tsx`)

| Interaccion | element_id | metadata |
|---|---|---|
| Visita a la pagina | `page_view` | `{ proyecto: nombre }` |
| Boton de busqueda | `btn_busqueda` | `{ filtro: "..." }` |
| Boton Desarrollos | `btn_desarrollos` | `{}` |
| Boton agregar Prospecto | `btn_agregar_prospecto` | `{}` |
| Boton agendar cita showroom | `btn_agendar_cita` | `{}` |
| Boton perfil de usuario | `btn_perfil_usuario` | `{}` |
| Swipe/carrusel hero (1 por sesion-proyecto) | `carousel_swipe` | `{ proyecto: nombre }` |
| Interaccion con mapa | `map_interaction` | `{ proyecto: nombre }` |

### 1.4 Modales

**Nuevo Prospecto (`AddProspectoFloatingDialog.tsx`)**:
- `modal_prospecto_campo_llenado`: Se trackea una sola vez cuando el usuario empieza a llenar algun campo (usa un ref booleano que se resetea al cerrar el modal).
- `modal_prospecto_guardar`: Se trackea al hacer clic en Guardar.

**Agendar Cita Showroom (`AgendarCitaShowroomDialog.tsx`)**:
- `modal_cita_campo_llenado`: Se trackea una sola vez cuando el usuario llena algun campo.
- `modal_cita_guardar`: Se trackea al hacer clic en Agendar/Guardar.

**Perfil de Usuario (`AgentOnboardingStepDialog.tsx` + ProfileMenu)**:
Para cada fase (basic, address, fiscal, documents, bank-accounts, training):
- `perfil_fase_abrir`: `{ fase: "basic" \| "address" \| ... }` -- al abrir el modal de la fase.
- `perfil_fase_campo_modificado`: `{ fase: "..." }` -- una sola vez por apertura si se modifica algun campo.
- `perfil_fase_guardar`: `{ fase: "..." }` -- al dar clic en guardar/agendar.
- `perfil_documentos_ver`: `{ documento: nombre }` -- al hacer clic en "Ver" en la fase de documentos.
- `perfil_cuentas_agregar`: `{}` -- al hacer clic en "Agregar cuenta" en la fase de cuentas bancarias.

---

## Parte 2: Logica de Tracking Especial

### Swipe de carrusel (1 por sesion-proyecto)
Se usara un `useRef<Set<string>>` que almacena los project IDs ya trackeados. Al detectar el primer cambio de slide (evento `select` del Embla carousel), si el proyecto no esta en el Set, se trackea y se agrega al Set. El Set se reinicia al montar/desmontar el componente de pagina.

### Llenado de campos en modales (1 por apertura)
Se usara un `useRef<boolean>` inicializado en `false`. Al detectar el primer `onChange` en cualquier campo, si el ref es `false`, se trackea y se pone en `true`. Al cerrar el modal (via `onOpenChange`), se resetea a `false`.

### Filtros de busqueda
Al aplicar/cambiar un filtro especifico, se trackea `btn_busqueda` con metadata indicando que filtro se uso. Esto se hace en los callbacks `onValuesChange` de cada `MultiSelectFilter`.

---

## Parte 3: Rediseno de Mediciones CTA (`MedicionesCTA.tsx`)

Se reescribira completamente la pagina para mostrar un dashboard mas detallado, organizado por pagina:

### Estructura del Dashboard

1. **Filtros globales** (rango de tiempo, pagina especifica) -- se mantienen.

2. **Tarjetas resumen** (se mantienen: total clicks, CTAs unicos, usuarios unicos) + nueva tarjeta: **Visitas a paginas**.

3. **Seccion por Pagina** (tabs o accordion):
   - **Inventario**: Grafica de barras con los CTAs principales. Tabla con conteo de cada filtro usado. Grafica de pie para tipo de ordenamiento.
   - **Desarrollos**: Grafica de barras con CTAs. Tabla de compartir por plataforma. Conteo de brochure downloads. Carrusel engagement rate.
   - **Detalle Desarrollo**: Similar, incluyendo interacciones con mapa.

4. **Seccion de Modales**:
   - Tabla con: Modal abierto | Campos llenados | Guardados | Tasa de conversion (guardados/abiertos).
   - Desglose del perfil por fase con las mismas metricas.

5. **Mapa de calor** (se mantiene al final como vista general).

---

## Detalles Tecnicos

### Archivos a modificar:
1. `src/pages/admin/inmobiliarias/InventarioGlobal.tsx` -- agregar `useCtaTracker`, page_view en `useEffect`, track en cada boton.
2. `src/pages/admin/inmobiliarias/MisProyectos.tsx` -- idem + carousel tracking + share tracking.
3. `src/pages/admin/inmobiliarias/MiProyectoDetalle.tsx` -- idem + map interaction + carousel tracking.
4. `src/components/admin/AddProspectoFloatingDialog.tsx` -- campo llenado + guardar.
5. `src/components/admin/AgendarCitaShowroomDialog.tsx` -- campo llenado + guardar.
6. `src/components/admin/AgentOnboardingStepDialog.tsx` -- abrir fase, campo modificado, guardar, ver documento, agregar cuenta.
7. `src/pages/admin/MedicionesCTA.tsx` -- rediseno completo del dashboard.

### No se requieren cambios en la base de datos
La tabla `cta_events` ya tiene la estructura necesaria con campos `page`, `element_id`, `element_label`, `element_type`, y `metadata` (JSONB). Todos los datos adicionales (filtro, plataforma, fase, proyecto) se almacenan en `metadata`.

### Convencion de `page` por vista:
- `inventario` para `/admin/inmobiliarias/inventario`
- `desarrollos` para `/admin/inmobiliarias/proyectos`
- `detalle_desarrollo` para `/admin/inmobiliarias/proyectos/:id`
- `modal_prospecto` para el modal de nuevo prospecto
- `modal_cita` para el modal de agendar cita
- `modal_perfil` para el modal de perfil/onboarding

