import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  nombre: string;
  rol_id: number;
  id_persona?: number;
  telefono?: string;
  clave_pais_telefono?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user from the token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if requesting user is a Super Admin
    const { data: adminCheck, error: adminCheckError } = await supabaseAdmin
      .from("usuarios")
      .select("rol_id, roles!inner(nombre)")
      .eq("auth_user_id", requestingUser.id)
      .single();

    if (adminCheckError || !adminCheck) {
      console.error("Admin check error:", adminCheckError);
      return new Response(
        JSON.stringify({ error: "User not found in usuarios table" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rolNombre = (adminCheck.roles as any)?.nombre;
    if (rolNombre !== "Super Administrador") {
      return new Response(
        JSON.stringify({ error: "Only Super Administrators can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();
    const { email, nombre, rol_id, id_persona, telefono, clave_pais_telefono } = body;

    console.log("Creating user:", { email, nombre, rol_id, id_persona });

    // Validate required fields
    if (!email || !nombre || !rol_id) {
      return new Response(
        JSON.stringify({ error: "Email, nombre, and rol_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists in usuarios table
    const { data: existingUser } = await supabaseAdmin
      .from("usuarios")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default password
    const defaultPassword = "Temporal123!";

    // Create user in auth.users
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        nombre,
        rol_id,
      },
    });

    if (createAuthError) {
      console.error("Error creating auth user:", createAuthError);
      return new Response(
        JSON.stringify({ error: `Error creating auth user: ${createAuthError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Auth user created:", authData.user?.id);

    // Create/update entry in usuarios table
    const { data: usuarioData, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .upsert({
        email,
        nombre,
        rol_id,
        id_persona: id_persona || null,
        auth_user_id: authData.user?.id,
        debe_cambiar_password: true,
        activo: true,
        telefono: telefono || null,
        clave_pais_telefono: clave_pais_telefono || null,
      }, {
        onConflict: "email",
      })
      .select()
      .single();

    if (usuarioError) {
      console.error("Error creating usuario:", usuarioError);
      // Try to delete the auth user if usuario creation fails
      if (authData.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return new Response(
        JSON.stringify({ error: `Error creating usuario: ${usuarioError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Usuario created successfully:", usuarioData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          email: usuarioData.email,
          nombre: usuarioData.nombre,
          rol_id: usuarioData.rol_id,
        },
        message: `Usuario creado con contraseña temporal: ${defaultPassword}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
