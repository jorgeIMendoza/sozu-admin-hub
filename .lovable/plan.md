

## Plan: Corregir resolución de inmobiliaria en todo el sistema

### Problema
El hook `useInmobiliariaPersonaId.ts` (usado por todo el portal inmobiliario) resuelve la identidad de la inmobiliaria buscando en `proyectos_acceso.id_entidad_relacionada_dueno`. Si esos registros apuntan a otra entidad (ej: Vivalta), el usuario ve datos incorrectos aunque su `id_persona` sea directamente "Brokers and Brothers".

Esto afecta: dashboard, comisiones, agentes, proyectos — toda la experiencia del portal.

### Solución

**Archivos a modificar:**

1. **`src/hooks/useInmobiliariaPersonaId.ts`** — Agregar verificación directa como paso prioritario:
   - Antes de buscar en `proyectos_acceso`, verificar si `profile.id_persona` existe como inmobiliaria activa (tipo 5) en `entidades_relacionadas`
   - Si existe, retornar ese `id_persona` directamente
   - Solo usar el fallback de `proyectos_acceso` si la persona del usuario NO es una inmobiliaria (caso de usuarios secundarios/staff)

2. **`src/components/admin/EditUserDialog.tsx`** — Aplicar la misma lógica ya planificada previamente para el diálogo de edición

### Cambio técnico principal (useInmobiliariaPersonaId)

Insertar al inicio del `queryFn`, después del check de Super Admin:

```typescript
// Step 0: If user's own persona IS an inmobiliaria, use it directly
if (directId) {
  const { data: directInmob } = await supabase
    .from('entidades_relacionadas')
    .select('id_persona')
    .eq('id_persona', directId)
    .eq('id_tipo_entidad', 5)
    .eq('activo', true)
    .maybeSingle();
  
  if (directInmob?.id_persona) {
    return directInmob.id_persona;
  }
}
// ... resto del fallback existente para usuarios secundarios
```

Esto garantiza que cuando `contacto@brokersandbrothers.com` inicie sesión, todo el portal muestre datos de "Brokers and Brothers".

