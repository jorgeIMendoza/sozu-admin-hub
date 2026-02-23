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
  proyecto_ids?: number[];
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
    const { nombre, email, telefono, clave_pais_telefono, proyecto_ids } = body;

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

    // 3. Create auth user with email_confirm = FALSE (requires email confirmation)
    const defaultPassword = 'Temporal123!';
    let authUserId: string;

    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: defaultPassword,
      email_confirm: false, // User must confirm email first
      user_metadata: { nombre, rol_id: 3 },
    });

    if (createAuthError) {
      console.error('Error creating auth user:', createAuthError);
      await supabase.from('entidades_relacionadas').delete().eq('id', entidad.id);
      await supabase.from('personas').delete().eq('id', persona.id);
      throw new Error(`Error al crear usuario de autenticación: ${createAuthError.message}`);
    }

    authUserId = authData.user!.id;
    console.log('Auth user created (unconfirmed):', authUserId);

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
        email_confirmado: false,
      })
      .select()
      .single();

    if (usuarioError) {
      console.error('Error creating usuario:', usuarioError);
      await supabase.auth.admin.deleteUser(authUserId);
      await supabase.from('entidades_relacionadas').delete().eq('id', entidad.id);
      await supabase.from('personas').delete().eq('id', persona.id);
      throw new Error(`Error al crear usuario: ${usuarioError.message}`);
    }

    console.log('Usuario created:', usuario.id);

    // Assign access only to selected projects
    try {
      if (proyecto_ids && proyecto_ids.length > 0) {
        // Validate that all selected projects are actually published
        const { data: validProjects } = await supabase
          .from('proyectos')
          .select('id')
          .in('id', proyecto_ids)
          .eq('publicar', true)
          .eq('activo', true);

        const validIds = validProjects?.map(p => p.id) || [];

        if (validIds.length > 0) {
          const accessRecords = validIds.map(pid => ({
            usuario_id: emailLower,
            proyecto_id: pid,
            activo: true,
            id_entidad_relacionada_dueno: null,
          }));

          const { error: accessError } = await supabase
            .from('proyectos_acceso')
            .insert(accessRecords);

          if (accessError) {
            console.error('Error assigning project access:', accessError);
          } else {
            console.log(`Assigned access to ${validIds.length} selected projects`);
          }
        }
      }
    } catch (accessErr) {
      console.error('Error in project access assignment:', accessErr);
    }

    // 5. Generate email confirmation link using Supabase Auth
    const postConfirmUrl = `${supabaseUrl}/functions/v1/post-confirmacion-registro?email=${encodeURIComponent(emailLower)}&nombre=${encodeURIComponent(nombre.trim())}`;
    
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: emailLower,
      password: defaultPassword,
      options: {
        redirectTo: postConfirmUrl,
      },
    });

    if (linkError) {
      console.error('Error generating confirmation link:', linkError);
      // User is created but unconfirmed - admin can resend
    }

    // Extract token from action_link and rebuild URL to ensure redirect goes to our edge function
    let confirmationUrl = linkData?.properties?.action_link;
    if (confirmationUrl) {
      try {
        const actionUrl = new URL(confirmationUrl);
        const token = actionUrl.searchParams.get('token');
        const type = actionUrl.searchParams.get('type');
        if (token) {
          // Rebuild the verification URL with our edge function as redirect
          confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type || 'signup'}&redirect_to=${encodeURIComponent(postConfirmUrl)}`;
        }
      } catch (e) {
        console.error('Error rebuilding confirmation URL:', e);
      }
    }
    console.log('Confirmation link generated:', confirmationUrl ? 'yes' : 'no');

    // 6. Send standalone confirmation email via Postmark (NOT using template to avoid "Notificación" wrapper)
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    if (POSTMARK_TOKEN && confirmationUrl) {
      try {
        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#2a9d8f,#264653);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:24px;">Confirma tu correo electrónico</h1>
        </td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="font-size:16px;color:#333;">Hola <strong>${nombre.trim()}</strong>,</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Gracias por registrarte. Para activar tu cuenta y recibir tus credenciales de acceso, confirma tu dirección de email haciendo clic en el siguiente botón:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${confirmationUrl}" style="display:inline-block;background:linear-gradient(135deg,#2a9d8f,#264653);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Confirmar mi Email</a>
          </div>
          <p style="font-size:12px;color:#999;text-align:center;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${confirmationUrl}" style="color:#2a9d8f;word-break:break-all;">${confirmationUrl}</a></p>
        </td></tr>
        <tr><td style="background:#f9f9f9;padding:20px;text-align:center;">
          <p style="font-size:12px;color:#aaa;margin:0;">© Sozu — Este correo fue enviado automáticamente.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        const confirmRes = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: 'Notificaciones Sozu <notificaciones@sozu.com>',
            To: emailLower,
            Subject: 'Confirma tu correo electrónico - Sozu',
            HtmlBody: htmlBody,
            MessageStream: 'outbound',
          }),
        });
        const confirmResult = await confirmRes.json();
        console.log('Confirmation email Postmark response:', confirmRes.status, JSON.stringify(confirmResult).substring(0, 300));
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
      }

      // Admin notification is now sent AFTER user confirms email (in post-confirmacion-registro)
      console.log('Admin notification will be sent after email confirmation');
    } else {
      console.error('POSTMARK_SERVER_TOKEN not configured or confirmation link not generated');
    }

    // Log the activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'registro_publico',
        tipo_entidad: 'agente',
        id_entidad: persona.id,
        valor_nuevo: JSON.stringify({ nombre: nombre.trim(), email: emailLower }),
        descripcion: `Registro público de agente: ${nombre.trim()} (pendiente confirmación)`,
      });
    } catch (logError) {
      console.error('Error logging activity:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Se ha enviado un correo de confirmación. Revisa tu bandeja de entrada.',
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
