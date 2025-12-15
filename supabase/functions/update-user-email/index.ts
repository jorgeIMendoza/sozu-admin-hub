import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { oldEmail, newEmail } = await req.json();

    if (!oldEmail || !newEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'oldEmail y newEmail son requeridos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1. Get the user from usuarios table to find auth_user_id
    const { data: usuario, error: fetchError } = await supabaseAdmin
      .from('usuarios')
      .select('email, auth_user_id')
      .eq('email', oldEmail)
      .single();

    if (fetchError || !usuario) {
      return new Response(
        JSON.stringify({ success: false, message: `Usuario no encontrado: ${fetchError?.message || 'No existe'}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('Usuario encontrado:', usuario);

    // 2. Update email in auth.users
    if (usuario.auth_user_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        usuario.auth_user_id,
        { email: newEmail }
      );

      if (authError) {
        console.error('Error updating auth user:', authError);
        return new Response(
          JSON.stringify({ success: false, message: `Error actualizando auth.users: ${authError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      console.log('Email actualizado en auth.users');
    }

    // 3. Update email in usuarios table
    const { error: updateError } = await supabaseAdmin
      .from('usuarios')
      .update({ email: newEmail })
      .eq('email', oldEmail);

    if (updateError) {
      console.error('Error updating usuarios:', updateError);
      return new Response(
        JSON.stringify({ success: false, message: `Error actualizando usuarios: ${updateError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Email actualizado en usuarios');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email actualizado correctamente en ambas tablas',
        oldEmail,
        newEmail
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
