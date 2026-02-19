

## Plan: Corregir codigo de pais en Prospectos y filtrar proyectos con propiedades disponibles

### Problema 1: Codigo de pais no se muestra en la lista de Prospectos

El dato SI se guarda correctamente en la base de datos (el prospecto "Moral test jorge" tiene `clave_pais_telefono: MX`). El problema esta en el mapeo de datos en `Prospectos.tsx`: al transformar los resultados del query (lineas 190-217), se omite el campo `clave_pais_telefono`. Entonces cuando `PhoneDisplay` lo recibe, viene como `undefined` y muestra el icono de advertencia rojo.

**Archivo:** `src/pages/admin/Prospectos.tsx`
- Agregar `clave_pais_telefono: item.clave_pais_telefono` en el mapeo de datos activos (aprox. linea 199)
- Hacer lo mismo en el mapeo de datos eliminados (query similar mas abajo)

---

### Problema 2: Filtrar proyectos con propiedades disponibles en AddProspectoFloatingDialog

Actualmente el selector de proyecto muestra todos los proyectos accesibles. Se debe filtrar para mostrar solo los que tengan al menos una propiedad con estatus "Disponible" (`id_estatus_disponibilidad = 2`).

La estructura de la base de datos es:
- `propiedades` -> `id_edificio_modelo` -> `edificios_modelos` -> `id_edificio` -> `edificios` -> `id_proyecto`

**Archivo:** `src/components/admin/AddProspectoFloatingDialog.tsx`
- Despues de obtener los proyectos, hacer un segundo query para obtener los IDs de proyectos que tienen propiedades disponibles (via la cadena de relaciones)
- Filtrar la lista de proyectos para mostrar solo los que tengan propiedades disponibles
- Alternativa mas eficiente: usar un query con join para obtener directamente los proyectos con propiedades disponibles

### Detalles tecnicos

**Prospectos.tsx - Mapeo de datos (se repite en ambos queries, activos y eliminados):**
```typescript
// Agregar en el return del map, junto a los demas campos:
clave_pais_telefono: item.clave_pais_telefono,
```

**AddProspectoFloatingDialog.tsx - Query de proyectos con propiedades disponibles:**
```typescript
// Despues de obtener proyectos, filtrar por los que tengan propiedades disponibles
// Query: obtener ids de proyectos con propiedades disponibles
const { data: proyectosConDisponibles } = await supabase
  .from('propiedades')
  .select('id_edificio_modelo, edificios_modelos!inner(id_edificio, edificios!inner(id_proyecto))')
  .eq('id_estatus_disponibilidad', 2)
  .eq('activo', true);

// Extraer IDs unicos de proyectos
// Filtrar la lista de proyectos original
```

