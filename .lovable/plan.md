

# Plan: Aplicar Design System SOZU al Portal Inmobiliaria

## Alcance

Aplicar el sistema visual del referente (sozu-inmobiliaria.lovable.app) **exclusivamente** a las rutas `/admin/portal-inmobiliaria/*`. Sin cambios a lógica, datos, rutas ni funcionalidad.

## Dependencias

Todas las dependencias necesarias (lucide-react, recharts, tailwindcss, shadcn/ui) ya están instaladas. No se requieren nuevas.

## Archivos a modificar

### 1. `src/index.css` — Design tokens scoped bajo `.inmob-portal`

Agregar un bloque `.inmob-portal` (similar al existente `.sozu-theme`) con los tokens exactos del spec:
- Colores: `--color-primary: #22C55E`, neutros, estados, sidebar, charts
- Tipografía: variables de font-size (xs=12px a 3xl=30px), font-weight
- Espaciado, border-radius, sombras, transiciones, alturas fijas
- Clases utilitarias scoped: `.inmob-portal .inmob-card`, `.inmob-portal .inmob-stat-card`, `.inmob-portal .inmob-badge-*` (variantes de status pills)
- Estilos de tabla scoped: header uppercase con letter-spacing 0.06em, rows 52px, hover #FAFAFA

### 2. `PortalInmobiliariaLayout.tsx` — Layout rediseñado

**Sidebar (desktop):**
- Ancho exacto: 232px (en vez de 256px actual)
- Logo area: Avatar cuadrado verde 32x32 con "S", título "SOZU", subtítulo "Panel Inmobiliaria"
- Nav items: padding 9px 10px, íconos 18px strokeWidth 1.75, activo con bg `#DCFCE7` y color `#22C55E`
- Footer: email + versión + logout

**Topbar (nuevo, actualmente no existe como componente separado):**
- Sticky top, 56px, bg white, border-bottom
- Izquierda: breadcrumb con ícono Building2 + nombre empresa + "·" + sección actual
- Derecha: project selector dropdown + avatar circular con iniciales

**Mobile:** Mantener bottom nav actual adaptado a los nuevos tokens

**Main content:** margin-left 232px, padding 32px 40px

### 3. `InmobDashboard.tsx` — Ajustes visuales

- `DashStatCard`: Aplicar clases `.inmob-card` con border-radius 12px, shadow-sm, padding 24px. Ícono 20px en círculo con color temático
- Trend chips: border-radius full, font-size 12px, colores verde/rojo spec
- Mini-metrics row: mismos tokens de card
- Funnel: colores degradado verde oscuro→claro del spec
- Charts: fill `#22C55E`, grid stroke `#F3F4F6`, axes fontSize 12 fill `#9CA3AF`
- Tabla de desempeño: aplicar estilos de tabla del spec (header uppercase, rows 52px)

### 4. `InmobAgentes.tsx` — Ajustes visuales

- Header: título + subtítulo + botón "Nuevo Agente" (green primary, 40px height)
- Search input: padding-left 36px para ícono lupa, height 38px
- Tabla: columnas con avatar+nombre+email, badges de status según spec (Activo verde sólido, Suspendido rojo)
- Acciones: MoreHorizontal icon button

### 5. `InmobPipeline.tsx` — Ajustes visuales al Kanban

- Columnas: min/max-width 268px, gap 16px
- Column header: font-size 14px, semibold, count badge en pill gris
- Pipeline cards: border-radius 10px, padding 16px, hover con shadow-md y translateY(-1px)
- Días chip: overdue rojo sólido, normal gris, border-radius full, font-size 11px

### 6. `InmobProspectos.tsx` — Ajustes visuales

- Search input con ícono y height 38px
- Tabla con estilos del spec
- Badges de estatus según mapa de colores

### 7. `InmobCitas.tsx` — Ajustes visuales

- Grid 3 columnas de appointment cards
- Cards: border-radius 12px, padding 20px
- Fecha/hora con íconos Calendar/Clock 14px
- Project tag pills: bg `#F3F4F6`, border-radius 8px

### 8. `InmobComisiones.tsx` — Ajustes visuales

- 5 KPI cards en fila con tokens del spec
- Tabla con badges de status según mapa exacto del spec
- Badges: Pagada verde sólido, Pendiente gris outline, Pendiente factura rojo sólido

### 9. `InmobReportes.tsx` — Ajustes visuales

- 2x2 grid de gráficas en cards con border-radius 12px
- Chart colors: verde, azul, naranja, púrpura del spec
- Donut: innerRadius 55%, outerRadius 85%, paddingAngle 2

### 10. `InmobConfiguracion.tsx` — Ajustes visuales

- Section form groups: border-radius 12px, padding 24px
- Section title: ícono 18px + texto semibold, border-bottom separator
- Field grid: 2 columnas, gap 16px
- Inputs con focus ring verde

## Estrategia de scoping

Envolver el layout con clase `inmob-portal` en `PortalInmobiliariaLayout.tsx` para que todos los tokens CSS se apliquen solo a esta sección, sin afectar el resto del admin panel.

## Orden de implementación

1. CSS tokens en `index.css` (base del sistema)
2. Layout (sidebar + topbar)  
3. Dashboard (página más compleja)
4. Resto de páginas (agentes, pipeline, prospectos, citas, comisiones, reportes, configuración)

