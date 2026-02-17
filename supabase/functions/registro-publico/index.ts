import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  nombre: string;
  email: string;
  telefono: string;
  clave_pais_telefono: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    const { nombre, email, telefono, clave_pais_telefono } = body;

    console.log('Registro público de agente:', { nombre, email: email.substring(0, 5) + '***' });

    // Validate required fields
    if (!nombre || !email || !telefono) {
      return new Response(
        JSON.stringify({ success: false, message: 'Faltan campos requeridos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailLower = email.toLowerCase().trim();
    if (!emailRegex.test(emailLower)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Formato de email inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate phone (10 digits)
    if (telefono.length !== 10) {
      return new Response(
        JSON.stringify({ success: false, message: 'El teléfono debe tener 10 dígitos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if email already exists in personas
    const { data: existingPersona } = await supabase
      .from('personas')
      .select('id')
      .ilike('email', emailLower)
      .eq('activo', true)
      .maybeSingle();

    if (existingPersona) {
      return new Response(
        JSON.stringify({ success: false, message: `El email ${email} ya está registrado` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if email exists in usuarios
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('email')
      .ilike('email', emailLower)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, message: `El email ${email} ya está registrado como usuario` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1. Create persona (tipo_persona = 'pf', es_draft = true)
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .insert({
        nombre_legal: nombre.trim(),
        email: emailLower,
        telefono: telefono.trim(),
        clave_pais_telefono: clave_pais_telefono || 'MX',
        tipo_persona: 'pf',
        activo: true,
        es_draft: true,
      })
      .select()
      .single();

    if (personaError) {
      console.error('Error creating persona:', personaError);
      throw new Error(`Error al crear persona: ${personaError.message}`);
    }

    console.log('Persona created:', persona.id);

    // 2. Create entidad_relacionada (id_tipo_entidad = 19 for Agente Inmobiliario)
    const { data: entidad, error: entidadError } = await supabase
      .from('entidades_relacionadas')
      .insert({
        id_persona: persona.id,
        id_tipo_entidad: 19,
        activo: true,
      })
      .select()
      .single();

    if (entidadError) {
      console.error('Error creating entidad:', entidadError);
      await supabase.from('personas').delete().eq('id', persona.id);
      throw new Error(`Error al crear entidad: ${entidadError.message}`);
    }

    console.log('Entidad created:', entidad.id);

    // 3. Create auth user
    const defaultPassword = 'Temporal123!';
    let authUserId: string;

    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { nombre, rol_id: 3 },
    });

    if (createAuthError) {
      console.error('Error creating auth user:', createAuthError);
      // Rollback
      await supabase.from('entidades_relacionadas').delete().eq('id', entidad.id);
      await supabase.from('personas').delete().eq('id', persona.id);
      throw new Error(`Error al crear usuario de autenticación: ${createAuthError.message}`);
    }

    authUserId = authData.user!.id;
    console.log('Auth user created:', authUserId);

    // 4. Create usuario record (rol_id = 3 = Agente Inmobiliario)
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        email: emailLower,
        nombre: nombre.trim(),
        rol_id: 3,
        id_persona: persona.id,
        auth_user_id: authUserId,
        debe_cambiar_password: true,
        activo: true,
        telefono: telefono.trim(),
        clave_pais_telefono: clave_pais_telefono || 'MX',
      })
      .select()
      .single();

    if (usuarioError) {
      console.error('Error creating usuario:', usuarioError);
      // Rollback
      await supabase.auth.admin.deleteUser(authUserId);
      await supabase.from('entidades_relacionadas').delete().eq('id', entidad.id);
      await supabase.from('personas').delete().eq('id', persona.id);
      throw new Error(`Error al crear usuario: ${usuarioError.message}`);
    }

    console.log('Usuario created:', usuario.id);

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

    // Log the activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'registro_publico',
        tipo_entidad: 'agente',
        id_entidad: persona.id,
        valor_nuevo: JSON.stringify({ nombre: nombre.trim(), email: emailLower }),
        descripcion: `Registro público de agente: ${nombre.trim()}`,
      });
    } catch (logError) {
      console.error('Error logging activity:', logError);
    }

    // Send notification to admins
    try {
      const { data: superAdmins } = await supabase
        .from('usuarios')
        .select('email, telefono, clave_pais_telefono')
        .eq('rol_id', 1)
        .eq('activo', true);

      const { data: adminProyecto } = await supabase
        .from('usuarios')
        .select('email, telefono, clave_pais_telefono')
        .eq('rol_id', 2)
        .eq('activo', true);

      const correosSuperAdmin = (superAdmins || []).map(u => u.email).filter(Boolean).join(',');
      const correosAdminProy = (adminProyecto || []).map(u => u.email).filter(Boolean).join(',');

      const { data: paises } = await supabase
        .from('paises')
        .select('id, clave_pais_telefono')
        .eq('activo', true);

      const codigosPorPais = new Map(
        (paises || []).map((p: any) => [p.id.trim(), p.clave_pais_telefono?.trim()])
      );

      const formatearTelefonos = (usuarios: any[]) => {
        return (usuarios || [])
          .filter(u => u.telefono)
          .map(u => {
            const clavePais = (u.clave_pais_telefono || 'MX').trim();
            const codigoPais = codigosPorPais.get(clavePais) || '+52';
            return `${codigoPais}${u.telefono}`;
          })
          .join(',');
      };

      const numerosAdminProy = formatearTelefonos(adminProyecto || []) || formatearTelefonos(superAdmins || []);

      const notificationPayload = {
        tipo: 'ambos',
        from: 'Notificaciones Sozu <notificaciones@sozu.com>',
        email: correosAdminProy || correosSuperAdmin,
        cc: correosSuperAdmin,
        telefono: numerosAdminProy,
        mensajeWA: `Se ha registrado un nuevo agente: *${nombre.trim()}*, con el email: *${emailLower}* desde el formulario público.`,
        asunto: 'Nuevo Registro de Agente',
        mensaje: {
          nombre: 'Administrador',
          actividad: 'Registro de agente desde formulario público',
          detalles: `<tr><td class='label'>Nombre:</td><td class='value'>${nombre.trim()}</td></tr><tr><td class='label'>Email:</td><td class='value'>${emailLower}</td></tr><tr><td class='label'>Teléfono:</td><td class='value'>${telefono}</td></tr>`
        },
        templateId: 41353048
      };

      await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify(notificationPayload)
      });

      console.log('Notification sent');
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
    }

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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Registro completado correctamente.',
        data: { persona_id: persona.id, usuario_id: usuario.id }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in registro-publico:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Error interno del servidor'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
