import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email: rawEmail, nombre, id_persona } = await req.json();
    const email = rawEmail?.toLowerCase()?.trim();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[create-client-user] Processing request for email: ${email}`);

    // Step 1: Mark email_confirmado = false in usuarios table
    const { error: updateConfirmError } = await supabaseAdmin
      .from('usuarios')
      .update({ 
        email_confirmado: false,
        fecha_actualizacion: new Date().toISOString()
      })
      .ilike('email', email);

    if (updateConfirmError) {
      console.error('Error setting email_confirmado:', updateConfirmError);
    }

    // Step 2: Generate confirmation link and send email
    const thankYouUrl = `https://clientes.sozu.com/auth/confirmacion-email?email=${encodeURIComponent(email)}&nombre=${encodeURIComponent(nombre || '')}&portal=clientes&destination=change-password`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: thankYouUrl,
      },
    });

    if (linkError) {
      console.error('Error generating confirmation link:', linkError);
      // If we can't generate a link, we still need to create the auth user
      // so fall through to the auth user creation below
    }

    let confirmationUrl = linkData?.properties?.action_link;

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

    // Send confirmation email via Postmark
    if (confirmationUrl && POSTMARK_TOKEN) {
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
          <p style="font-size:16px;color:#333;">Hola <strong>${nombre || 'Cliente'}</strong>,</p>
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

      try {
        const confirmRes = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: 'Notificaciones Sozu <notificaciones@sozu.com>',
            To: email,
            Subject: 'Confirma tu correo electrónico - Sozu',
            HtmlBody: htmlBody,
            MessageStream: 'outbound',
          }),
        });

        console.log(`[create-client-user] Confirmation email sent: ${confirmRes.status}`);
      } catch (emailError) {
        console.error('[create-client-user] Error sending confirmation email:', emailError);
      }
    } else {
      console.warn('[create-client-user] Could not send confirmation email - missing URL or POSTMARK_TOKEN');
    }

    console.log(`[create-client-user] Successfully processed client user: ${email} (pending email confirmation)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Client user created. Confirmation email sent. Auth user will be created after email confirmation.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
