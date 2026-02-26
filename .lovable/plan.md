

# Fix: Permisos del Portal Agente no se actualizan en tiempo real

## Problema

Cuando un administrador cambia los permisos de un rol (ej. habilitar "generar_oferta"), el usuario con ese rol no ve el cambio hasta que cierra sesion y vuelve a entrar. La suscripcion Realtime existe pero no es confiable al 100%.

## Solucion

Agregar un listener de `visibilitychange` que re-consulta **solo los permisos** (query ligero) cuando el usuario regresa a la pestana. NO recarga la pagina, NO pierde filtros ni estado de la UI.

Para evitar queries excesivos al cambiar frecuentemente de pestana, se aplica un **throttle de 30 segundos**: si los permisos se consultaron hace menos de 30s, no se vuelve a consultar.

## Cambios por archivo

### 1. `src/contexts/AuthContext.tsx`
- Agregar un `useEffect` con listener de `visibilitychange`
- Cuando `document.visibilityState === 'visible'` y hay usuario autenticado, llamar `triggerPermissionRefresh()`
- Incluir un `lastRefreshRef` con timestamp para aplicar throttle de 30 segundos
- Esto incrementa `permissionVersion`, que es la senal que usan los hooks de permisos para re-consultar

### 2. `src/hooks/useAgentPortalPermissions.ts`
- Agregar un `useEffect` con listener de `visibilitychange`
- Cuando la pestana vuelve a estar visible, llamar `fetchPermissions()` directamente
- Aplicar el mismo throttle de 30 segundos con un `lastFetchRef`
- Esto re-consulta `submenus_permisos` en segundo plano sin afectar la UI visible

### 3. `src/hooks/usePagePermissions.ts`
- Mismo patron que el punto 2: listener + throttle + re-fetch silencioso
- Aplica para todas las paginas del admin, no solo portal agente

## Detalle tecnico

Patron con throttle a aplicar en los hooks:

```typescript
const lastFetchRef = useRef<number>(0);

useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastFetchRef.current > 30000) {
        lastFetchRef.current = now;
        fetchPermissions();
      }
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, [fetchPermissions]);
```

## Lo que NO pasa

- NO se recarga la pagina (no hay `window.location.reload()`)
- NO se pierden filtros, formularios, ni datos en pantalla
- NO se ejecutan queries masivos, solo un SELECT ligero a `submenus_permisos`
- NO se dispara en cada cambio de pestana, maximo 1 vez cada 30 segundos

## Resultado esperado

1. Admin cambia permisos de un rol
2. El usuario con ese rol cambia de pestana o regresa a la app
3. Los permisos se recargan silenciosamente en maximo 30 segundos
4. Botones como "Generar oferta" se habilitan/deshabilitan sin perder el estado actual de la pantalla

