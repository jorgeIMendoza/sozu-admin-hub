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

    const { email: rawEmail, nombre, id_persona } = await req.json();
    const email = rawEmail?.toLowerCase()?.trim();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[create-client-user] Processing request for email: ${email}`);

    let authUserId: string;

    // Step 1: Try to create auth user first, handle if already exists
    console.log(`[create-client-user] Creating new auth user for: ${email}`);
    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: 'Temporal123!',
      email_confirm: true,
    });

    if (createError) {
      // Check if user already exists
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        console.log(`[create-client-user] Auth user already exists for: ${email}, fetching existing user`);
        
        // Get the existing user by listing and filtering (since getUserByEmail doesn't exist in admin API)
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000
        });
        
        const existingUser = usersData?.users?.find(u => u.email === email);
        
        if (existingUser) {
          authUserId = existingUser.id;
          console.log(`[create-client-user] Found existing auth user with ID: ${authUserId}`);
          
          // Update password to temporary
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password: 'Temporal123!',
          });

          if (updateError) {
            console.error('Error updating auth user password:', updateError);
            // Continue anyway, the user exists
          }
        } else {
          // User exists but couldn't be found - try alternative approach
          // Just log and continue, the usuarios table will be updated without auth_user_id
          console.warn(`[create-client-user] Could not find existing user: ${email}, skipping auth update`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'User already exists in auth but could not be linked',
              warning: 'auth_user_id not set'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.error('Error creating auth user:', createError);
        return new Response(
          JSON.stringify({ error: `Error creating auth user: ${createError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      authUserId = newAuthUser.user.id;
      console.log(`[create-client-user] Created auth user with ID: ${authUserId}`);
    }

    // Step 2: Update the usuarios record with auth_user_id
    // The usuarios record should already exist (created by database trigger)
    console.log(`[create-client-user] Updating usuario with auth_user_id: ${authUserId}`);
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

    console.log(`[create-client-user] Successfully processed client user: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Client user processed successfully',
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
