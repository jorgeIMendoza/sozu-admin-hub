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

    // Generate confirmation link - redirect to frontend thank-you page
    const thankYouUrl = `https://inmobiliarias.sozu.com/auth/confirmacion-email?email=${encodeURIComponent(emailLower)}&nombre=${encodeURIComponent(usuario.nombre || '')}`;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: emailLower,
      options: {
        redirectTo: thankYouUrl,
      },
    });

    if (linkError) {
      console.error('Error generating link:', linkError);
      throw new Error('Error al generar enlace de confirmación');
    }

    let confirmationUrl = linkData?.properties?.action_link;

    // Rebuild the URL to ensure redirect goes to thank-you page
    if (confirmationUrl) {
      try {
        const actionUrl = new URL(confirmationUrl);
        const token = actionUrl.searchParams.get('token');
        const type = actionUrl.searchParams.get('type');
        if (token) {
          confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type || 'magiclink'}&redirect_to=${encodeURIComponent(thankYouUrl)}`;
        }
      } catch (e) {
        console.error('Error rebuilding confirmation URL:', e);
      }
    }

    if (!confirmationUrl || !POSTMARK_TOKEN) {
      throw new Error('No se pudo generar el enlace o falta configuración de correo');
    }

    // Send standalone confirmation email via Postmark
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
          <p style="font-size:16px;color:#333;">Hola <strong>${usuario.nombre || 'Usuario'}</strong>,</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Para activar tu cuenta y recibir tus credenciales de acceso, confirma tu dirección de email haciendo clic en el siguiente botón:</p>
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
