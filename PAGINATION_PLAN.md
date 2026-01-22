# Plan de Optimización: Paginación del Servidor para Listados Pesados

## Estado Actual (Actualizado 2026-01-22)

### ✅ COMPLETADO

#### RPCs de Postgres
- [x] `get_cuentas_cobranza_paginadas` - Función SQL con paginación, filtros, agregados y control de acceso
- [x] `get_propiedades_paginadas` - Función SQL optimizada para propiedades con JOINs y conteos
- [x] `get_cuentas_cobranza_stats` - Función SQL para estadísticas agregadas (totales globales)

#### Índices de Performance
- [x] `idx_cuentas_cobranza_activo_padre` - Índice compuesto para filtros comunes
- [x] `idx_acuerdos_pago_cuenta_activo` - Índice para JOINs de pagos

#### Hooks de React
- [x] `src/hooks/useCuentasCobranzaPaginadas.ts` - Hook con tipado, control de acceso y paginación
- [x] `src/hooks/usePropiedadesPaginadas.ts` - Hook con filtros complejos y paginación

#### Integración en Páginas
- [x] `src/pages/admin/Pagos.tsx` - **INTEGRADO** - Usa hooks paginados + RPC de estadísticas
- [ ] `src/pages/admin/Propiedades.tsx` - Pendiente de integrar

---

## Resultados Esperados

| Métrica | Antes | Después |
|---------|-------|---------|
| Tiempo de carga inicial | 8-15 segundos | < 1 segundo |
| Queries por carga | 15-20 | 2-3 |
| Datos transferidos | 5-15 MB | < 100 KB |
| Filtrado | Cliente (lento) | Servidor (instantáneo) |

---

## Uso de los Hooks

### useCuentasCobranzaPaginadas

```typescript
import { useCuentasCobranzaPaginadas } from "@/hooks/useCuentasCobranzaPaginadas";

const {
  data: activeCuentasData,
  isLoading
} = useCuentasCobranzaPaginadas({
  page: 1,
  perPage: 50,
  idCuenta: "CC-000123",  // Filtro por ID
  proyecto: "Bottura",     // Filtro por proyecto
  clabe: "64618",          // Filtro por CLABE
  noPropiedad: "101",      // Filtro por no. propiedad
  modelo: "A1",            // Filtro por modelo
  compradores: "Juan",     // Filtro por nombre/RFC comprador
  producto: "Bodega",      // Filtro por nombre producto
  estatusIds: [1, 2],      // Filtros de estatus
  tipos: ['Propiedad'],    // Tipos: Propiedad, Producto, Servicio
  activo: true,            // true = activas, false = canceladas
});

// Datos retornados
const cuentas = activeCuentasData?.cuentas || [];
const totalCount = activeCuentasData?.totalCount || 0;
const totalPages = activeCuentasData?.totalPages || 1;
```

### usePropiedadesPaginadas

```typescript
import { usePropiedadesPaginadas } from "@/hooks/usePropiedadesPaginadas";

const {
  data: propiedadesData,
  isLoading
} = usePropiedadesPaginadas({
  page: 1,
  perPage: 50,
  search: "Bottura",
  proyectoIds: [1, 2, 3],
  modeloIds: [10, 20],
  recamaras: 2,
  banos: 2,
  disponibilidadIds: [1, 2],
  areaMin: 50,
  areaMax: 150,
  precioMin: 1000000,
  precioMax: 5000000,
  tieneBodegas: 'si',
  tieneEstacionamientos: 'si',
  tieneCuenta: 'si',
  active: true,
  esAprobado: true,
  ordenPrecio: 'asc',
});

// Datos retornados
const propiedades = propiedadesData?.propiedades || [];
const totalCount = propiedadesData?.totalCount || 0;
const totalPages = propiedadesData?.totalPages || 1;
```

---

## Arquitectura

```
┌──────────────────────┐     ┌─────────────────────────┐
│   React Component    │────▶│   useCuentasPaginadas   │
│  (Pagos.tsx)         │     │   (React Query Hook)    │
└──────────────────────┘     └────────────┬────────────┘
                                          │
                                          ▼
                             ┌─────────────────────────┐
                             │ supabase.rpc(...)       │
                             │ get_cuentas_cobranza_   │
                             │ paginadas               │
                             └────────────┬────────────┘
                                          │
                                          ▼
                             ┌─────────────────────────┐
                             │ PostgreSQL Function     │
                             │ - JOINs optimizados     │
                             │ - Filtros en SQL        │
                             │ - LIMIT/OFFSET          │
                             │ - Control de acceso     │
                             └─────────────────────────┘
```

---

## Próximos Pasos

1. **Integrar en Propiedades.tsx** - Reemplazar la query actual con `usePropiedadesPaginadas`
2. **Monitorear performance** - Verificar tiempos de respuesta en producción
3. **Ajustar índices** - Si es necesario, agregar más índices según patrones de uso
