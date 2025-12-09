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

    const targetEmail = 'jorge.mendoza@sozu.com';
    const tempPassword = 'Temporal123!';

    // Check if user already exists in auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email === targetEmail);

    if (existingAuthUser) {
      // Link existing auth user to usuarios if not linked
      const { error: updateError } = await supabaseAdmin
        .from('usuarios')
        .update({ 
          auth_user_id: existingAuthUser.id,
          debe_cambiar_password: true 
        })
        .eq('email', targetEmail);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Usuario ya existía en auth.users, vinculado a usuarios',
          auth_user_id: existingAuthUser.id,
          email: targetEmail,
          password: tempPassword
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user exists in usuarios table
    const { data: usuarioExistente, error: checkError } = await supabaseAdmin
      .from('usuarios')
      .select('email, nombre, rol_id, auth_user_id')
      .eq('email', targetEmail)
      .single();

    console.log('Usuario encontrado:', usuarioExistente);
    console.log('Error de búsqueda:', checkError);

    if (checkError || !usuarioExistente) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Usuario no encontrado en tabla usuarios: ${checkError?.message || 'No encontrado'}`,
          searchedEmail: targetEmail
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (usuarioExistente.auth_user_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Usuario ya tiene auth_user_id vinculado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return new Response(
        JSON.stringify({ success: false, message: authError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Link auth user to usuarios table
    const { error: updateError } = await supabaseAdmin
      .from('usuarios')
      .update({ 
        auth_user_id: authData.user.id,
        debe_cambiar_password: true 
      })
      .eq('email', targetEmail);

    if (updateError) {
      console.error('Error updating usuarios:', updateError);
      return new Response(
        JSON.stringify({ success: false, message: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Usuario ${targetEmail} creado y vinculado exitosamente`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Usuario creado exitosamente',
        email: targetEmail,
        password: tempPassword,
        auth_user_id: authData.user.id
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
