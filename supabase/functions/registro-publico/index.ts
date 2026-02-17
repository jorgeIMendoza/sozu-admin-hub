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

    // Send emails directly via Postmark
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
    
    if (POSTMARK_TOKEN) {
      // Send admin notification email
      try {
        const { data: superAdmins } = await supabase
          .from('usuarios')
          .select('email')
          .eq('rol_id', 1)
          .eq('activo', true);

        const { data: adminProyecto } = await supabase
          .from('usuarios')
          .select('email')
          .eq('rol_id', 2)
          .eq('activo', true);

        const adminEmails = [
          ...(adminProyecto || []).map(u => u.email),
          ...(superAdmins || []).map(u => u.email),
        ].filter(Boolean);

        if (adminEmails.length > 0) {
          const adminMessages = adminEmails.map(email => ({
            From: 'Notificaciones Sozu <notificaciones@sozu.com>',
            To: email,
            TemplateId: 41353048,
            TemplateModel: {
              mensaje: {
                nombre: 'Administrador',
                actividad: 'Registro de agente desde formulario público',
                asunto: 'Nuevo Registro de Agente',
                detalles: `<tr><td class='label'>Nombre:</td><td class='value'>${nombre.trim()}</td></tr><tr><td class='label'>Email:</td><td class='value'>${emailLower}</td></tr><tr><td class='label'>Teléfono:</td><td class='value'>${telefono}</td></tr>`,
              },
            },
            MessageStream: 'outbound',
          }));

          const adminRes = await fetch('https://api.postmarkapp.com/email/batchWithTemplates', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': POSTMARK_TOKEN,
            },
            body: JSON.stringify({ Messages: adminMessages }),
          });
          const adminResult = await adminRes.json();
          console.log('Admin Postmark response:', adminRes.status, JSON.stringify(adminResult).substring(0, 300));
        }
      } catch (notificationError) {
        console.error('Error sending admin notification:', notificationError);
      }

      // Send welcome email to the new agent
      try {
        const welcomeRes = await fetch('https://api.postmarkapp.com/email/withTemplate', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: 'Notificaciones Sozu <notificaciones@sozu.com>',
            To: emailLower,
            TemplateId: 41353048,
            TemplateModel: {
              mensaje: {
                nombre: nombre.trim(),
                actividad: 'Registro exitoso como Agente Inmobiliario',
                asunto: 'Bienvenido a Sozu - Tu cuenta ha sido creada',
                detalles: `
                  <tr><td class='label'>Email de acceso:</td><td class='value'>${emailLower}</td></tr>
                  <tr><td class='label'>Contraseña temporal:</td><td class='value'>Temporal123!</td></tr>
                  <tr><td class='label'>Portal de acceso:</td><td class='value'><a href="https://inmobiliarias.sozu.com/auth/login">inmobiliarias.sozu.com</a></td></tr>
                  <tr><td class='label'>Importante:</td><td class='value'>Deberás cambiar tu contraseña en tu primer inicio de sesión.</td></tr>
                `,
              },
            },
            MessageStream: 'outbound',
          }),
        });
        const welcomeResult = await welcomeRes.json();
        console.log('Welcome Postmark response:', welcomeRes.status, JSON.stringify(welcomeResult).substring(0, 300));
      } catch (welcomeError) {
        console.error('Error sending welcome email:', welcomeError);
      }
    } else {
      console.error('POSTMARK_SERVER_TOKEN not configured, skipping email notifications');
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
