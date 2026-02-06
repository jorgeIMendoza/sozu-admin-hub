
# Plan: Optimizar Cuentas de Mantenimiento con RPC

## Problema Actual

La vista de Cuentas de Mantenimiento (`CuentasMantenimiento.tsx`) ejecuta **mas de 20 queries secuenciales** desde el frontend para cargar los datos:

1. Todas las cuentas_cobranza con `id_cuenta_cobranza_padre IS NOT NULL` (301 registros)
2. Cuentas padre para datos de propiedad/proyecto
3. Acuerdos de pago (batched por 100)
4. Aplicaciones de pago (batched por 100)
5. Pagos reales (batched por 100)
6. Pagos en efectivo (batched por 100)
7. Aplicaciones de efectivo (batched por 100)
8. Acuerdos con conceptos (batched por 100)
9. Multas (batched por 100)
10. Proximas fechas de pago (batched por 100)
11. Ofertas de cuentas padre
12. Ofertas propias
13. Compradores (batched por 100)
14. Residentes (batched por 100)
15. Entidades relacionadas
16. Edificios/modelos
17. Bodegas
18. Estacionamientos
19. Productos/servicios
20. Mas queries auxiliares...

Despues de descargar **todos** los datos, filtra y pagina en el cliente. Esto genera tiempos de carga de **8-15 segundos** y transfiere megabytes de datos innecesarios.

## Solucion

Crear una funcion RPC de PostgreSQL `get_cuentas_mantenimiento_paginadas` que realice todos los JOINs, filtros y calculos directamente en el servidor, y un hook React `useCuentasMantenimientoPaginadas` que la consuma. Esto sigue exactamente el mismo patron que ya funciona exitosamente para cuentas de cobranza.

## Resultados Esperados

| Metrica | Antes | Despues |
|---------|-------|---------|
| Tiempo de carga | 8-15 segundos | Menos de 1 segundo |
| Queries por carga | 20+ | 1 |
| Datos transferidos | 5-15 MB | Menos de 100 KB |
| Filtrado | Cliente (lento) | Servidor (instantaneo) |

## Cambios Propuestos

### 1. Migracion SQL: Crear funcion `get_cuentas_mantenimiento_paginadas`

La funcion recibira los mismos filtros que se usan actualmente en el frontend:
- `p_page`, `p_per_page` (paginacion)
- `p_id_cuenta` (filtro por ID de cuenta)
- `p_propietarios` (filtro por nombre de propietario)
- `p_clabe` (filtro por CLABE STP)
- `p_proyecto` (filtro por nombre de proyecto)
- `p_no_propiedad` (filtro por numero de propiedad)
- `p_modelo` (filtro por modelo)
- `p_clave_catastral` (filtro por clave catastral)
- `p_search` (busqueda general)
- `p_proyecto_ids` (control de acceso por proyecto)
- `p_dueno_entity_ids` (control de acceso por entidad duena)

Retornara una tabla con todos los campos necesarios calculados en SQL:
- Datos basicos de la cuenta (id, clabe_stp, activo)
- Datos de la propiedad padre (numero_propiedad, clave_catastral)
- Datos del proyecto (nombre del proyecto, edificio, modelo)
- Propietarios como JSON aggregado
- Residentes como JSON aggregado
- Pagos calculados en SQL: pago mensual acumulado, total pagado, saldo pendiente
- Proxima fecha de pago
- Complementos (bodegas, estacionamientos, productos) como JSON
- Multas pendientes
- total_count para la paginacion

La logica clave de calculo del saldo sera:
- **Pago mensual acumulado**: SUM de monto de acuerdos_pago activos de la cuenta
- **Total pagado**: SUM de monto de pagos activos de la cuenta (pagos reales, no aplicaciones)
- **Saldo pendiente**: pago_acumulado - total_pagado

Los JOINs seguiran la cadena:
```text
cuentas_cobranza (mant.) -> cuentas_cobranza (padre) -> ofertas -> propiedades -> edificios_modelos -> edificios -> proyectos
```

### 2. Hook React: `useCuentasMantenimientoPaginadas`

Crear un nuevo hook en `src/hooks/useCuentasMantenimientoPaginadas.ts` que:
- Reciba los parametros de filtro y paginacion
- Use `useProjectAccess` para control de acceso
- Llame a `supabase.rpc('get_cuentas_mantenimiento_paginadas', ...)`
- Transforme el resultado al tipo `CuentaCobranza` existente
- Retorne `{ cuentas, totalCount, totalPages }`

### 3. Actualizar `CuentasMantenimiento.tsx`

Reemplazar:
- La query masiva `useQuery(["cuentas_mantenimiento"], ...)` (lineas 162-891) con el nuevo hook
- El filtrado en el cliente (lineas 900-936) ya no sera necesario porque los filtros se aplicaran en el servidor
- La paginacion en el cliente se reemplazara por paginacion del servidor
- Se mantendran todos los dialogos, acciones y UI existente sin cambios

### Seccion Tecnica

**Estructura de la funcion SQL:**

```text
get_cuentas_mantenimiento_paginadas(
  p_page, p_per_page, p_id_cuenta, p_propietarios, p_clabe,
  p_proyecto, p_no_propiedad, p_modelo, p_clave_catastral,
  p_search, p_proyecto_ids, p_dueno_entity_ids
)
```

**CTEs de la funcion:**
- `acuerdos_info`: SUM(monto) de acuerdos_pago por cuenta (pago mensual acumulado)
- `pagos_info`: SUM(monto) de pagos por cuenta (total pagado real)
- `compradores_info`: jsonb_agg de propietarios desde cuenta padre
- `residentes_info`: jsonb_agg de residentes
- `proxima_fecha`: fecha maxima de acuerdos no pagados
- `complementos`: bodegas, estacionamientos, productos como JSON
- `multas_info`: tiene_multas_pendientes por cuenta
- `filtered_accounts`: filtro + paginacion

**Archivos a crear:**
- `supabase/migrations/[timestamp].sql` - Funcion RPC
- `src/hooks/useCuentasMantenimientoPaginadas.ts` - Hook React

**Archivos a modificar:**
- `src/pages/admin/CuentasMantenimiento.tsx` - Reemplazar query con hook paginado
