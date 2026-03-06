

# Plan: Corregir detección de "Usuario Principal" y mejorar cambio de rol

## Problema
`jorge.test.inmo@yopmail.com` aparece como "Principal" porque la validación actual solo verifica `rol_id === 4` + email coincide con persona, sin verificar que esa persona sea realmente una inmobiliaria en `entidades_relacionadas`.

## Cambios

### 1. `Usuarios.tsx` — Validar que persona sea inmobiliaria real

En las líneas 447-471, ya se consultan `inmobPersonas` (entidades con `id_tipo_entidad = 5`). Se creará un `Set<number>` con esos `id_persona` y se agregará como tercera condición en `esUsuarioPrincipal`:

```
esUsuarioPrincipal = rol_id === 4 
  && emailCoincide 
  && inmobiliariaPersonaIds.has(u.id_persona)
```

Esto garantiza que solo se marque como principal si la persona del usuario tiene una entrada activa como inmobiliaria (tipo 5) en `entidades_relacionadas`.

### 2. `ChangeUserRoleDialog.tsx` — Selector de inmobiliaria al cambiar rol

Cuando el rol seleccionado es **4 (Inmobiliaria)** o **3 (Agente Inmobiliario)**:
- Mostrar un selector de inmobiliaria (combobox con las inmobiliarias activas)
- Al guardar, además de actualizar `rol_id`, sincronizar:
  - `usuarios.id_persona` → al `id_persona` de la inmobiliaria (si rol 4 y email coincide)
  - `proyectos_acceso` → agregar/actualizar registros con `id_entidad_relacionada_dueno` de la inmobiliaria
- Cuando se cambia **desde** rol 4 a otro, limpiar la vinculación de `proyectos_acceso.id_entidad_relacionada_dueno`

### Archivos a modificar
| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/Usuarios.tsx` | Crear set de personas-inmobiliaria, usarlo en validación de principal (líneas ~456-471) |
| `src/components/admin/ChangeUserRoleDialog.tsx` | Agregar selector de inmobiliaria condicional; sincronizar `proyectos_acceso` al guardar |

