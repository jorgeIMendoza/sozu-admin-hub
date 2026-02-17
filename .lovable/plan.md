
# Fix: Correo de bienvenida + Acceso a proyectos publicados para agentes sin inmobiliaria

## Problema 1: No llega correo tras registro
La Edge Function `registro-publico` crea el usuario con `email_confirm: true` y solo notifica a los administradores. El agente registrado nunca recibe un correo con sus credenciales de acceso.

## Problema 2: Agentes sin inmobiliaria no ven proyectos
Usuarios como `jorge.fresa@yopmail.com` (Agente Inmobiliario, rol 3) no tienen registros en `proyectos_acceso`, por lo que no pueden ver ningun proyecto. Los agentes sin inmobiliaria deberian tener acceso automatico a todos los proyectos publicados (`publicar = true`).

---

## Solucion

### Cambio 1: Enviar correo de bienvenida al agente (`registro-publico/index.ts`)

Despues del bloque que envia notificacion a admins (linea ~256), agregar un segundo llamado a `enviar-notificacion` dirigido al usuario recien registrado con:
- Email del agente
- Asunto: "Bienvenido a Sozu - Tu cuenta ha sido creada"
- Contenido: nombre, email, password temporal (`Temporal123!`), link a `https://inmobiliarias.sozu.com/auth/login`, indicacion de cambiar password

### Cambio 2: Asignar acceso a proyectos publicados (`registro-publico/index.ts`)

Despues de crear el registro en `usuarios`, agregar un bloque que:
1. Consulte todos los proyectos con `publicar = true` y `activo = true`
2. Inserte un registro en `proyectos_acceso` por cada proyecto publicado, con `usuario_id = emailLower` y `id_entidad_relacionada_dueno = null`

Esto le da al agente visibilidad inmediata de los proyectos publicados desde su primer login.

### Cambio 3: Pagina `MisProyectos.tsx` (sin cambios necesarios)

La pagina ya filtra por `accessibleProjectIds` y `publicar = true`, asi que una vez que existan los registros en `proyectos_acceso`, los proyectos se mostraran automaticamente.

---

## Detalle tecnico

### En `supabase/functions/registro-publico/index.ts`:

Despues de la linea 174 (log de usuario creado), agregar:

```typescript
// Assign access to all published projects
try {
  const { data: publishedProjects } = await supabase
    .from('proyectos')
    .select('id')
    .eq('publicar', true)
    .eq('activo', true);

  if (publishedProjects && publishedProjects.length > 0) {
    const accessRecords = publishedProjects.map(p => ({
      usuario_id: emailLower,
      proyecto_id: p.id,
      activo: true,
      id_entidad_relacionada_dueno: null,
    }));

    const { error: accessError } = await supabase
      .from('proyectos_acceso')
      .insert(accessRecords);

    if (accessError) {
      console.error('Error assigning project access:', accessError);
    } else {
      console.log(`Assigned access to ${publishedProjects.length} published projects`);
    }
  }
} catch (accessErr) {
  console.error('Error in project access assignment:', accessErr);
}
```

Despues del bloque de notificacion a admins (~linea 256), agregar:

```typescript
// Send welcome email to the new agent
try {
  const welcomePayload = {
    tipo: 'email',
    from: 'Notificaciones Sozu <notificaciones@sozu.com>',
    email: emailLower,
    asunto: 'Bienvenido a Sozu - Tu cuenta ha sido creada',
    mensaje: {
      nombre: nombre.trim(),
      actividad: 'Registro exitoso como Agente Inmobiliario',
      detalles: `
        <tr><td class='label'>Email de acceso:</td><td class='value'>${emailLower}</td></tr>
        <tr><td class='label'>Contraseña temporal:</td><td class='value'>Temporal123!</td></tr>
        <tr><td class='label'>Portal de acceso:</td><td class='value'><a href="https://inmobiliarias.sozu.com/auth/login">inmobiliarias.sozu.com</a></td></tr>
        <tr><td class='label'>Importante:</td><td class='value'>Deberás cambiar tu contraseña en tu primer inicio de sesión.</td></tr>
      `
    },
    templateId: 41353048
  };

  await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify(welcomePayload)
  });

  console.log('Welcome email sent to agent');
} catch (welcomeError) {
  console.error('Error sending welcome email:', welcomeError);
}
```

## Archivos a modificar
- `supabase/functions/registro-publico/index.ts` - Agregar asignacion de proyectos publicados y envio de correo de bienvenida

## Datos de referencia
- Proyectos publicados actuales: Bottura (2), Daiku (1453), Margot (1743)
- Usuario de ejemplo sin acceso: `jorge.fresa@yopmail.com` (rol 3, persona 2423, 0 registros en proyectos_acceso)
