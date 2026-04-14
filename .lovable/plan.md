

## Plan: Migrar Dashboard de Cobranza a datos reales

### Resumen
Reemplazar los datos mock del Dashboard por queries reales a Supabase. Los datos existen y son abundantes: ~1,400 cuentas activas, ~$127M en cartera vencida, ~$1,142M cobrados históricamente, 3 proyectos activos.

### Datos disponibles confirmados en BD
| KPI | Valor real |
|---|---|
| Cobrado total | $1,142M |
| Vencido total | $127.7M |
| Pendiente futuro | $336.5M |
| Cobrado mes actual | $2.2M |
| Programado mes | $17.1M |
| Parcialidades vencidas | 1,711 |
| Cuentas con 1 vencida | 364 |
| Cuentas con 2 vencidas | 83 |
| Cuentas con 3+ vencidas | 184 |
| Aging +90 días | $102.7M (985 parcialidades) |
| Proyectos | Margot, Bottura, Daiku |
| Pagos últimos 12 meses | Datos mensuales disponibles |

### Datos NO disponibles (se omiten o muestran "—")
- Ejecutivos asignados (no hay campo) → Tab "Operación" mostrará estado vacío
- Documentación/PLD/Legal → Se ocultan del dashboard
- Provisión de obra → Tab "Flujo y Obra" permanece con datos ilustrativos o vacío
- Promesas de pago → No hay tabla específica

### Pasos de implementación

**1. Crear hook `useCobranzaDashboard`** (`src/hooks/useCobranzaDashboard.ts`)
- Query 1: KPIs globales (programado mes, cobrado mes, vencido total, pendiente)
- Query 2: Cobrado vs meta por mes (últimos 12 meses desde `pagos`)
- Query 3: Cobranza por proyecto (cobrado, por cobrar, vencido por proyecto)
- Query 4: Aging de cartera (1-30, 31-60, 61-90, +90 días)
- Query 5: Cuentas por parcialidades vencidas (1, 2, 3+)
- Query 6: Lista de proyectos y entidades para filtros
- Todas las queries usan `supabase.rpc()` o queries directas con JOINs
- Soporta filtros por proyecto y periodo

**2. Crear RPC `get_dashboard_cobranza_kpis`** (migración SQL)
- Una sola función que retorna todos los KPIs en un JSON para reducir roundtrips
- Parámetros: `p_proyecto_id`, `p_fecha_inicio`, `p_fecha_fin`
- Retorna: programado, cobrado, por cobrar, vencido, aging, cuentas por morosidad, cobranza por proyecto, cobrado mensual

**3. Modificar `CobranzaDashboard.tsx`**
- Reemplazar imports de `mockKPIs`, `mockFinancialMetrics`, `mockAccounts`, etc.
- Usar el hook con estados de loading/error
- Tab **Resumen**: KPIs reales, alertas reales, gráfica de cobrado vs mes
- Tab **Riesgo y Cartera**: Aging real, cuentas por morosidad real
- Tab **Cobranza por Proyecto**: Tabla con datos reales de Margot/Bottura/Daiku
- Tab **Flujo y Obra**: Mostrar mensaje "Datos de obra no disponibles" o mantener estructura vacía
- Tab **Operación**: Mostrar "Sin ejecutivos asignados" en lugar de mock
- Filtros de proyecto y entidad cargan dinámicamente

**4. Ajustes menores**
- Actualizar el subtítulo de fecha dinámica ("Abril 2026" → mes actual)
- Recovery rate calculado como (cobrado_mes / programado_mes * 100)
- Acciones prioritarias usan conteos reales

### Archivos a crear/modificar
- **Crear**: `src/hooks/useCobranzaDashboard.ts`
- **Crear**: Migración SQL para RPC `get_dashboard_cobranza_kpis`
- **Modificar**: `src/pages/admin/portal-cobranza/CobranzaDashboard.tsx`

