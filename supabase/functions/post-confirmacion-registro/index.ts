import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This edge function is called AFTER the user confirms their email.
// Supabase redirects here after email confirmation.
// It sends the welcome/credentials email and redirects to login.

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const nombre = url.searchParams.get('nombre') || 'Agente';

    console.log('Post-confirmacion-registro called for:', email?.substring(0, 5) + '***');

    if (!email) {
      return new Response('<html><body>Parámetros inválidos. <a href="https://inmobiliarias.sozu.com/auth/login">Ir al login</a></body></html>', {
        headers: { 'Content-Type': 'text/html' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    // Verify user exists and is now confirmed
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const confirmedUser = authUsers?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase() && u.email_confirmed_at
    );

    if (!confirmedUser) {
      console.log('User not confirmed yet or not found:', email);
      return Response.redirect('https://inmobiliarias.sozu.com/auth/login', 302);
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
            To: email.toLowerCase(),
            TemplateId: 41353048,
            TemplateModel: {
              mensaje: {
                nombre: decodeURIComponent(nombre),
                actividad: 'Registro exitoso como Agente Inmobiliario',
                asunto: 'Bienvenido a Sozu - Tu cuenta ha sido activada',
                detalles: `
                  <tr><td class='label'>Email de acceso:</td><td class='value'>${email.toLowerCase()}</td></tr>
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
          .ilike('email', email.toLowerCase())
          .maybeSingle();

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
                asunto: 'Agente confirmado - ' + decodeURIComponent(nombre),
                detalles: `<tr><td class='label'>Nombre:</td><td class='value'>${decodeURIComponent(nombre)}</td></tr><tr><td class='label'>Email:</td><td class='value'>${email.toLowerCase()}</td></tr><tr><td class='label'>Teléfono:</td><td class='value'>${usuarioData?.telefono || 'N/A'}</td></tr><tr><td class='label'>Estado:</td><td class='value'>✅ Email confirmado - Credenciales enviadas</td></tr>`,
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
        .ilike('email', email.toLowerCase());
      console.log('Updated email_confirmado to true');
    } catch (updateErr) {
      console.error('Error updating email_confirmado:', updateErr);
    }

    // Log the confirmation activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'confirmacion_email',
        tipo_entidad: 'agente',
        descripcion: `Agente confirmó su correo: ${email.toLowerCase()}`,
      });
    } catch (logErr) {
      console.error('Error logging:', logErr);
    }

    // Redirect to login page
    return Response.redirect('https://inmobiliarias.sozu.com/auth/login', 302);

  } catch (error) {
    console.error('Error in post-confirmacion-registro:', error);
    return Response.redirect('https://inmobiliarias.sozu.com/auth/login', 302);
  }
});
