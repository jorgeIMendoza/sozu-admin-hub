

# Plan: Eliminar 11 Usuarios de Prueba

## Usuarios a eliminar

### 6 Agentes Inmobiliarios (Rol 3) - correo @yopmail.com

| Nombre | Email | auth_user_id |
|--------|-------|-------------|
| Jorge Mendoza C | jorge.externo@yopmail.com | 7593b2c4-... |
| Juanito Lechuga | juanito.lechuga@yopmail.com | 358a79a1-... |
| Otro Agente | otro.agente@yopmail.com | 28195a55-... |
| Paco Zanahorias | paco.zanahorias@yopmail.com | 8f8010e0-... |
| Pakita Jitomates | pakita@yopmail.com | 02e77408-... |
| Ricardo Manzanas | richi.manzanas@yopmail.com | e7bcd509-... |

### 5 Inmobiliarias (Rol 4) - nombre con Test/Prueba Y correo @yopmail.com

| Nombre | Email | auth_user_id |
|--------|-------|-------------|
| Inmobiliaria Prueba | inmo.prueba@yopmail.com | 41fa5b38-... |
| Prueba Inmo Publik | publik@yopmail.com | 411f62f9-... |
| Segunda inmo Test | segunda.test@yopmail.com | d0e922f7-... |
| tercera inmo Prueba | tercera@yopmail.com | bedfe0fd-... |
| Test Abel Ramon | abel.ramon@yopmail.com | e9b4409e-... |

**EXCLUIDO**: Jorge Isaac Test (jorge.test.inmo@yopmail.com) - no se toca.

## Registros relacionados a limpiar

- **6 registros** en `proyectos_acceso` (inmo.prueba, otro.agente, abel.ramon, richi.manzanas)
- **13 registros** en `entidades_relacionadas` (de las personas asociadas)
- **11 registros** en `usuarios`
- **11 registros** en `auth.users`

## Orden de eliminacion

1. `proyectos_acceso` (6 registros) - evitar FK violations
2. `entidades_relacionadas` (13 registros) - limpiar relaciones de persona
3. `usuarios` (11 registros) - eliminar registros de usuario
4. `auth.users` (11 registros) - eliminar cuentas de autenticacion via Admin API

## Implementacion

Se creara una Edge Function temporal `cleanup-test-users` que:

1. Usa `SUPABASE_SERVICE_ROLE_KEY` para operaciones admin
2. Tiene los 11 auth_user_id hardcodeados para evitar eliminaciones accidentales
3. Ejecuta las eliminaciones en el orden correcto
4. Retorna un resumen detallado de lo eliminado
5. Se elimina la funcion despues de ejecutarla

### Detalles tecnicos

```text
cleanup-test-users/index.ts
  |
  |-- Validar que quien ejecuta es Super Admin
  |-- DELETE FROM proyectos_acceso WHERE usuario_id IN (los 11 emails)
  |-- DELETE FROM entidades_relacionadas WHERE id IN (los 13 IDs especificos)
  |-- DELETE FROM usuarios WHERE email IN (los 11 emails)
  |-- Para cada auth_user_id: supabaseAdmin.auth.admin.deleteUser(id)
  |-- Retornar resumen
```

Despues de ejecutar exitosamente, se eliminara la Edge Function del proyecto.

