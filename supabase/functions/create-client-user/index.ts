import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email, nombre, id_persona } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[create-client-user] Processing request for email: ${email}`);

    // Step 1: Get the "Cliente" role ID
    const { data: clienteRole, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('nombre', 'Cliente')
      .eq('activo', true)
      .single();

    if (roleError || !clienteRole) {
      console.error('Error fetching Cliente role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Could not find Cliente role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clienteRoleId = clienteRole.id;
    console.log(`[create-client-user] Cliente role ID: ${clienteRoleId}`);

    // Step 2: Check if user already exists in usuarios table
    const { data: existingUsuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('email, auth_user_id, activo')
      .eq('email', email)
      .maybeSingle();

    if (usuarioError) {
      console.error('Error checking existing usuario:', usuarioError);
      return new Response(
        JSON.stringify({ error: `Error checking existing usuario: ${usuarioError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let authUserId: string;

    // Step 3: Check if auth user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email === email);

    if (existingAuthUser) {
      // User already exists in auth.users, just update password
      authUserId = existingAuthUser.id;
      console.log(`[create-client-user] Auth user exists with ID: ${authUserId}`);
      
      // Update password to temporary
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: 'Temporal123!',
      });

      if (updateError) {
        console.error('Error updating auth user password:', updateError);
        return new Response(
          JSON.stringify({ error: `Error updating auth user: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Create new auth user
      console.log(`[create-client-user] Creating new auth user for: ${email}`);
      const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: 'Temporal123!',
        email_confirm: true,
      });

      if (createError) {
        console.error('Error creating auth user:', createError);
        return new Response(
          JSON.stringify({ error: `Error creating auth user: ${createError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      authUserId = newAuthUser.user.id;
      console.log(`[create-client-user] Created auth user with ID: ${authUserId}`);
    }

    // Step 4: Create or update usuario record
    if (existingUsuario) {
      // Update existing usuario with auth_user_id
      console.log(`[create-client-user] Updating existing usuario: ${email}`);
      const { error: updateUsuarioError } = await supabaseAdmin
        .from('usuarios')
        .update({ 
          auth_user_id: authUserId,
          debe_cambiar_password: true,
          activo: true,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('email', email);

      if (updateUsuarioError) {
        console.error('Error updating usuario:', updateUsuarioError);
        return new Response(
          JSON.stringify({ error: `Error updating usuario: ${updateUsuarioError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Create new usuario with role "Cliente"
      console.log(`[create-client-user] Creating new usuario: ${email} with role ID: ${clienteRoleId}`);
      const usuarioData: Record<string, any> = {
        email: email,
        nombre: nombre || email.split('@')[0],
        rol_id: clienteRoleId,
        auth_user_id: authUserId,
        activo: true,
        debe_cambiar_password: true,
      };

      // Only add id_persona if provided and valid
      if (id_persona && typeof id_persona === 'number') {
        usuarioData.id_persona = id_persona;
      }

      const { error: insertUsuarioError } = await supabaseAdmin
        .from('usuarios')
        .insert(usuarioData);

      if (insertUsuarioError) {
        console.error('Error creating usuario:', insertUsuarioError);
        return new Response(
          JSON.stringify({ error: `Error creating usuario: ${insertUsuarioError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[create-client-user] Successfully processed client user: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: existingUsuario ? 'Client user updated successfully' : 'Client user created successfully',
        auth_user_id: authUserId 
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
