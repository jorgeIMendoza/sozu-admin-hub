
# Plan: Ocultar submenus con solo_usuarioA en Roles y Permisos

## Objetivo
Los submenus marcados con `solo_usuarioA = true` no deben aparecer en la seccion de "Roles y Permisos" ya que su acceso esta controlado exclusivamente por el email hardcodeado, no por permisos de rol.

## Cambio requerido

### Archivo: `src/pages/admin/RolesPermisos.tsx`

**Ubicacion**: Lineas 559-563

**Codigo actual**:
```typescript
const { data: submenusData, error: submenusError } = await supabase
  .from('submenus')
  .select('id, nombre, menu_id, orden')
  .eq('activo', true)
  .order('orden');
```

**Codigo propuesto**:
```typescript
const { data: submenusData, error: submenusError } = await supabase
  .from('submenus')
  .select('id, nombre, menu_id, orden, solo_usuarioA')
  .eq('activo', true)
  .or('solo_usuarioA.is.null,solo_usuarioA.eq.false')
  .order('orden');
```

## Logica de filtrado

El filtro `.or('solo_usuarioA.is.null,solo_usuarioA.eq.false')` incluye submenus donde:
- `solo_usuarioA` es `NULL` (valor por defecto para registros existentes)
- `solo_usuarioA` es `false`

Esto excluye automaticamente los submenus donde `solo_usuarioA = true`.

## Resultado esperado

Los submenus bajo "Configuraciones/Logs" (menu_id 13) que tengan `solo_usuarioA = true` no apareceran en la matriz de permisos de ningun rol, evitando configuraciones accidentales de permisos que no tendrian efecto.
