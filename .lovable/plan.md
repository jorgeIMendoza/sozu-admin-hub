

## Plan: Registro multi-rol, selector de rol en login, normalización de emails y fix de teléfono

### Resumen

Permitir que un email existente (ej. comprador) se registre como agente sin ser rechazado. Al hacer login, si el usuario tiene múltiples portales disponibles, mostrar un selector de rol antes de redirigir. Normalizar emails a minúsculas en todos los puntos de entrada. Corregir teléfono N/A en notificaciones.

---

### Cambios por archivo

#### 1. `supabase/functions/registro-publico/index.ts` — Manejar personas existentes

Reemplazar la lógica de líneas 57-84 (que rechaza si persona/usuario existe):

- **Si persona existe** (líneas 58-70): Reutilizar `existingPersona.id`. Verificar si ya tiene entidad tipo 19 activa → solo rechazar en ese caso. Si no, continuar con ese `id`.
- **Si auth user existe** (línea 131): Capturar error "already registered", buscar el auth user existente, reutilizar su ID y resetear password a `Temporal123!`.
- **Si usuario existe en `usuarios`** (líneas 73-84): No rechazar. Actualizar `debe_cambiar_password=true`, `email_confirmado=false`. No cambiar `rol_id` (se cambiará en el login al seleccionar portal).
- **Si persona no existe**: Crear nueva (flujo actual).
- Actualizar teléfono/nombre en persona existente si están vacíos.

#### 2. `src/pages/auth/Login.tsx` — Selector de rol post-login

Después del `signIn` exitoso (línea 86):

1. Obtener `id_persona` del usuario desde `usuarios`.
2. Consultar `entidades_relacionadas` para ese `id_persona` con tipos activos.
3. Mapear tipos a portales:
   - Tipo 2 (Comprador) → "Portal Cliente" (rol_id 23, ruta `/admin/portal-cliente/inicio`)
   - Tipo 19 (Agente) → "Portal Agente" (rol_id 3, ruta `/admin`)
4. **Si solo 1 portal**: redirigir directo (como ahora).
5. **Si múltiples portales**: mostrar un diálogo modal con tarjetas clicables (icono + nombre del portal).
6. Al elegir, hacer `UPDATE usuarios SET rol_id = X WHERE email = Y`, luego redirigir.

Agregar estados: `availablePortals`, `showPortalSelector`. Crear componente inline del diálogo con tarjetas estilizadas consistentes con el diseño del login.

#### 3. `src/components/admin/PersonForm.tsx` — Email toLowerCase

- Línea 735: `email: email.trim().toLowerCase()`
- Línea 824: `email: email.trim().toLowerCase()`

#### 4. `supabase/functions/create-client-user/index.ts` — Email toLowerCase

- Línea 42: Normalizar email al recibirlo: `const emailLower = email.toLowerCase().trim();` y usar `emailLower` en todas las operaciones (createUser, update query).

#### 5. `supabase/functions/create-user/index.ts` — Email toLowerCase

- Después de línea 102: Normalizar email: `const emailLower = email.toLowerCase().trim();` y usar en todas las operaciones subsiguientes.

#### 6. `supabase/functions/bulk-create-agents/index.ts` — Ya normaliza

- Ya tiene `agent.email?.trim().toLowerCase()` en línea 160 y 293. Sin cambios necesarios.

#### 7. `supabase/functions/post-confirmacion-registro/index.ts` — Fallback teléfono

- Línea 110-114: Después de obtener `usuarioData`, si `telefono` es null, buscar en tabla `personas` por email:
```
let telefono = usuarioData?.telefono;
if (!telefono) {
  const { data: personaData } = await supabase.from('personas').select('telefono').ilike('email', email.toLowerCase()).maybeSingle();
  telefono = personaData?.telefono;
}
```
- Usar `telefono || 'N/A'` en la notificación admin (línea 143).

#### 8. `supabase/functions/notificar-confirmacion-email/index.ts` — Fallback teléfono

- Después de línea 46: Si `usuarioData?.telefono` es null, buscar en `personas`:
```
let telefono = usuarioData?.telefono;
if (!telefono) {
  const { data: personaData } = await supabase.from('personas').select('telefono').ilike('email', email.toLowerCase()).maybeSingle();
  telefono = personaData?.telefono;
}
```
- Usar en línea 120.

---

### UI del selector de rol

Diálogo modal centrado sobre el fondo del login, con:
- Título: "Selecciona tu portal"
- Subtítulo: "Tienes acceso a múltiples portales"
- Tarjetas clicables con icono (Building2 para Agente, User para Cliente), nombre y descripción corta
- Al hacer clic: actualiza rol_id y redirige
- Estilo consistente con `login-card` existente

