

# Plan: Mejoras al Dashboard, Agentes y Configuración del Portal Inmobiliaria (10 puntos)

Dado que son 10 cambios significativos, los divido en 3 fases para implementación ordenada.

---

## Fase 1: Correcciones en Dashboard (puntos 1, 2, 3, 4, 10)

### 1. Ingreso en "Ventas por Agente" basado en precio_final de cuentas_cobranza

**Problema**: La variable `ingreso` en `buildPerf()` (línea 835) suma `monto_comision` de comisionistas. Debería sumar `precio_final` de las cuentas de cobranza de las ventas cerradas (cierre).

**Cambio en `InmobDashboard.tsx`**:
- En `buildPerf()`, calcular `ingreso` sumando `precio_final` de `cuentasMap` para las ofertas del agente en stage `cierre`, en vez de sumar comisiones.

### 2. Ocultar botón "Comisión" cuando no es Sozu

**Cambio en `InmobDashboard.tsx`**:
- En la sección "Ventas por Agente" (línea 1149), filtrar las opciones de `chartMode` para no mostrar `comision` cuando `!isSozu`.
- En la tabla "Desempeño por Agente", ocultar la columna "Comisión" cuando `!isSozu`.
- Si `chartMode === "comision"` y no es Sozu, resetear a `"unidades"`.

### 3. Gráfico "Ingreso Real vs Proyectado" — siempre 6 meses, datos correctos

**Cambio en `InmobDashboard.tsx`**:
- El `areaData` memo (línea 877) dejará de depender de `selectedMonths` y siempre generará 6 meses (actual + 5 atrás).
- Necesita una query nueva independiente que traiga datos de comisiones de Sozu para esos 6 meses:
  - **Cobrado**: Pagos de comisión de Sozu ya hechos (`pagada = true`), usando `fecha_pago` real del pago de comisión (no `fecha_creacion`). Se necesita agregar `fecha_pago` al select de comisionistas o buscar en `pagos_comision`.
  - **Por cobrar**: Comisiones de Sozu no pagadas, donde la `fecha_pago` del enganche (primer pago de la cuenta) cae en ese mes.
  - **Estimado**: Cuentas de cobranza en apartado (`id_estatus_disponibilidad = 4`) cuya fecha de enganche es ese mes. Fórmula: `precio_final * (porcentaje_comision_sozu || 5) / 100`.

Esto requiere queries adicionales para obtener fechas de enganche (primer pago por cuenta) y porcentaje de comisión Sozu.

### 4. Explicación de conversión (sin cambios de código)
Ya implementado: `conversion = (ventas / ofertas) * 100`. Color: verde si > avg×1.1, rojo si < avg×0.8, gris intermedio.

### 10. % de comisión en dashboard
Ya implementado en línea 953-957 con el badge `inmobComisionPorcentaje`. Sin cambios necesarios.

---

## Fase 2: Vista de Agentes (puntos 5, 6, 9)

### 5. Click en agente del dashboard → navegar a Agentes filtrado

**Cambios**:
- `InmobDashboard.tsx` línea 1227: Cambiar `onClick` para navegar a `${NAV_PREFIX}/agentes?q=${encodeURIComponent(agent.nombre)}`.
- `InmobAgentes.tsx`: Leer `?q=` de URL params al montar y usarlo como valor inicial de `search`.

### 6. Avatar + email/teléfono debajo del nombre en tabla de Agentes

**Cambio en `InmobAgentes.tsx`**:
- En la columna "Agente", agregar un círculo con iniciales (Avatar), nombre como texto primario, y email + teléfono (con prefijo de país) como texto secundario debajo.
- Usar `PhoneDisplay` para mostrar el teléfono con clave país (necesita agregar `clave_pais_telefono` al hook `useInmobAgents`).

### 9. Rediseño tabla de Agentes: quitar columnas, agregar Ingreso y menú de acciones

**Cambios en `InmobAgentes.tsx`**:
- **Quitar columnas**: Email, Teléfono (ya están en columna Agente), Aprobadas, Estatus.
- **Agregar columna "Ingreso"**: Suma de `precio_final` de cuentas de cobranza vendidas por ese agente. Requiere query adicional a `cuentas_cobranza` vinculadas a ofertas del agente con propiedades vendidas.
- **Agregar menú "..."** (`DropdownMenu`) con opciones:
  - **Ver perfil 360°**: Navegar a nueva ruta `/admin/portal-inmobiliaria/agentes/:email`.
  - **Editar información**: Dialog para editar nombre, email, teléfono. Al cambiar email → actualizar `usuarios.email`. Al cambiar nombre → actualizar `personas.nombre_legal` y `usuarios.nombre`.
  - **Desactivar/Activar**: Toggle `usuarios.activo`.
  - **Resetear contraseña**: Invocar edge function `reset-user-password`.

**Nuevo archivo `InmobAgentProfile.tsx`**: Página de perfil 360° con KPIs (Prospectos, Ofertas, Apartados, Ventas, Ingreso, Comisión), pipeline activo y comisiones del agente.

**Cambio en `useInmobAgents.ts`**: Agregar campo `clave_pais_telefono` desde `personas`.

**Cambio en `App.tsx`**: Agregar ruta `portal-inmobiliaria/agentes/:email`.

---

## Fase 3: Configuración y Acceso a Proyectos (puntos 7, 8)

### 7. Configuración: proyectos con toggle de acceso para la inmobiliaria

**Cambio en `InmobConfiguracion.tsx`**:
- Agregar nueva pestaña/sección "Proyectos".
- Mostrar todos los proyectos a los que la inmobiliaria tiene acceso (desde `proyectos_acceso` del email principal).
- Cada proyecto tiene un switch/checkbox. La inmobiliaria puede deseleccionar proyectos para que sus agentes NO hereden ese acceso.
- Implementación: Usar una nueva tabla o campo (ej. `inmob_proyectos_config`) o manejar con `proyectos_acceso` activo/inactivo para controlar herencia.

### 8. Acceso a proyectos de agente: disclaimer mejorado + toggles individuales

**Cambio en `UserProjectAccessDialog.tsx` → `AgentReadOnlyAccess`**:
- Actualizar disclaimer (línea 117) para mencionar que también se puede administrar independientemente.
- Agregar checkboxes interactivos por proyecto. Verde = tiene acceso, sin marcar = sin acceso.
- Al toggle: insertar/eliminar de `proyectos_acceso` para el email del agente.
- Solo mostrar proyectos de la inmobiliaria padre.

---

## Resumen de archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `InmobDashboard.tsx` | Puntos 1, 2, 3, 5 |
| `InmobAgentes.tsx` | Puntos 5, 6, 9 |
| `useInmobAgents.ts` | Agregar `clave_pais_telefono` |
| `InmobAgentProfile.tsx` *(nuevo)* | Perfil 360° del agente |
| `App.tsx` | Nueva ruta para perfil agente |
| `InmobConfiguracion.tsx` | Punto 7 |
| `UserProjectAccessDialog.tsx` | Punto 8 |

---

## Propuesta de implementación

Dado el volumen, sugiero implementar en orden: **Fase 1 → Fase 2 → Fase 3**. Esto asegura que los datos del dashboard se corrijan primero, luego la vista de agentes, y finalmente la configuración de proyectos.

