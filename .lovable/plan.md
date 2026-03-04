

# Fase 1: Dashboard Ejecutivo -- Plan de Implementacion

## Objetivo
Reescribir `InmobDashboard.tsx` para replicar exactamente el diseno del sitio de referencia (sozu-inmobiliaria.lovable.app).

## Cambios visuales principales

El dashboard actual tiene 8 KPI cards genericas + 3 graficas basicas. El nuevo tendra:

1. **Header con breadcrumb**: Icono Building + nombre inmobiliaria (de `useInmobiliariaPersonaId` + query persona) + separador + "Dashboard" + dropdown "Todos los proyectos" a la derecha
2. **Titulo**: "Dashboard Ejecutivo" / "Vista general del desempeno inmobiliario"
3. **7 KPI cards principales** en fila (scroll horizontal movil): Agentes activos, Pipeline total ($), Ofertas activas, Apartados, Ingresos cobrados ($), Por cobrar ($), Estimados ($) -- cada uno con icono en cuadrado coloreado arriba, valor grande, subtitulo gris, badge verde de cambio
4. **4 KPI secundarias** compactas en fila: Conversion global (%), Ticket promedio ($), Comision prom/agente ($), Tiempo prom. cierre (dias) -- solo icono pequeno + label + valor bold
5. **Embudo de conversion SVG** (funnel verde degradado, 6 niveles: Prospectos, Ofertas, Aprobacion, Apartado, Firma, Escrituracion) + panel lateral "Alertas estrategicas" (ofertas apartadas sin firma >7 dias)
6. **Ventas por Agente** (BarChart con 3 tabs: Unidades/Ingreso/Comision) + **Ingreso Real vs Proyectado** (AreaChart con 3 series: Cobrado, Por cobrar, Estimado)
7. **Tabla Desempeno por Agente**: Agente, Prospectos, Ofertas, Apartados, Ventas, Pipeline activo, Ingreso, Comision, Conversion (con flechas color)
8. **Actividad reciente**: Timeline vertical con iconos y timestamps relativos

## Datos a consultar (queries)

Se reutiliza `useInmobAgents()` existente. Queries adicionales:

- **Ofertas**: Ya existe, agregar campos `id_prospecto` y precio via join a propiedades
- **Propiedades**: Expandir query para traer `precio_lista`, `id_estatus_disponibilidad` de todas las propiedades vinculadas
- **Prospectos**: Count de `entidades_relacionadas` tipo 7 donde `id_persona_duena_lead` pertenece a agentes
- **Cuentas cobranza**: Para ingresos cobrados (suma pagos aplicados) y por cobrar (saldos pendientes)
- **Comisiones**: Ya existe, agregar `monto_comision` para calcular promedios

Para badges de cambio (%) y datos historicos: se calcularan comparando registros del periodo actual vs anterior (ultimos 30 dias vs 30 dias anteriores). Si no hay datos suficientes, se muestran sin badge.

## Archivos a modificar

| Archivo | Accion |
|---------|--------|
| `src/pages/admin/portal-inmobiliaria/InmobDashboard.tsx` | Reescritura completa |

No se crean archivos nuevos -- todo el dashboard queda en un solo archivo con componentes internos (KpiCard, FunnelChart, AlertsPanel, AgentTable, ActivityTimeline).

## Detalles de implementacion

- **Funnel SVG**: Componente custom con `<svg>` que dibuja trapecios verdes con degradado, numeros centrados y labels a la derecha
- **Tabs en "Ventas por Agente"**: Estado local para alternar entre datos de unidades/ingreso/comision en el mismo BarChart
- **AreaChart "Ingreso Real vs Proyectado"**: 3 series (Cobrado verde solido, Por cobrar naranja punteado, Estimado naranja claro punteado) con datos agrupados por mes
- **Tabla**: Componente con `Table` de shadcn, flechas verdes (arriba) y rojas (abajo) en columna Conversion
- **Timeline**: Lista simple con iconos Lucide, texto descriptivo y `date-fns` formatRelative para timestamps

