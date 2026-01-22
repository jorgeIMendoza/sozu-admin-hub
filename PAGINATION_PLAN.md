# Plan de Implementación de Paginación y Optimización

## Estado Actual - Enero 2026

### ✅ COMPLETADO: Funciones RPC Optimizadas

Se crearon dos funciones RPC en PostgreSQL para optimizar los listados más pesados:

1. **`get_cuentas_cobranza_paginadas`** - Para Pagos.tsx
   - Paginación real en SQL con `LIMIT/OFFSET`
   - Filtros aplicados en la base de datos
   - Agregaciones de pagos, multas, efectivo calculados en SQL
   - Compradores retornados como JSONB
   - Índices de soporte creados

2. **`get_propiedades_paginadas`** - Para Propiedades.tsx
   - Paginación real en SQL
   - Conteos de estacionamientos/bodegas en SQL
   - Datos de cuenta de cobranza incluidos
   - Soporte para todos los filtros existentes

### ✅ COMPLETADO: Hooks de React

- `src/hooks/useCuentasCobranzaPaginadas.ts`
- `src/hooks/usePropiedadesPaginadas.ts`

### 🔄 PENDIENTE: Integración en Páginas

Los hooks están listos pero requieren integración en:
- `src/pages/admin/Pagos.tsx` (3196 líneas)
- `src/pages/admin/Propiedades.tsx` (6361 líneas)

## Rendimiento Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Tiempo de carga | 8-20 seg | < 1 seg |
| Queries por carga | 15-20 | 1-2 |
| Datos transferidos | 5-15 MB | 50-100 KB |
| Filtrado | Cliente | Servidor |

## Páginas Adicionales que Necesitan Paginación

1. ✅ Modelos - COMPLETADO
2. Vistas - Migrar a useQuery
3. Productos - Corregir implementación existente
4. Estacionamientos y Bodegas - Similar entre sí
5. Compradores, Duenos, Residentes, Prospectos - Los más complejos

## Próximos Pasos

Para activar la optimización en Pagos.tsx/Propiedades.tsx:
1. Reemplazar la query actual por el hook correspondiente
2. Remover filtrado en memoria (`applyFilters`)
3. Actualizar componentes de paginación para usar `totalPages` del hook
4. Probar todos los filtros y funcionalidades existentes

## Uso de los Nuevos Hooks

### useCuentasCobranzaPaginadas

```typescript
import { useCuentasCobranzaPaginadas } from "@/hooks/useCuentasCobranzaPaginadas";

const { data, isLoading } = useCuentasCobranzaPaginadas({
  page: currentPage,
  perPage: 50,
  proyecto: proyectoFilter,
  clabe: clabeFilter,
  noPropiedad: noPropiedadFilter,
  modelo: modeloFilter,
  compradores: compradoresFilter,
  producto: productoFilter,
  estatusIds: estatusFilter,
  tipos: selectedTipos,
  activo: activeTab === 'activas',
});

// data.cuentas - array de cuentas para la página actual
// data.totalCount - total de registros que coinciden con los filtros
// data.totalPages - total de páginas
```

### usePropiedadesPaginadas

```typescript
import { usePropiedadesPaginadas } from "@/hooks/usePropiedadesPaginadas";

const { data, isLoading } = usePropiedadesPaginadas({
  page: currentPage,
  perPage: 50,
  search: searchTerm,
  proyectoIds: selectedProyectos,
  modeloIds: selectedModelos,
  recamaras: parseInt(recamarasFilter) || null,
  banos: parseInt(banosFilter) || null,
  disponibilidadIds: disponibilidadFilter.map(id => parseInt(id)),
  areaMin: areaFilter[0] > 0 ? areaFilter[0] : null,
  areaMax: areaFilter[1] < 500 ? areaFilter[1] : null,
  precioMin: precioFilter[0] > 0 ? precioFilter[0] : null,
  precioMax: precioFilter[1] < 100000000 ? precioFilter[1] : null,
  tieneBodegas: bodegasFilter || null,
  tieneEstacionamientos: estacionamientosFilter || null,
  tieneCuenta: cuentaCobranzaFilter || null,
  activo: activeTab === 'activos',
  esAprobado: activeTab !== 'draft',
  ordenPrecio: precioSort,
});

// data.propiedades - array de propiedades para la página actual
// data.totalCount - total de registros
// data.totalPages - total de páginas
```
