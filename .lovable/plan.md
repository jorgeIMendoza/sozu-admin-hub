

## Problema

El `ThemeProvider` tiene `defaultTheme="system"`, lo que significa que si el celular del agente tiene modo oscuro activado, la app se muestra en oscuro. No existe ninguna logica que fuerce el tema claro para los roles simplificados (Agente Inmobiliario / Inmobiliaria).

Ademas, el `ThemeToggle` esta oculto para estos roles, asi que ni siquiera pueden cambiarlo manualmente.

## Solucion

Agregar un efecto en el `AdminLayout` (o en el `AdminHeader`) que detecte si el usuario tiene un rol simplificado y, de ser asi, fuerce el tema a "light" usando `setTheme("light")` de `next-themes`.

## Cambios

### 1. `src/components/admin/AdminLayout.tsx`

- Importar `useTheme` de `next-themes`.
- Agregar un `useEffect` que, cuando `isSimplifiedRole` sea `true`, llame a `setTheme("light")`.
- El efecto se ejecuta una sola vez al montar el layout (o cuando cambie el perfil del usuario).

```text
Logica del efecto:
  Si isSimplifiedRole === true
    -> setTheme("light")
```

Esto es todo. Un solo cambio en un solo archivo. No se requieren migraciones ni tablas nuevas.

