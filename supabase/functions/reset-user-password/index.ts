import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface ResetPasswordRequest {
  email: string;
}

const TEMP_PASSWORD = 'Temporal123!';

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function findUserByEmail(supabaseAdmin: any, email: string) {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('auth_user_id, nombre, rol_id')
    .eq('email', email)
    .single();
  return { data, error };
}

async function sendConfirmationEmail(supabaseAdmin: any, email: string, nombre: string | null) {
  const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

  const thankYouUrl = `https://inmobiliarias.sozu.com/auth/confirmacion-email?email=${encodeURIComponent(email)}&nombre=${encodeURIComponent(nombre || '')}`;

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: thankYouUrl },
  });

  if (linkError) {
    console.error('Error generating confirmation link:', linkError);
    return { error: 'Error al generar enlace de confirmación' };
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

  if (!confirmationUrl || !POSTMARK_TOKEN) {
    return { error: 'No se pudo generar el enlace o falta configuración de correo' };
  }

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
          <p style="font-size:16px;color:#333;">Hola <strong>${nombre || 'Usuario'}</strong>,</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Tu contraseña ha sido reseteada. Para recibir tu nueva contraseña temporal, primero confirma tu dirección de email haciendo clic en el siguiente botón:</p>
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
      To: email,
      Subject: 'Confirma tu correo electrónico - Sozu',
      HtmlBody: htmlBody,
      MessageStream: 'outbound',
    }),
  });

  console.log('Confirmation email sent:', confirmRes.status);
  return { success: true };
}

async function resetPassword(supabaseAdmin: any, email: string, authUserId: string | null, nombre: string | null) {
  let finalAuthUserId = authUserId;

  if (!finalAuthUserId) {
    console.log(`User ${email} has no auth_user_id. Creating auth user...`);
    const { data: newAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { name: nombre || email },
    });

    if (createAuthError) {
      console.error('Error creating auth user:', createAuthError);
      return { error: `Error al crear usuario en Auth: ${createAuthError.message}` };
    }

    finalAuthUserId = newAuthUser.user.id;

    const { error: updateAuthIdError } = await supabaseAdmin
      .from('usuarios')
      .update({ auth_user_id: finalAuthUserId, fecha_actualizacion: new Date().toISOString() })
      .eq('email', email);

    if (updateAuthIdError) {
      console.error('Error updating auth_user_id:', updateAuthIdError);
    }

    console.log(`Auth user created successfully with id: ${finalAuthUserId}`);
  } else {
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      finalAuthUserId,
      { password: TEMP_PASSWORD }
    );

    if (updateAuthError) {
      console.error('Error updating auth password:', updateAuthError);
      return { error: `Error al resetear contraseña: ${updateAuthError.message}` };
    }
  }

  // Mark password as temporary AND email as unconfirmed
  const { error: updateUsuarioError } = await supabaseAdmin
    .from('usuarios')
    .update({ 
      debe_cambiar_password: true, 
      email_confirmado: false,
      fecha_actualizacion: new Date().toISOString() 
    })
    .eq('email', email);

  if (updateUsuarioError) {
    console.error('Error updating usuarios table:', updateUsuarioError);
  }

  // Send confirmation email
  const confirmResult = await sendConfirmationEmail(supabaseAdmin, email, nombre);
  if (confirmResult.error) {
    console.error('Error sending confirmation email:', confirmResult.error);
    // Don't fail the whole operation, password was already reset
  }

  console.log(`Password reset successfully for: ${email}. Confirmation email sent.`);
  return { success: true };
}

// --- API Key mode: only for Cliente role ---
async function handleApiKeyMode(req: Request, apiKey: string) {
  const expectedKey = Deno.env.get('RESET_PASSWORD_API_KEY');
  if (!expectedKey || apiKey !== expectedKey) {
    console.error('Invalid API key');
    return jsonResponse({ error: 'API key inválida' }, 401);
  }

  const { email } = await req.json() as ResetPasswordRequest;
  if (!email) {
    return jsonResponse({ error: 'Email is required' }, 400);
  }

  console.log(`[API Key mode] Resetting password for: ${email}`);
  const supabaseAdmin = createAdminClient();

  const { data: targetUser, error: targetUserError } = await findUserByEmail(supabaseAdmin, email);
  if (targetUserError || !targetUser) {
    console.error('Error finding target user:', targetUserError);
    return jsonResponse({ error: 'Usuario no encontrado en la base de datos' }, 404);
  }

  // Only allow Cliente role (ID 23)
  if (targetUser.rol_id !== 23) {
    console.error(`User ${email} has rol_id ${targetUser.rol_id}, not Cliente (23)`);
    return jsonResponse({ error: 'Esta API key solo permite resetear usuarios con rol Cliente' }, 403);
  }

  const result = await resetPassword(supabaseAdmin, email, targetUser.auth_user_id, targetUser.nombre);
  if (result.error) {
    return jsonResponse({ error: result.error }, 500);
  }

  return jsonResponse({
    success: true,
    message: `Contraseña reseteada. Se envió un correo de confirmación a ${email}. Una vez confirmado, recibirá sus credenciales temporales.`,
  }, 200);
}

// --- JWT mode: Super Admin can reset any user ---
async function handleJwtMode(req: Request, authHeader: string) {
  const token = authHeader.replace('Bearer ', '');
  console.log('Token received, length:', token.length);

  // Decode JWT to get user ID
  let requestingUserId: string;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    requestingUserId = payload.sub;
    if (!requestingUserId) throw new Error('No user ID in token');
    console.log('Decoded user ID from token:', requestingUserId);
  } catch (decodeError) {
    console.error('Error decoding token:', decodeError);
    return jsonResponse({ error: 'Invalid token format' }, 401);
  }

  const supabaseAdmin = createAdminClient();

  // Verify user exists
  const { data: requestingUserAuth, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(requestingUserId);
  if (authUserError || !requestingUserAuth?.user) {
    console.error('Error verifying user:', authUserError);
    return jsonResponse({ error: 'Unauthorized - invalid token' }, 401);
  }

  const requestingUser = requestingUserAuth.user;
  console.log('Verified requesting user:', requestingUser.email);

  // Check Super Admin role
  const { data: requestingUserData, error: requestingUserError } = await supabaseAdmin
    .from('usuarios')
    .select('rol_id, roles(nombre)')
    .eq('auth_user_id', requestingUser.id)
    .single();

  if (requestingUserError || !requestingUserData) {
    console.error('Error fetching requesting user data:', requestingUserError);
    return jsonResponse({ error: 'Error fetching user data' }, 500);
  }

  const rolNombre = (requestingUserData.roles as any)?.nombre;
  const requestingRolId = requestingUserData.rol_id;
  console.log('User role:', rolNombre, 'rol_id:', requestingRolId);

  // Only Super Administrador (1), Administrador de Proyecto (2), and Inmobiliaria (4) can reset passwords
  if (requestingRolId !== 1 && requestingRolId !== 2 && requestingRolId !== 4) {
    return jsonResponse({ error: 'No tienes permisos para resetear contraseñas' }, 403);
  }

  // Parse body
  const { email } = await req.json() as ResetPasswordRequest;
  if (!email) {
    return jsonResponse({ error: 'Email is required' }, 400);
  }

  // Prevent self-reset
  if (requestingUser.email === email) {
    return jsonResponse({ error: 'No puedes resetear tu propia contraseña desde esta función' }, 400);
  }

  console.log(`[JWT mode] Resetting password for: ${email}`);

  const { data: targetUser, error: targetUserError } = await findUserByEmail(supabaseAdmin, email);
  if (targetUserError || !targetUser) {
    console.error('Error finding target user:', targetUserError);
    return jsonResponse({ error: 'Usuario no encontrado en la base de datos' }, 404);
  }

  // Administrador de Proyecto and Inmobiliaria can reset Inmobiliaria (4), Agente Inmobiliario (3) and Agente Interno (9)
  if ((requestingRolId === 2 || requestingRolId === 4) && ![3, 4, 9].includes(targetUser.rol_id)) {
    console.error(`Role ${requestingRolId} cannot reset rol_id ${targetUser.rol_id}`);
    return jsonResponse({ error: 'Solo puedes resetear contraseñas de usuarios con rol Inmobiliaria, Agente Inmobiliario o Agente Interno' }, 403);
  }

  const result = await resetPassword(supabaseAdmin, email, targetUser.auth_user_id, targetUser.nombre);
  if (result.error) {
    return jsonResponse({ error: result.error }, 500);
  }

  return jsonResponse({
    success: true,
    message: `Contraseña reseteada. Se envió un correo de confirmación a ${email}. Una vez confirmado, recibirá sus credenciales temporales.`,
  }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('x-api-key');
    const authHeader = req.headers.get('Authorization');

    if (apiKey) {
      return await handleApiKeyMode(req, apiKey);
    }

    if (authHeader) {
      return await handleJwtMode(req, authHeader);
    }

    return jsonResponse({ error: 'Se requiere Authorization header o x-api-key' }, 401);
  } catch (error) {
    console.error('Unexpected error:', error);
    return jsonResponse({ error: `Error inesperado: ${error.message}` }, 500);
  }
});
