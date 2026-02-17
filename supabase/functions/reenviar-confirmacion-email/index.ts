import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, message: 'Email es requerido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();
    console.log('Resending confirmation for:', emailLower.substring(0, 5) + '***');

    // Get user info
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nombre, email_confirmado')
      .ilike('email', emailLower)
      .maybeSingle();

    if (!usuario) {
      return new Response(
        JSON.stringify({ success: false, message: 'Usuario no encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (usuario.email_confirmado) {
      return new Response(
        JSON.stringify({ success: false, message: 'El email ya está confirmado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate confirmation link
    const postConfirmUrl = `${supabaseUrl}/functions/v1/post-confirmacion-registro?email=${encodeURIComponent(emailLower)}&nombre=${encodeURIComponent(usuario.nombre || '')}`;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: emailLower,
      password: 'Temporal123!',
      options: {
        redirectTo: postConfirmUrl,
      },
    });

    if (linkError) {
      console.error('Error generating link:', linkError);
      throw new Error('Error al generar enlace de confirmación');
    }

    const confirmationUrl = linkData?.properties?.action_link;

    if (!confirmationUrl || !POSTMARK_TOKEN) {
      throw new Error('No se pudo generar el enlace o falta configuración de correo');
    }

    // Send confirmation email via Postmark
    const confirmRes = await fetch('https://api.postmarkapp.com/email/withTemplate', {
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
            nombre: usuario.nombre || 'Usuario',
            actividad: 'Confirmación de correo electrónico',
            asunto: 'Confirma tu correo - Sozu',
            detalles: `
              <tr><td colspan="2" style="padding: 15px 0; text-align: center;">
                <p style="margin-bottom: 20px;">Para activar tu cuenta y recibir tus credenciales de acceso, confirma tu dirección de email haciendo clic en el siguiente botón:</p>
                <a href="${confirmationUrl}" style="display: inline-block; background: linear-gradient(135deg, hsl(180,60%,55%), hsl(158,64%,38%)); color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Confirmar mi Email</a>
                <p style="margin-top: 20px; font-size: 12px; color: #888;">O copia y pega este enlace en tu navegador:<br/><a href="${confirmationUrl}">${confirmationUrl}</a></p>
              </td></tr>
            `,
          },
        },
        MessageStream: 'outbound',
      }),
    });

    const result = await confirmRes.json();
    console.log('Confirmation email resent:', confirmRes.status);

    return new Response(
      JSON.stringify({ success: true, message: 'Correo de confirmación reenviado exitosamente' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reenviar-confirmacion-email:', error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Error interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
