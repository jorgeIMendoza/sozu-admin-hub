import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMP_PASSWORD = 'Temporal123!';
const CLIENTE_ROLE_ID = 23;

function safeDecode(value: string | null | undefined, fallback = 'Agente') {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getPortalConfig(rolId: number | null | undefined) {
  const host = rolId === CLIENTE_ROLE_ID ? 'https://clientes.sozu.com' : 'https://inmobiliarias.sozu.com';
  return {
    portalHost: host,
    ctaUrl: `${host}/auth/change-password`,
    ctaLabel: 'Ir a Cambiar Contraseña',
  };
}

// This edge function is called from the ConfirmacionEmail page after the user confirms their email.
// It sends the welcome/credentials email and performs post-confirmation tasks.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let email: string | null = null;
    let nombre: string | null = 'Agente';

    // Support both GET (legacy redirect) and POST (from frontend)
    if (req.method === 'POST') {
      const body = await req.json();
      email = body.email || null;
      nombre = body.nombre || 'Agente';
    } else {
      const url = new URL(req.url);
      email = url.searchParams.get('email');
      nombre = url.searchParams.get('nombre') || 'Agente';
    }

    const normalizedEmail = email?.toLowerCase().trim() || null;
    const decodedNombre = safeDecode(nombre);

    console.log('Post-confirmacion-registro called for:', normalizedEmail?.substring(0, 5) + '***');

    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: 'Parámetros inválidos' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    const { data: usuarioRecord, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id_persona, nombre, auth_user_id, rol_id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (usuarioError) {
      console.error('Error fetching usuario record:', usuarioError);
    }

    const rolId = usuarioRecord?.rol_id ?? null;
    const portalConfig = getPortalConfig(rolId);
    const nombreUsuario = usuarioRecord?.nombre?.trim() || decodedNombre;

    let authUser = null;

    if (usuarioRecord?.auth_user_id) {
      const { data: authUserById, error: authUserByIdError } = await supabase.auth.admin.getUserById(usuarioRecord.auth_user_id);
      if (authUserByIdError) {
        console.error('Error fetching auth user by id:', authUserByIdError);
      } else {
        authUser = authUserById.user;
      }
    }

    if (!authUser) {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      authUser = authUsers?.users?.find(
        u => u.email?.toLowerCase() === normalizedEmail
      ) ?? null;
    }

    // If no auth user exists (e.g. client flow), create one with temporary password
    if (!authUser) {
      console.log('Auth user not found, checking usuarios table:', normalizedEmail);

      if (!usuarioRecord) {
        console.log('No usuario record found either:', normalizedEmail);
        return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // Create auth user with temporary password
      const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: TEMP_PASSWORD,
        email_confirm: true,
        user_metadata: { name: nombreUsuario },
      });

      if (createAuthError) {
        console.error('Error creating auth user:', createAuthError);
        return new Response(JSON.stringify({ error: 'Error al crear usuario' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      authUser = newAuthUser.user;
      console.log('Auth user created:', authUser.id);

      // Link auth_user_id to usuarios record
      const { error: linkError } = await supabase
        .from('usuarios')
        .update({ 
          auth_user_id: authUser.id, 
          debe_cambiar_password: true,
          fecha_actualizacion: new Date().toISOString() 
        })
        .ilike('email', normalizedEmail);

      if (linkError) {
        console.error('Error linking auth_user_id:', linkError);
      }
    } else {
      // Confirm the email in Auth if not already confirmed
      if (!authUser.email_confirmed_at) {
        const { error: confirmError } = await supabase.auth.admin.updateUserById(
          authUser.id,
          { email_confirm: true }
        );
        if (confirmError) {
          console.error('Error confirming email in Auth:', confirmError);
        } else {
          console.log('Email confirmed in Auth for user:', authUser.id);
        }
      }
    }

    console.log('User confirmed, sending credentials email');

    // Send welcome/credentials email via Postmark
    if (POSTMARK_TOKEN) {
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
            To: normalizedEmail,
            TemplateId: 41353048,
            TemplateModel: {
              mensaje: {
                nombre: nombreUsuario,
                actividad: 'Registro exitoso como Agente Inmobiliario',
                asunto: 'Bienvenido a Sozu - Tu cuenta ha sido activada',
                detalles: `
                  <tr><td class='label'>Email de acceso:</td><td class='value'>${normalizedEmail}</td></tr>
                  <tr><td class='label'>Contraseña temporal:</td><td class='value'>Temporal123!</td></tr>
                  <tr><td class='label'>Portal de acceso:</td><td class='value'><a href="${portalConfig.ctaUrl}">${portalConfig.portalHost.replace('https://', '')}</a></td></tr>
                  <tr><td class='label'>Importante:</td><td class='value'>Deberás cambiar tu contraseña en tu primer inicio de sesión.</td></tr>
                `,
              },
            },
            MessageStream: 'outbound',
          }),
        });
        const welcomeResult = await welcomeRes.json();
        console.log('Welcome email sent:', welcomeRes.status, JSON.stringify(welcomeResult).substring(0, 200));
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
      }

      // Notify admins that the agent confirmed their email
      try {
        // Get the usuario record for additional details
        const { data: usuarioData } = await supabase
          .from('usuarios')
          .select('nombre, telefono')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        // Fallback: get phone from personas table if not in usuarios
        let telefonoAdmin = usuarioData?.telefono;
        if (!telefonoAdmin) {
          const { data: personaData } = await supabase.from('personas').select('telefono').ilike('email', normalizedEmail).maybeSingle();
          telefonoAdmin = personaData?.telefono;
        }

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
          const adminMessages = adminEmails.map(adminEmail => ({
            From: 'Notificaciones Sozu <notificaciones@sozu.com>',
            To: adminEmail,
            TemplateId: 41353048,
            TemplateModel: {
              mensaje: {
                nombre: 'Administrador',
                actividad: 'Agente confirmó su correo electrónico',
                asunto: 'Agente confirmado - ' + nombreUsuario,
                detalles: `<tr><td class='label'>Nombre:</td><td class='value'>${nombreUsuario}</td></tr><tr><td class='label'>Email:</td><td class='value'>${normalizedEmail}</td></tr><tr><td class='label'>Teléfono:</td><td class='value'>${telefonoAdmin || 'N/A'}</td></tr><tr><td class='label'>Estado:</td><td class='value'>✅ Email confirmado - Credenciales enviadas</td></tr>`,
              },
            },
            MessageStream: 'outbound',
          }));

          await fetch('https://api.postmarkapp.com/email/batchWithTemplates', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': POSTMARK_TOKEN,
            },
            body: JSON.stringify({ Messages: adminMessages }),
          });
          console.log('Admin confirmation notification sent');
        }
      } catch (notifError) {
        console.error('Error sending admin notification:', notifError);
      }
    }

    // Update email_confirmado flag
    try {
      await supabase
        .from('usuarios')
        .update({ email_confirmado: true })
        .ilike('email', normalizedEmail);
      console.log('Updated email_confirmado to true');
    } catch (updateErr) {
      console.error('Error updating email_confirmado:', updateErr);
    }

    // Log the confirmation activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'confirmacion_email',
        tipo_entidad: 'agente',
        descripcion: `Agente confirmó su correo: ${normalizedEmail}`,
      });
    } catch (logErr) {
      console.error('Error logging:', logErr);
    }

    // Return success
    return new Response(JSON.stringify({ success: true, rolId, ...portalConfig }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in post-confirmacion-registro:', error);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
