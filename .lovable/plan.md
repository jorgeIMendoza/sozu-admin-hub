
## Diagnóstico

El usuario `contacto@vivaltainmobiliaria.com` sí existe correctamente en la base de datos como:

- `usuarios.email = contacto@vivaltainmobiliaria.com`
- `usuarios.rol_id = 4`
- rol `Inmobiliaria`
- `roles.es_rol_interno = true`
- `usuarios.activo = true`
- `usuarios.id_persona = 1876`

Y además su persona sí está ligada como inmobiliaria real:

- `personas.id = 1876`
- `entidades_relacionadas.id_tipo_entidad = 5` (`Inmobiliaria`)
- nombre comercial: `VIVALTA`

## Qué está pasando

La inconsistencia no viene de los datos; viene de que ambas pantallas leen fuentes distintas y con reglas distintas:

### 1) Pantalla Inmobiliarias
`src/pages/admin/Inmobiliarias.tsx`

Esta pantalla arma la lista desde:

- `personas`
- `entidades_relacionadas` con `id_tipo_entidad = 5`

Por eso ahí sí aparece `VIVALTA` y se muestra el email `contacto@vivaltainmobiliaria.com`.

### 2) Pantalla Usuarios del Sistema
`src/pages/admin/Usuarios.tsx`

Esta pantalla consulta directamente `usuarios` con join a `roles`:

```ts
.from('usuarios')
.select(`
  email,
  nombre,
  rol_id,
  activo,
  auth_user_id,
  id_persona,
  debe_cambiar_password,
  email_confirmado,
  roles!inner (nombre, es_rol_interno),
  personas (nombre_legal, email)
`)
.eq('roles.es_rol_interno', true)
```

Con ese query, el usuario sí debería salir.

## La causa real de la inconsistencia

El problema muy probablemente es **RLS / visibilidad del `SELECT` sobre `usuarios`**.

La política actual encontrada para `usuarios` permite:

- cada usuario ver solo su propio registro
- solo el `Super Administrador` ver todos los usuarios

No existe una política equivalente para que otros perfiles administrativos vean el universo necesario en “Usuarios del Sistema”.

La migración actual define esto:

```sql
CREATE POLICY "Users can view own record" ON usuarios FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Admins can view all users" ON usuarios FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN roles r ON u.rol_id = r.id
    WHERE u.auth_user_id = auth.uid()
      AND r.nombre = 'Super Administrador'
  ));
```

## Por qué eso coincide con tu síntoma

Si quien está viendo la pantalla **no es Super Administrador**, el query de `Usuarios del Sistema` no recibe todos los registros, aunque la UI sí exista y aunque en `Inmobiliarias` sí se vea la agencia.

Entonces ocurre esto:

- En `Inmobiliarias`: sí aparece porque se lee desde `personas`/`entidades_relacionadas`
- En `Usuarios del Sistema`: no aparece porque esa lista depende de `usuarios` y RLS la está recortando

Eso explica perfectamente que al buscar `contacto@vivaltainmobiliaria.com` te muestre `0` resultados aunque el usuario sí exista.

## Qué corregir

### Opción recomendada
No abrir más el `SELECT` directo sobre `usuarios` para todos. En su lugar:

1. Crear una función SQL o Edge Function de lectura controlada para “Usuarios del Sistema”.
2. Hacer que esa función aplique la misma lógica de negocio de la UI:
   - `Super Administrador`: puede ver todos
   - `Administrador de Proyecto`: solo roles permitidos (`Agente Inmobiliario` e `Inmobiliaria`)
   - otros roles: sin acceso
3. Cambiar `src/pages/admin/Usuarios.tsx` para consumir esa fuente segura en vez de leer la tabla `usuarios` directamente.

### Opción mínima
Ajustar RLS de `usuarios` para permitir lectura adicional a `Administrador de Proyecto`, pero solo para roles administrables. Esto es más delicado porque la tabla contiene información sensible y puede terminar sobreexponiendo datos.

## Implementación propuesta

1. Revisar los permisos reales esperados para `/admin/usuarios`.
2. Crear una rutina segura de lectura:
   - idealmente `SECURITY DEFINER`
   - usando `is_super_admin()` para validación global
   - respetando que rol 2 solo vea roles 3 y 4
3. Sustituir en `src/pages/admin/Usuarios.tsx` el query directo a `usuarios` por esa rutina.
4. Mantener la lógica actual de enriquecimiento de inmobiliaria (`proyectos_acceso`, `entidades_relacionadas`) encima del resultado.
5. Verificar que la búsqueda por email `contacto@vivaltainmobiliaria.com` ya lo devuelva.
6. Probar ambos escenarios:
   - Super Admin
   - Administrador de Proyecto

## Resultado esperado

Después del ajuste:

- el usuario `contacto@vivaltainmobiliaria.com` seguirá apareciendo en `Inmobiliarias`
- también aparecerá en `Sistema → Usuarios del Sistema`
- la visibilidad quedará consistente con el rol del usuario que consulta
- se evitará romper seguridad abriendo de más la tabla `usuarios`

## Detalles técnicos

- Evidencia en código:
  - `src/pages/admin/Usuarios.tsx` filtra por `roles.es_rol_interno = true`
  - el rol `Inmobiliaria` (`id = 4`) sí tiene `es_rol_interno = true`
- Evidencia en datos:
  - el registro existe y está activo
  - la persona está ligada a entidad tipo `Inmobiliaria`
- Causa más probable:
  - recorte por RLS en `usuarios`, no problema de alta ni de sincronización

## Nota importante

No parece ser un problema de:
- email mal guardado
- rol incorrecto
- usuario inactivo
- falta de relación con inmobiliaria

Los datos están bien; la inconsistencia está en la capa de lectura/autorización entre ambas vistas.
