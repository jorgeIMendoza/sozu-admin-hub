

## Plan: Modificar Edge Function `reset-user-password` para soportar dos modos

### Problema actual
La funcion solo permite reseteo de contrasena por Super Administradores autenticados con JWT. Sistemas externos como n8n no tienen un JWT de Super Admin disponible.

### Solucion
Modificar la funcion existente para soportar **dos modos de operacion**:

1. **Modo autenticado (JWT)**: Flujo actual sin cambios - Super Admins pueden resetear cualquier usuario
2. **Modo externo (API Key)**: Sistemas como n8n envian un header `x-api-key` con un secreto compartido. Solo permite resetear usuarios con rol **Cliente**

### Seguridad
- Se creara un nuevo secreto `RESET_PASSWORD_API_KEY` en Supabase que se configurara tambien en n8n
- El modo API Key solo funciona para usuarios con rol "Cliente" (rol ID 23) - no puede resetear administradores ni otros roles internos
- Si no se envia ni JWT ni API Key, se rechaza con 401

### Archivo a modificar

**`supabase/functions/reset-user-password/index.ts`**

Logica actualizada:

```text
1. Leer headers: Authorization y x-api-key
2. Si hay x-api-key:
   a. Validar contra secreto RESET_PASSWORD_API_KEY
   b. Parsear body { email }
   c. Buscar usuario en tabla usuarios
   d. Verificar que su rol sea "Cliente" (ID 23) - si no, rechazar con 403
   e. Ejecutar reset (mismo flujo actual: crear auth user si no existe, o updateUserById)
   f. Marcar debe_cambiar_password = true
3. Si hay Authorization (JWT):
   a. Flujo actual sin cambios (solo Super Admin, puede resetear cualquier rol)
4. Si no hay ninguno: 401
```

### Secreto nuevo
- Nombre: `RESET_PASSWORD_API_KEY`
- Valor: lo define el usuario (se usara el mismo valor en n8n como header `x-api-key`)

### Uso desde n8n (sin JWT)

```bash
curl -X POST \
  https://tzmhgfjmddkfyffkkmto.supabase.co/functions/v1/reset-user-password \
  -H "Content-Type: application/json" \
  -H "x-api-key: <TU_API_KEY>" \
  -d '{"email": "cliente@ejemplo.com"}'
```

### Respuesta
Misma estructura actual:
```json
{
  "success": true,
  "message": "Contrasena reseteada exitosamente. Nueva contrasena temporal: Temporal123!"
}
```

O si el usuario no es Cliente:
```json
{
  "error": "Esta API key solo permite resetear usuarios con rol Cliente"
}
```

### Resumen de cambios
| Archivo | Cambio |
|---|---|
| `supabase/functions/reset-user-password/index.ts` | Agregar modo API Key para clientes |
| Secreto `RESET_PASSWORD_API_KEY` | Crear nuevo secreto en Supabase |

