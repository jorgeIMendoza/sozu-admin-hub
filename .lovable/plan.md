
# Plan: Agregar Submenu "Versión Producción" y Sincronización de Versiones

## Resumen del Problema

La versión mostrada en el sidebar (ej: `v2.4.0-260205.0131`) corresponde al **build actual de preview**, mientras que producción tiene una versión diferente (`v2.4.0-260205.0132`). Esto confunde al usuario porque no sabe qué versión está realmente en producción.

## Solución Propuesta

Crear un nuevo submenu **"Versión Producción"** dentro de "Configuraciones/Logs" que muestre:
- La versión actual del ambiente local
- La versión actual publicada en producción (obtenida del `version.json` de producción)
- Estado de sincronización entre ambas versiones
- Historial de últimas publicaciones (opcional)

## Arquitectura de la Solución

```text
Configuraciones/Logs
├── Pregunta a Aloris-IA
├── Logs de Actividad
├── Rastreo CLABEs STP
├── Rastreo Pagos STP
└── Versión Producción    ← NUEVO
```

## Detalles Técnicos

### 1. Nueva Página: VersionProduccion.tsx

Crear la página `src/pages/admin/VersionProduccion.tsx` que:
- Muestre la versión local (del build actual)
- Consulte `https://sozu-admin.lovable.app/version.json` para obtener la versión de producción
- Compare ambas versiones y muestre el estado

| Campo | Valor de Ejemplo |
|-------|------------------|
| Versión Local | v2.4.0-260205.0131 |
| Versión Producción | v2.4.0-260205.0132 |
| Estado | ⚠️ Diferente / ✅ Sincronizado |
| Última Publicación | 2026-02-05 01:32:00 |

### 2. Agregar Ruta en App.tsx

```typescript
const VersionProduccion = lazy(() => import("./pages/admin/VersionProduccion"));

// En las rutas:
<Route path="version-produccion" element={<VersionProduccion />} />
```

### 3. Agregar Submenu en Base de Datos

```sql
INSERT INTO public.submenus (id, nombre, menu_id, vista_front_end, orden, activo)
OVERRIDING SYSTEM VALUE
VALUES (55, 'Versión Producción', 13, '/admin/version-produccion', 55, true)
ON CONFLICT (id) DO NOTHING;
```

### 4. Agregar Icono en useDynamicMenus.ts

```typescript
// En iconMapByPath:
'/admin/version-produccion': GitBranch,
```

### 5. Servicio de Versión de Producción

Actualizar `src/utils/versionUtils.ts` para incluir:

```typescript
const PRODUCTION_URL = 'https://sozu-admin.lovable.app';

export async function fetchProductionVersion(): Promise<{ version: string; buildTime: number } | null> {
  try {
    const response = await fetch(`${PRODUCTION_URL}/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
```

## Diseño de la Página

La página mostrará:

1. **Cards de Versión**
   - Versión Local con badge del ambiente
   - Versión Producción con timestamp de build

2. **Indicador de Estado**
   - Verde si están sincronizadas
   - Amarillo si hay diferencia

3. **Botón de Refrescar**
   - Para recargar la versión de producción

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/VersionProduccion.tsx` | Crear nueva página |
| `src/App.tsx` | Agregar ruta lazy |
| `src/hooks/useDynamicMenus.ts` | Agregar icono `GitBranch` |
| `src/utils/versionUtils.ts` | Agregar función `fetchProductionVersion` |
| Nueva migración SQL | Insertar submenu ID 55 |

## Resultado Esperado

1. El usuario `jorge.mendoza@sozu.com` verá un nuevo submenu "Versión Producción"
2. Al hacer clic, verá una comparación clara entre la versión local y producción
3. Podrá identificar inmediatamente si hay diferencias entre ambientes
