

## Plan: Aplicar Design System SOZU exclusivamente a paginas de "Datos Inmobiliarios"

### Objetivo
Aplicar la paleta de colores, tipografia, backgrounds, sombras y utilidades del design system SOZU **unicamente** a las paginas del menu "Datos Inmobiliarios", sin afectar el resto de la aplicacion. Ademas, aumentar el efecto de "brinco" en las cards.

### Paginas afectadas (menu Datos Inmobiliarios)
- `/admin/inmobiliarias/mi-informacion` - MiInformacion
- `/admin/inmobiliarias/inventario` - InventarioGlobal (A/B)
- `/admin/inmobiliarias/mis-agentes` - MisAgentes
- `/admin/inmobiliarias/mis-ventas` - MisVentas
- `/admin/inmobiliarias/proyectos` - MisProyectos
- `/admin/inmobiliarias/proyectos/:id` - MiProyectoDetalle
- `/admin/inmobiliarias/proyectos/:id/inventario` - MiProyectoInventario

### Estrategia tecnica

**1. CSS Scoped con clase `.sozu-theme`**

Se agregaran las variables CSS del design system SOZU dentro de un selector `.sozu-theme` en `src/index.css`. Esto hace que las variables solo apliquen cuando un ancestro tenga esa clase, sin modificar el resto del sistema.

Variables incluidas:
- Background/foreground/card/popover (blanco limpio)
- Primary (negro SOZU), Accent (verde SOZU #57ae75)
- Tokens de marca: `--sozu-black`, `--sozu-green`, `--sozu-gray`
- Secciones: `--section-light`, `--section-soft`, `--section-muted`
- Gradientes: `--gradient-hero`, `--gradient-card`, `--gradient-accent`, `--gradient-section`
- Sombras: `--shadow-sm/md/lg/accent/card`
- Ring verde en lugar del actual

**2. Utilidades CSS scoped**

Dentro de `.sozu-theme`, se agregaran clases utilitarias como:
- `.gradient-hero`, `.gradient-accent`, `.gradient-section`
- `.shadow-card`, `.shadow-accent`
- `.text-gradient-emerald`
- `.glass-card`, `.glass-card-light`
- `.chip-accent`, `.section-label`
- `.card-hover` con efecto de brinco **aumentado** (`translateY(-6px) scale(1.03)`)

**3. Tailwind Config - tokens adicionales**

Se agregaran al `tailwind.config.ts`:
- Colores: `navy`, `emerald`, `gold`, `sozu` (scoped a las variables CSS)
- `accent.light`, `accent.glow`
- Sombras: `card`, `card-md`, `accent`
- Background images: `gradient-hero`, `gradient-accent`, `gradient-section`, `gradient-card`
- Border radius: `xl`, `2xl`, `3xl`

**4. Layout wrapper para rutas inmobiliarias**

Se creara un componente `InmobiliariasThemeWrapper` que simplemente envuelve a sus `children` en un `<div className="sozu-theme">`. Este wrapper se usara en `App.tsx` agrupando las rutas de inmobiliarias dentro de una `<Route>` con este layout, de modo que todas las paginas hijas hereden el scope automaticamente.

```text
App.tsx
  └── <Route element={<InmobiliariasThemeWrapper />}>
        ├── inmobiliarias/mi-informacion
        ├── inmobiliarias/inventario
        ├── inmobiliarias/mis-agentes
        ├── inmobiliarias/mis-ventas
        ├── inmobiliarias/proyectos
        ├── inmobiliarias/proyectos/:id
        └── inmobiliarias/proyectos/:id/inventario
      </Route>
```

**5. Efecto de brinco aumentado en cards**

Se definira en `.sozu-theme` un efecto `.card-hover` mas agresivo:
- `hover: translateY(-6px) scale(1.03)` (antes era `-3px` sin scale)
- Sombra elevada al hacer hover
- Transicion suave de 0.3s

### Archivos a crear
- `src/components/admin/InmobiliariasThemeWrapper.tsx` - wrapper con `<Outlet />` dentro de `<div className="sozu-theme">`

### Archivos a modificar
- `src/index.css` - agregar bloque `.sozu-theme { ... }` con todas las variables y utilidades scoped
- `tailwind.config.ts` - agregar tokens de colores (`navy`, `emerald`, `gold`, `sozu`, `accent.light`, `accent.glow`), sombras, gradientes, y border-radius extra
- `src/App.tsx` - agrupar las rutas de inmobiliarias bajo el wrapper

### Resultado esperado
- Solo las vistas de "Datos Inmobiliarios" tendran la paleta SOZU (fondo blanco limpio, primary negro, accent verde, gradientes, sombras elegantes)
- El resto de la aplicacion mantiene su estilo actual intacto
- Las cards en estas vistas tendran un efecto de brinco mas pronunciado al hacer hover

