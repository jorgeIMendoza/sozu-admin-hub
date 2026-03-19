import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Called by the DB trigger (via pg_net) when a user confirms their email.
// Sends credentials email to user + notification copy to super admins.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, nombre } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('notificar-confirmacion-email called for:', email.substring(0, 5) + '***');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    if (!POSTMARK_TOKEN) {
      console.error('POSTMARK_SERVER_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get usuario data
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('nombre, telefono, rol_id, email')
      .ilike('email', email.toLowerCase())
      .maybeSingle();

    // Fallback: get phone from personas table if not in usuarios
    let telefono = usuarioData?.telefono;
    if (!telefono) {
      const { data: personaData } = await supabase.from('personas').select('telefono').ilike('email', email.toLowerCase()).maybeSingle();
      telefono = personaData?.telefono;
    }

    const displayName = nombre || usuarioData?.nombre || 'Usuario';
    const rolId = usuarioData?.rol_id;

    // Determine portal URL based on role
    let portalUrl = 'https://app.sozu.com/auth/login';
    let rolLabel = 'Usuario';
    if (rolId === 3) {
      portalUrl = 'https://inmobiliarias.sozu.com/auth/login';
      rolLabel = 'Agente Inmobiliario';
    } else if (rolId === 4) {
      portalUrl = 'https://inmobiliarias.sozu.com/auth/login';
      rolLabel = 'Inmobiliaria';
    }

    // 1. Send credentials email to the user
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
          To: email.toLowerCase(),
          TemplateId: 41353048,
          TemplateModel: {
            mensaje: {
              nombre: displayName,
              actividad: `Registro exitoso como ${rolLabel}`,
              asunto: 'Bienvenido a Sozu - Tu cuenta ha sido activada',
              detalles: `
                <tr><td class='label'>Email de acceso:</td><td class='value'>${email.toLowerCase()}</td></tr>
                <tr><td class='label'>Contraseña temporal:</td><td class='value'>Temporal123!</td></tr>
                <tr><td class='label'>Portal de acceso:</td><td class='value'><a href="${portalUrl}">${portalUrl.replace('https://', '')}</a></td></tr>
                <tr><td class='label'>Importante:</td><td class='value'>Deberás cambiar tu contraseña en tu primer inicio de sesión.</td></tr>
              `,
            },
          },
          MessageStream: 'outbound',
        }),
      });
      const welcomeResult = await welcomeRes.json();
      console.log('Credentials email sent:', welcomeRes.status, JSON.stringify(welcomeResult).substring(0, 200));
    } catch (emailError) {
      console.error('Error sending credentials email:', emailError);
    }

    // 2. Send notification to super admins (rol_id = 1)
    try {
      const { data: superAdmins } = await supabase
        .from('usuarios')
        .select('email')
        .eq('rol_id', 1)
        .eq('activo', true);

      const adminEmails = (superAdmins || []).map(u => u.email).filter(Boolean);

      if (adminEmails.length > 0) {
        const adminMessages = adminEmails.map(adminEmail => ({
          From: 'Notificaciones Sozu <notificaciones@sozu.com>',
          To: adminEmail,
          TemplateId: 41353048,
          TemplateModel: {
            mensaje: {
              nombre: 'Administrador',
              actividad: `${rolLabel} confirmó su correo electrónico`,
              asunto: `${rolLabel} confirmado - ${displayName}`,
              detalles: `
                <tr><td class='label'>Nombre:</td><td class='value'>${displayName}</td></tr>
                <tr><td class='label'>Email:</td><td class='value'>${email.toLowerCase()}</td></tr>
                <tr><td class='label'>Teléfono:</td><td class='value'>${telefono || 'N/A'}</td></tr>
                <tr><td class='label'>Rol:</td><td class='value'>${rolLabel}</td></tr>
                <tr><td class='label'>Estado:</td><td class='value'>✅ Email confirmado - Credenciales enviadas</td></tr>
              `,
            },
          },
          MessageStream: 'outbound',
        }));

        const batchRes = await fetch('https://api.postmarkapp.com/email/batchWithTemplates', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({ Messages: adminMessages }),
        });
        console.log('Admin notifications sent:', batchRes.status);
      }
    } catch (notifError) {
      console.error('Error sending admin notifications:', notifError);
    }

    // 3. Log the confirmation activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'confirmacion_email',
        tipo_entidad: rolLabel.toLowerCase(),
        descripcion: `${rolLabel} confirmó su correo: ${email.toLowerCase()}`,
      });
    } catch (logErr) {
      console.error('Error logging:', logErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in notificar-confirmacion-email:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
