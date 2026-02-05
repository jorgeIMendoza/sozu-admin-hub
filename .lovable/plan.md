
# Plan: Administrador de Menus y Submenus (Opción B - Con Validación de Rutas)

## Resumen
Crear una nueva vista "Administrar Menus" en el menu "Configuraciones/Logs" que permita gestionar menus y submenus del sistema con funcionalidades de drag & drop, edicion en linea, y control de permisos. **Incluye validacion de rutas**: Al crear un nuevo submenu, se advertira si la ruta frontend no existe aún en el codigo React (en `src/App.tsx`), indicando que se debe crear manualmente.

---

## 1. Cambios en Base de Datos

### 1.1 Nuevo campo en tabla `submenus`
```sql
ALTER TABLE public.submenus 
ADD COLUMN IF NOT EXISTS solo_jorge BOOLEAN DEFAULT false;
```

### 1.2 Nuevo registro en `submenus`
```sql
INSERT INTO public.submenus (id, nombre, menu_id, vista_front_end, orden, activo)
OVERRIDING SYSTEM VALUE
VALUES (56, 'Administrar Menus', 13, '/admin/administrar-menus', 56, true)
ON CONFLICT (id) DO NOTHING;
```

### 1.3 Crear permiso inicial para Super Admin
```sql
-- Insertar permisos para Super Admin (rol_id=1) en el nuevo submenu
INSERT INTO public.submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT 56, id, 1, true FROM permisos WHERE nombre = 'leer'
ON CONFLICT DO NOTHING;
```

---

## 2. Logica de Validacion de Rutas

### 2.1 Archivo: `src/utils/validRoutes.ts` (NUEVO)
Este archivo mantiene una lista de las rutas validas registradas en `src/App.tsx`. Se actualiza manualmente cuando se agregan nuevas rutas al router:

```typescript
// Rutas validas del sistema (deben coincidir con las rutas en src/App.tsx)
export const VALID_ADMIN_ROUTES = new Set([
  '/admin/proyectos',
  '/admin/propiedades',
  '/admin/usuarios',
  '/admin/usuarios/nuevo',
  '/admin/usuarios-directivos',
  '/admin/usuarios-clientes',
  '/admin/roles-permisos',
  '/admin/entidades-legales',
  '/admin/desarrolladores',
  '/admin/inmobiliarias',
  '/admin/administradoras',
  '/admin/notarias',
  '/admin/bancos',
  '/admin/prospectos',
  '/admin/compradores',
  '/admin/vendedores',
  '/admin/duenos',
  '/admin/residentes',
  '/admin/agentes',
  '/admin/administradores-personas',
  '/admin/representantes-legales',
  '/admin/representantes-comerciales',
  '/admin/productos',
  '/admin/servicios',
  '/admin/categorias-productos',
  '/admin/amenidades',
  '/admin/caracteristicas',
  '/admin/modelos',
  '/admin/vistas',
  '/admin/estacionamientos',
  '/admin/bodegas',
  '/admin/cuentas-cobranza',
  '/admin/cuentas-mantenimiento',
  '/admin/comisiones',
  '/admin/aprobacion-comisiones',
  '/admin/comisiones-externas',
  '/admin/pagar-comisiones',
  '/admin/pago-proveedores',
  '/admin/pagos',
  '/admin/cuentas-bancarias',
  '/admin/documentos',
  '/admin/notarios/revision-documentacion',
  '/admin/consultas-ia',
  '/admin/reservas',
  '/admin/legal/contratos',
  '/admin/reportes/discrepancias',
  '/admin/logs-actividad',
  '/admin/rastreo-clabes-stp',
  '/admin/rastreo-pagos-stp',
  '/admin/configuracion-reportes',
  '/admin/version-produccion',
  '/admin/reportes/inventarios',
  '/admin/reportes/finanzas',
  '/admin/reportes/ver/:id',
  '/admin/inmobiliarias/mi-informacion',
  '/admin/inmobiliarias/mis-agentes',
  '/admin/inmobiliarias/mis-propiedades',
  '/admin/inmobiliarias/mis-ventas',
  '/admin/administrar-menus',  // Nueva ruta
]);

export function isValidRoute(route: string): boolean {
  if (!route || !route.startsWith('/admin/')) {
    return false;
  }
  
  // Soporte para rutas parametrizadas (ej: /admin/reportes/ver/:id)
  const routePattern = route
    .replace(/:\w+/g, ':param'); // Normalizar parametros
  
  // Buscar ruta exacta o con parametro normalizado
  for (const validRoute of VALID_ADMIN_ROUTES) {
    if (validRoute === route || validRoute.replace(/:\w+/g, ':param') === routePattern) {
      return true;
    }
  }
  
  return false;
}
```

---

## 3. Archivos Nuevos

### 3.1 Pagina Principal: `src/pages/admin/AdministrarMenus.tsx`

**Estructura:**
- Seccion de Menus (drag & drop, edicion inline, toggles)
- Seccion de Submenus agrupados por Menu (colapsable, drag & drop)
- Boton "Nuevo Submenu" que abre dialog
- Dialog para crear nuevo submenu con validacion de ruta

**Funcionalidades principales:**

```text
1. Cargar menus y submenus activos
2. Mostrar menus ordenados por campo 'orden'
3. Mostrar submenus agrupados y ordenados
4. Permitir drag & drop para reordenar (actualiza BD inmediatamente)
5. Editar nombre inline (actualiza al perder foco)
6. Toggle "Activo/Inactivo" (actualiza inmediatamente)
7. Toggle "Solo Jorge" (actualiza inmediatamente)
8. Boton "Nuevo Submenu" -> abre dialog
9. Creacion de submenu con:
   - Menu padre (select)
   - Nombre (required, min 3 caracteres)
   - Ruta frontend (required, debe empezar con /admin/)
   - Toggle "Solo para Jorge"
   - Multi-select de permisos
   - VALIDACION: Si ruta no existe en validRoutes.ts, mostrar warning
   - Boton "Crear" -> confirmacion
10. Confirmacion muestra todos detalles
11. Al confirmar:
    - INSERT en submenus
    - INSERT permisos para Super Admin con TODOS los permisos seleccionados
    - Toast exito
    - Refrescar lista
```

**Componentes UI utilizados:**
- `Switch` para toggles activo/solo_jorge
- `Input` para edicion inline
- `Dialog` para nuevo submenu
- `AlertDialog` para confirmacion
- `Collapsible` para grupos de menus
- `Select` para menu padre
- `Checkbox` para permisos
- `DndContext`, `SortableContext` de @dnd-kit
- `GripVertical`, `AlertCircle`, `Plus` icons

### 3.2 Componente: `src/components/admin/SortableMenuCard.tsx` (NUEVO)

Componente reutilizable para cada Menu:
- `useSortable` hook
- Input editable para nombre
- Switch para activo/inactivo
- Estilos de arrastre visuales (opacity, shadow)
- Manejo de actualizaciones a BD

### 3.3 Componente: `src/components/admin/SortableSubmenuRow.tsx` (NUEVO)

Componente reutilizable para cada Submenu:
- `useSortable` hook
- Inputs editables para nombre y ruta
- Switches para activo y solo_jorge
- Boton eliminar
- Actualizaciones inmediatas a BD en cambios

### 3.4 Componente: `src/components/admin/NewSubmenuDialog.tsx` (NUEVO)

Dialog para crear nuevo submenu:
- Formulario con validaciones
- Multi-select de permisos disponibles
- **Validacion de ruta**: Verifica `isValidRoute()` y muestra warning si no existe
- Boton crear abre AlertDialog de confirmacion
- Confirmacion lista todos los detalles

---

## 4. Archivos a Modificar

### 4.1 `src/hooks/useDynamicMenus.ts`

**Cambios:**
1. Actualizar interfaz `RawSubmenu` para incluir `solo_jorge`:
```typescript
interface RawSubmenu {
  id: number;
  nombre: string;
  vista_front_end: string | null;
  menu_id: number;
  orden: number;
  solo_jorge?: boolean;  // NUEVO
  menus: { id: number; nombre: string; } | null;
}
```

2. Agregar logica para filtrar submenus con `solo_jorge`:
```typescript
// En filtro de filteredSubmenus (linea ~236-255)
const filteredSubmenus = (submenusData as unknown as RawSubmenu[])?.filter(submenu => {
  // Si el submenu es solo para jorge, verificar email
  if (submenu.solo_jorge && userEmail !== LOGS_ALLOWED_EMAIL) {
    return false;
  }
  
  // Logica existente...
});
```

3. Actualizar query SELECT para incluir `solo_jorge`:
```typescript
const { data: submenusData } = await supabase
  .from('submenus')
  .select(`
    id,
    nombre,
    vista_front_end,
    menu_id,
    orden,
    solo_jorge,  // NUEVO
    menus!inner (id, nombre)
  `)
  .eq('activo', true)
  .order('orden');
```

### 4.2 `src/hooks/useAllowedMenus.ts`

**Cambios:**
1. Agregar logica `solo_jorge` en el fetch de submenus:
```typescript
const { data: submenusData } = await supabase
  .from('submenus')
  .select('vista_front_end, solo_jorge')  // NUEVO: incluir solo_jorge
  .in('id', submenuIds)
  .eq('activo', true);

// Filtrar submenus que solo sean para jorge
const userEmail = profile?.email;
submenusData?.forEach((item: any) => {
  if (!item.solo_jorge || userEmail === 'jorge.mendoza@sozu.com') {
    if (item.vista_front_end) {
      paths.add(item.vista_front_end);
    }
  }
});
```

### 4.3 `src/App.tsx`

**Cambios:**
1. Agregar lazy load del componente:
```typescript
const AdministrarMenus = lazy(() => import("./pages/admin/AdministrarMenus"));
```

2. Agregar ruta en el router:
```typescript
<Route path="administrar-menus" element={<AdministrarMenus />} />
```

3. Agregar icono a `useDynamicMenus.ts` (en el mapeo de iconos):
```typescript
const iconMapByPath: Record<string, LucideIcon> = {
  // ... existentes
  '/admin/administrar-menus': Settings,  // o LayoutList
};
```

---

## 5. Flujo de Operaciones

### 5.1 Reordenar Menus/Submenus
```
Usuario arrastra y suelta
         |
         v
onDragEnd trigger
         |
         v
Calcular nuevos indices de 'orden'
         |
         v
UPDATE en BD (Promise.all)
         |
         v
Toast confirmacion
         |
         v
UI se actualiza automáticamente
```

### 5.2 Crear Nuevo Submenu
```
Click "Nuevo Submenu"
         |
         v
Dialog abre con formulario
         |
         v
Usuario completa:
- Menu padre (select)
- Nombre (validar min 3 chars)
- Ruta frontend (validar formato /admin/*)
- Solo para Jorge (toggle)
- Permisos disponibles (multi-select)
         |
         v
VALIDACION EN TIEMPO REAL:
Verifica isValidRoute(ruta)
Si NO existe -> mostrar AlertCircle icon + warning text:
"⚠️ Esta ruta aún no existe en el código. 
Deberás crear la página en src/pages/admin/ 
y registrar la ruta en src/App.tsx"
         |
         v
Click "Crear"
         |
         v
AlertDialog de confirmacion:
"¿Crear submenu con estos detalles?
- Menu: [nombre]
- Nombre: [nombre]
- Ruta: [ruta]
- Solo para Jorge: [si/no]
- Permisos: [lista]"
         |
         v
Click "Confirmar"
         |
         v
1. INSERT en submenus (returningId)
2. INSERT en submenus_permisos:
   - Para Super Admin (rol_id=1): TODOS los permisos seleccionados
   - Para otros roles: ninguno (deben agregarse manualmente)
3. Toast exito
4. Dialog cierra
5. Lista se refrescar
```

---

## 6. Operaciones de Base de Datos

### 6.1 Actualizar nombre inline
```sql
UPDATE submenus SET nombre = $1, fecha_actualizacion = NOW() WHERE id = $2
-- o
UPDATE menus SET nombre = $1, fecha_actualizacion = NOW() WHERE id = $2
```

### 6.2 Actualizar ruta frontend
```sql
UPDATE submenus SET vista_front_end = $1, fecha_actualizacion = NOW() WHERE id = $2
```

### 6.3 Toggle activo
```sql
UPDATE submenus SET activo = $1, fecha_actualizacion = NOW() WHERE id = $2
-- o
UPDATE menus SET activo = $1, fecha_actualizacion = NOW() WHERE id = $2
```

### 6.4 Toggle solo_jorge
```sql
UPDATE submenus SET solo_jorge = $1, fecha_actualizacion = NOW() WHERE id = $2
```

### 6.5 Reordenar (actualizar orden en batch)
```sql
UPDATE submenus SET orden = $2, fecha_actualizacion = NOW() WHERE id = $1
```

### 6.6 Crear nuevo submenu con permisos
```sql
-- 1. Insertar submenu
INSERT INTO submenus (nombre, menu_id, vista_front_end, orden, activo, solo_jorge)
VALUES ($nombre, $menu_id, $vista_front_end, $orden, true, $solo_jorge)
RETURNING id;

-- 2. Insertar permisos para Super Admin
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT $submenu_id, id, 1, true 
FROM permisos 
WHERE id = ANY($permiso_ids::integer[])
```

---

## 7. Consideraciones Tecnicas

### 7.1 Actualizaciones Inmediatas (Sin Guardar)
Cuando el usuario edita nombre, toggle activo, o toggle solo_jorge, debe:
1. Actualizar en BD inmediatamente (sin boton guardar)
2. Mostrar loading state breve
3. Mostrar toast exito silencioso o feedback visual
4. Si error, mostrar toast error y revertir cambio en UI

### 7.2 Drag & Drop
- Usar `@dnd-kit/core` y `@dnd-kit/sortable` (ya instalados)
- Al soltar, recalcular indices de 'orden' secuencialmente (0, 1, 2, ...)
- Usar `Promise.all()` para actualizar multiples registros en paralelo
- Invalidar cache de React Query o recargar lista

### 7.3 Validacion de Ruta
- Función `isValidRoute()` de `src/utils/validRoutes.ts`
- Mostrar warning icon (AlertCircle) si ruta no existe
- Permitir crear submenu igual (el usuario puede crear la pagina después)
- En formulario: mostrar helper text con instrucciones

### 7.4 Permisos
Al crear nuevo submenu:
- Super Admin siempre obtiene TODOS los permisos disponibles
- Otros roles NO reciben permisos automaticamente
- El admin debe agregar permisos manualmente a través de otra interfaz (RolesPermisos)

### 7.5 Validaciones
- Nombre: requerido, minimo 3 caracteres
- Ruta: requerido, debe empezar con `/admin/`
- Ruta: debe ser unica
- Menu padre: requerido
- Al menos 1 permiso seleccionado para crear

---

## 8. Resumen de Archivos

| Accion | Archivo |
|--------|---------|
| Crear | `src/pages/admin/AdministrarMenus.tsx` |
| Crear | `src/components/admin/SortableMenuCard.tsx` |
| Crear | `src/components/admin/SortableSubmenuRow.tsx` |
| Crear | `src/components/admin/NewSubmenuDialog.tsx` |
| Crear | `src/utils/validRoutes.ts` |
| Modificar | `src/hooks/useDynamicMenus.ts` |
| Modificar | `src/hooks/useAllowedMenus.ts` |
| Modificar | `src/App.tsx` |
| Migracion BD | Agregar campo `solo_jorge` a `submenus` |
| Migracion BD | Insertar submenu id=56 "Administrar Menus" |

---

## 9. Diferencia con Opcion A

**Opcion B (ESTA)** = Validacion de rutas + warning si no existe en el codigo React
- Mejor UX: el usuario ve claramente si la ruta ya existe o no
- Mas seguro: previene crear submenus "huerfanos"
- Requiere actualizar `src/utils/validRoutes.ts` cuando se agregan nuevas rutas

