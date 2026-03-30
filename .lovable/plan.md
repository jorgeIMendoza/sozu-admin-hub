

# Plan: Impersonation de Agente e Inmobiliaria en sus Portales

## Resumen

Agregar selectores de impersonación (como el que ya existe en Portal Cliente) para que un Super Admin pueda seleccionar un agente específico en el Portal de Agentes, o una inmobiliaria específica en el Portal de Inmobiliaria, y ver exactamente lo que ese usuario vería.

---

## Cambios

### 1. Crear `InmobiliariaImpersonationContext`
- Nuevo archivo `src/contexts/InmobiliariaImpersonationContext.tsx` siguiendo el mismo patrón de `ClienteImpersonationContext`
- Campos: `impersonatedInmobiliariaEmail`, `impersonatedInmobiliariaPersonaId`, `impersonatedInmobiliariaName`
- Envolver en `App.tsx` igual que los otros providers

### 2. Crear `InmobiliariaImpersonationSelector`
- Nuevo componente `src/components/admin/portal-inmobiliaria/InmobiliariaImpersonationSelector.tsx`
- Query a `usuarios` con `rol_id = 4` (Inmobiliaria) para listar opciones
- Mismo patrón visual que `ClienteImpersonationSelector` (Popover + Command + búsqueda)

### 3. Crear `AgentImpersonationSelector` para el Portal de Agentes
- Nuevo componente `src/components/admin/agent-portal/AgentPortalImpersonationSelector.tsx`
- Reutiliza la query existente del `AgentImpersonationSelector` (roles 3, 4, 9) pero filtrado a solo agentes (3, 9)
- Estilo adaptado al diseño del portal de agentes (más compacto, mobile-friendly)

### 4. Integrar selector en `PortalInmobiliariaLayout`
- Agregar `InmobiliariaImpersonationSelector` en el topbar (desktop) y header (mobile), igual que en Portal Cliente
- Cuando hay impersonación activa, `useInmobiliariaPersonaId` debe devolver el `personaId` de la inmobiliaria seleccionada

### 5. Integrar selector en `AgentPortalLayout`
- Agregar `AgentPortalImpersonationSelector` como barra sticky superior (visible solo para Super Admin)
- Al estar activo, todas las páginas del portal deben usar el email/personaId del agente impersonado

### 6. Actualizar `useInmobiliariaPersonaId` para soportar impersonación
- Leer `InmobiliariaImpersonationContext`
- Si hay impersonación activa, devolver directamente el `personaId` seleccionado sin resolver

### 7. Actualizar páginas del Portal de Agentes para usar impersonación
Las siguientes páginas usan `profile?.id_persona` y `user?.email` directamente y necesitan actualizarse para leer de `AgentImpersonationContext`:

- **AgentInicio.tsx** — `personaId`, `agentEmail`, `nombre`
- **AgentInventario.tsx** — email para filtrar inventario
- **AgentComisiones.tsx** — personaId para comisiones
- **AgentPerfil.tsx** — personaId para onboarding/perfil
- **AgentProspectos.tsx** — email para prospectos
- **AgentPipeline.tsx** — ya lo usa (solo verificar)
- **AgentProyectoDetalle.tsx / AgentUnidadesProyecto.tsx** — email para acceso

Patrón en cada página:
```typescript
const { impersonatedAgentEmail, impersonatedAgentPersonaId, isImpersonating } = useAgentImpersonation();
const effectiveEmail = isImpersonating ? impersonatedAgentEmail : (user?.email || profile?.email);
const effectivePersonaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
```

### 8. Actualizar páginas del Portal de Inmobiliaria
Las páginas ya usan `useInmobiliariaPersonaId()` que será actualizado en el paso 6, por lo que la mayoría funcionará automáticamente. Verificar que todas las queries dependan de ese hook.

---

## Archivos a crear
- `src/contexts/InmobiliariaImpersonationContext.tsx`
- `src/components/admin/portal-inmobiliaria/InmobiliariaImpersonationSelector.tsx`
- `src/components/admin/agent-portal/AgentPortalImpersonationSelector.tsx`

## Archivos a modificar
- `src/App.tsx` — agregar `InmobiliariaImpersonationProvider`
- `src/hooks/useInmobiliariaPersonaId.ts` — leer contexto de impersonación
- `src/components/admin/portal-inmobiliaria/PortalInmobiliariaLayout.tsx` — agregar selector en topbar
- `src/components/admin/agent-portal/AgentPortalLayout.tsx` — agregar selector en barra superior
- `src/pages/admin/agent-portal/AgentInicio.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentInventario.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentComisiones.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentPerfil.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentProspectos.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentProyectoDetalle.tsx` — usar impersonación
- `src/pages/admin/agent-portal/AgentUnidadesProyecto.tsx` — usar impersonación

