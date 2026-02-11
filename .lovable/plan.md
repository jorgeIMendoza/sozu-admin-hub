

## Correccion: Permitir que "Administrador de Proyecto" resetee contrasenas de Inmobiliaria y Agente Inmobiliario

### Problema
La linea 178 de `reset-user-password/index.ts` solo permite el rol "Super Administrador" en modo JWT. Cualquier otro rol recibe un 403.

### Solucion
Modificar la validacion de roles en `handleJwtMode` para:

- **Super Administrador (ID 1)**: puede resetear cualquier usuario (sin cambios)
- **Administrador de Proyecto (ID 2)**: puede resetear unicamente usuarios con rol Inmobiliaria (ID 4) o Agente Inmobiliario (ID 3). Si intenta resetear otro rol, se rechaza con 403.
- **Cualquier otro rol**: se rechaza con 403

### Cambio tecnico

En `supabase/functions/reset-user-password/index.ts`, reemplazar la validacion actual (lineas 178-180):

```text
// Antes:
if (rolNombre !== 'Super Administrador') -> 403

// Despues:
if (rolNombre === 'Super Administrador') -> permitir sin restriccion
else if (requestingUserData.rol_id === 2) -> mover findUserByEmail antes de esta validacion, verificar que targetUser.rol_id sea 3 o 4
else -> 403
```

Esto requiere reorganizar el flujo para que la consulta del usuario objetivo se haga antes de la verificacion de permisos cuando el solicitante es Administrador de Proyecto.

### Resumen
| Archivo | Cambio |
|---|---|
| `supabase/functions/reset-user-password/index.ts` | Permitir rol_id 2 resetear usuarios con rol_id 3 o 4 |

