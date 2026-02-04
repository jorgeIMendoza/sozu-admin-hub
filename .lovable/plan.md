
# Plan: Corregir conteos de pestañas Draft y Eliminados en vista de Propiedades

## Problema Identificado

Cuando filtras por número de departamento (ej. "203"), los conteos en las pestañas "Draft" y "Eliminados" muestran 0 inicialmente. Sin embargo, al hacer clic en la pestaña "Draft", el conteo se actualiza correctamente a 1.

**Causa raíz**: Las queries de React Query para "Draft" y "Eliminados" solo se ejecutan cuando su pestaña está activa:
- Query Draft: `enabled: activeTab === "draft" && !isLoadingAccess`
- Query Eliminados: `enabled: activeTab === "eliminados" && !isLoadingAccess`

Esto significa que cuando estás en la pestaña "Activos" y aplicas un filtro de búsqueda, las queries de las otras pestañas no se ejecutan, por lo que sus conteos permanecen en 0.

## Solución Propuesta

Modificar las condiciones `enabled` de las queries de "Draft" y "Eliminados" para que siempre se ejecuten cuando los filtros cambian, independientemente de qué pestaña esté activa.

### Cambios Técnicos

**Archivo: `src/pages/admin/Propiedades.tsx`**

1. **Query de Draft (línea ~2595)**:
   - Cambiar de: `enabled: activeTab === "draft" && !isLoadingAccess`
   - A: `enabled: !isLoadingAccess && (canUpdate || isSuperAdmin)`
   
   Esto asegura que la query de Draft siempre se ejecute para usuarios que tienen permiso de ver esa pestaña.

2. **Query de Eliminados (línea ~3008)**:
   - Cambiar de: `enabled: activeTab === "eliminados" && !isLoadingAccess`
   - A: `enabled: !isLoadingAccess && canSeeAdvancedFilters`
   
   Esto asegura que la query de Eliminados siempre se ejecute para usuarios que tienen permiso de ver esa pestaña.

### Consideraciones de Rendimiento

- Las queries incluirán todos los filtros en su `queryKey`, lo que significa que React Query las cacheará correctamente
- Las queries solo se ejecutarán cuando los filtros cambien (gracias a la dependencia en el queryKey)
- El impacto en rendimiento es mínimo ya que las queries solo se re-ejecutan cuando es necesario

### Resultado Esperado

Después de implementar estos cambios:
1. Al filtrar por "203" en la vista de Propiedades, los conteos de todas las pestañas se actualizarán simultáneamente
2. La pestaña "Draft" mostrará "(1)" inmediatamente después de aplicar el filtro
3. La pestaña "Eliminados" también reflejará el conteo correcto de propiedades eliminadas que coinciden con el filtro
