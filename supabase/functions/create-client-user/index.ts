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

    const { email, usuario_id } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if auth user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email === email);

    let authUserId: string;

    if (existingAuthUser) {
      // User already exists in auth.users, just update password and link
      authUserId = existingAuthUser.id;
      
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
    }

    // Update the usuarios table with auth_user_id
    const { error: updateUsuarioError } = await supabaseAdmin
      .from('usuarios')
      .update({ 
        auth_user_id: authUserId,
        debe_cambiar_password: true,
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Client user created successfully',
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
