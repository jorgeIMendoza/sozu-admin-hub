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
  id_inmobiliaria?: number; // ID of the inmobiliaria to link the agent to
  telefono?: string;
  clave_pais_telefono?: string;
  auto_create?: boolean; // Flag for automatic creation (bypasses Super Admin check for Inmobiliaria role)
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the request is from an authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token and decode it to get the user ID
    const token = authHeader.replace('Bearer ', '');
    
    // Decode JWT payload to extract user ID (the token is already validated by Supabase gateway)
    let requestingUserId: string;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      const payload = JSON.parse(atob(parts[1]));
      requestingUserId = payload.sub;
      if (!requestingUserId) {
        throw new Error('No sub claim in token');
      }
      console.log("Decoded user ID from JWT:", requestingUserId);
    } catch (decodeError) {
      console.error("JWT decode error:", decodeError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user exists using admin API
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.admin.getUserById(requestingUserId);
    
    if (authError || !requestingUser) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user ID:", requestingUser.id);

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

    // Parse request body early to check for auto_create flag
    const body: CreateUserRequest = await req.json();
    const { email: rawEmail, nombre, rol_id, id_persona, id_inmobiliaria, telefono, clave_pais_telefono, auto_create } = body;
    const email = rawEmail?.toLowerCase()?.trim();

    // Check if this is an automatic creation for Inmobiliaria or Agente Inmobiliario role (bypasses Super Admin check)
    const ROLE_INMOBILIARIA = 4;
    const ROLE_AGENTE_INMOBILIARIO = 3;
    const isAutoCreate = auto_create === true && (rol_id === ROLE_INMOBILIARIA || rol_id === ROLE_AGENTE_INMOBILIARIO);

    const rolNombre = (adminCheck.roles as any)?.nombre;
    if (!isAutoCreate && rolNombre !== "Super Administrador") {
      return new Response(
        JSON.stringify({ error: "Only Super Administrators can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isAutoCreate) {
      console.log(`Auto-create mode enabled for ${rol_id === ROLE_INMOBILIARIA ? 'Inmobiliaria' : 'Agente Inmobiliario'} user creation`);
    }

    console.log("Creating user:", { email, nombre, rol_id, id_persona, id_inmobiliaria, auto_create });

    // Validate required fields
    if (!email || !nombre || !rol_id) {
      return new Response(
        JSON.stringify({ error: "Email, nombre, and rol_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists in usuarios table
    const { data: existingUsuario } = await supabaseAdmin
      .from("usuarios")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUsuario) {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists in usuarios table" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default password
    const defaultPassword = "Temporal123!";

    let authUserId: string;
    let existingAuthUser = false;

    // Try to create the auth user first - this is more reliable than searching
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        nombre,
        rol_id,
      },
    });

    if (createAuthError) {
      // Check if user already exists
      if (createAuthError.message.includes('already been registered') || 
          createAuthError.message.includes('already exists') ||
          (createAuthError as any).code === 'email_exists') {
        console.log("Auth user already exists, searching for existing user...");
        
        // Search through paginated results to find the existing user
        let page = 1;
        const perPage = 1000;
        let foundUser = null;
        
        while (!foundUser) {
          const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });
          
          if (listError || !usersPage?.users?.length) {
            break;
          }
          
          foundUser = usersPage.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          
          if (foundUser || usersPage.users.length < perPage) {
            break;
          }
          page++;
        }
        
        if (foundUser) {
          authUserId = foundUser.id;
          existingAuthUser = true;
          console.log("Found existing auth user:", authUserId);
          
          // Optionally reset password to default
          await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password: defaultPassword,
          });
          console.log("Reset password for existing auth user");
        } else {
          console.error("Auth user exists but could not be found in listing");
          return new Response(
            JSON.stringify({ error: "El usuario existe en auth pero no se pudo encontrar. Contacte soporte." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.error("Error creating auth user:", createAuthError);
        return new Response(
          JSON.stringify({ error: `Error creating auth user: ${createAuthError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log("Auth user created:", authData.user?.id);
      authUserId = authData.user!.id;
    }

    // For Inmobiliaria role (rol_id 4), if no id_persona is provided, try to find or create it
    let finalIdPersona = id_persona || null;
    
    if (rol_id === ROLE_INMOBILIARIA && !finalIdPersona) {
      console.log("Inmobiliaria role detected without id_persona, searching for existing persona by email...");
      
      // Try to find an existing inmobiliaria persona with this email
      const { data: existingInmobiliariaPersonas } = await supabaseAdmin
        .from('entidades_relacionadas')
        .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, email, nombre_legal)')
        .eq('id_tipo_entidad', 5) // Inmobiliaria
        .eq('activo', true);
      
      const matchingInmobiliaria = (existingInmobiliariaPersonas || []).find((er: any) => 
        er.personas?.email?.toLowerCase() === email.toLowerCase()
      );
      
      if (matchingInmobiliaria?.id_persona) {
        finalIdPersona = matchingInmobiliaria.id_persona;
        console.log(`Found existing inmobiliaria persona: ${finalIdPersona}`);
      } else {
        console.log("No existing inmobiliaria persona found with this email");
      }
    }

    // Create entry in usuarios table
    const { data: usuarioData, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        email,
        nombre,
        rol_id,
        id_persona: finalIdPersona,
        auth_user_id: authUserId,
        debe_cambiar_password: true,
        activo: true,
        telefono: telefono || null,
        clave_pais_telefono: clave_pais_telefono || null,
      })
      .select()
      .single();

    if (usuarioError) {
      console.error("Error creating usuario:", usuarioError);
      // Only delete auth user if we just created it
      if (!existingAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return new Response(
        JSON.stringify({ error: `Error creating usuario: ${usuarioError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Usuario created successfully:", usuarioData);

    // For agents (rol_id 3 or 9) OR secondary Inmobiliaria users (rol_id 4), handle the inmobiliaria linkage
    const ROLE_AGENTE_INTERNO = 9;
    
    // Determine if this is a secondary Inmobiliaria user (rol 4 with id_inmobiliaria but id_persona doesn't match)
    const isSecondaryInmobiliariaUser = rol_id === ROLE_INMOBILIARIA && id_inmobiliaria && finalIdPersona !== id_inmobiliaria;
    
    // Handle agents and secondary Inmobiliaria users
    if (((rol_id === ROLE_AGENTE_INMOBILIARIO || rol_id === ROLE_AGENTE_INTERNO) && id_inmobiliaria) || isSecondaryInmobiliariaUser) {
      try {
        let personaIdToUse = finalIdPersona;
        
        // If no id_persona was provided, create a new persona record (for agents only)
        if (!personaIdToUse && (rol_id === ROLE_AGENTE_INMOBILIARIO || rol_id === ROLE_AGENTE_INTERNO)) {
          const { data: newPersona, error: personaError } = await supabaseAdmin
            .from("personas")
            .insert({
              nombre_legal: nombre,
              email: email,
              tipo_persona: 'pf',
              activo: true,
              telefono: telefono || null,
              clave_pais_telefono: clave_pais_telefono || null
            })
            .select()
            .single();
          
          if (personaError) {
            console.error("Error creating persona for agent:", personaError);
          } else {
            personaIdToUse = newPersona.id;
            
            // Update the usuario with the persona id
            await supabaseAdmin
              .from("usuarios")
              .update({ id_persona: personaIdToUse })
              .eq("email", email);
            
            console.log("Created persona for agent:", personaIdToUse);
          }
        }
        
        // For agents only, create entidad_relacionada with tipo 19
        // Secondary Inmobiliaria users don't need entidad_relacionada, they inherit via proyectos_acceso
        if (personaIdToUse && (rol_id === ROLE_AGENTE_INMOBILIARIO || rol_id === ROLE_AGENTE_INTERNO)) {
          // Check if entidad_relacionada already exists
          const { data: existingEntidad } = await supabaseAdmin
            .from("entidades_relacionadas")
            .select("id, id_persona_duena_lead")
            .eq("id_persona", personaIdToUse)
            .eq("id_tipo_entidad", 19)
            .eq("activo", true)
            .maybeSingle();
          
          if (existingEntidad) {
            // Update existing entidad with the inmobiliaria link if not set
            if (!existingEntidad.id_persona_duena_lead) {
              await supabaseAdmin
                .from("entidades_relacionadas")
                .update({ id_persona_duena_lead: id_inmobiliaria })
                .eq("id", existingEntidad.id);
              
              console.log(`Updated entity ${personaIdToUse} with inmobiliaria ${id_inmobiliaria}`);
            }
          } else {
            // Create new entidad_relacionada for agent
            const { error: entidadError } = await supabaseAdmin
              .from("entidades_relacionadas")
              .insert({
                id_persona: personaIdToUse,
                id_tipo_entidad: 19,
                id_persona_duena_lead: id_inmobiliaria,
                activo: true
              });
            
            if (entidadError) {
              console.error("Error creating entidad_relacionada:", entidadError);
            } else {
              console.log(`Created entidad_relacionada (type 19) linking ${personaIdToUse} to inmobiliaria ${id_inmobiliaria}`);
            }
          }
        }

        // Copy project access from the inmobiliaria (for both agents and secondary Inmobiliaria users)
        const { data: inmobiliariaPersona } = await supabaseAdmin
          .from("personas")
          .select("email")
          .eq("id", id_inmobiliaria)
          .single();

        // Resolve the entidad_relacionada ID for this inmobiliaria to use as fallback
        let inmobiliariaEntidadId: number | null = null;
        const { data: inmobEntidad } = await supabaseAdmin
          .from("entidades_relacionadas")
          .select("id")
          .eq("id_persona", id_inmobiliaria)
          .eq("id_tipo_entidad", 5)
          .eq("activo", true)
          .maybeSingle();
        if (inmobEntidad) {
          inmobiliariaEntidadId = inmobEntidad.id;
        }

        if (inmobiliariaPersona?.email) {
          const { data: inmobiliariaAccess } = await supabaseAdmin
            .from("proyectos_acceso")
            .select("proyecto_id, id_entidad_relacionada_dueno")
            .eq("usuario_id", inmobiliariaPersona.email)
            .eq("activo", true);

          if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
            const accessToInsert = inmobiliariaAccess.map((access: any) => ({
              usuario_id: email,
              proyecto_id: access.proyecto_id,
              id_entidad_relacionada_dueno: access.id_entidad_relacionada_dueno || inmobiliariaEntidadId,
              activo: true
            }));

            const { error: accessError } = await supabaseAdmin
              .from("proyectos_acceso")
              .upsert(accessToInsert, { 
                onConflict: "usuario_id,proyecto_id",
                ignoreDuplicates: true 
              });

            if (accessError) {
              console.error("Error copying project access:", accessError);
            } else {
              console.log(`Copied ${accessToInsert.length} project access entries to user ${email}`);
            }
          } else if (inmobiliariaEntidadId) {
            // No access entries found from primary user, but we know the inmobiliaria entity
            // Check if there are projects linked to this inmobiliaria entity
            const { data: entityAccess } = await supabaseAdmin
              .from("proyectos_acceso")
              .select("proyecto_id")
              .eq("id_entidad_relacionada_dueno", inmobiliariaEntidadId)
              .eq("activo", true)
              .limit(50);

            if (entityAccess && entityAccess.length > 0) {
              const uniqueProjects = [...new Set(entityAccess.map((a: any) => a.proyecto_id))];
              const accessToInsert = uniqueProjects.map(projId => ({
                usuario_id: email,
                proyecto_id: projId,
                id_entidad_relacionada_dueno: inmobiliariaEntidadId,
                activo: true
              }));

              const { error: accessError } = await supabaseAdmin
                .from("proyectos_acceso")
                .upsert(accessToInsert, {
                  onConflict: "usuario_id,proyecto_id",
                  ignoreDuplicates: true
                });

              if (accessError) {
                console.error("Error copying entity project access:", accessError);
              } else {
                console.log(`Copied ${accessToInsert.length} entity-based project access entries to user ${email}`);
              }
            }
          }
        }
      } catch (linkError) {
        console.error("Error in inmobiliaria linking process:", linkError);
        // Don't fail user creation if linking fails
      }
    } else if (rol_id === ROLE_AGENTE_INMOBILIARIO && finalIdPersona && !id_inmobiliaria) {
      // Legacy: If agent has id_persona but no id_inmobiliaria, try to get inmobiliaria from entidades_relacionadas
      try {
        const { data: agenteEntidad } = await supabaseAdmin
          .from("entidades_relacionadas")
          .select("id_persona_duena_lead")
          .eq("id_persona", finalIdPersona)
          .eq("id_tipo_entidad", 19)
          .eq("activo", true)
          .maybeSingle();

        if (agenteEntidad?.id_persona_duena_lead) {
          const { data: inmobiliariaPersona } = await supabaseAdmin
            .from("personas")
            .select("email")
            .eq("id", agenteEntidad.id_persona_duena_lead)
            .single();

          if (inmobiliariaPersona?.email) {
            const { data: inmobiliariaAccess } = await supabaseAdmin
              .from("proyectos_acceso")
              .select("proyecto_id, id_entidad_relacionada_dueno")
              .eq("usuario_id", inmobiliariaPersona.email)
              .eq("activo", true);

            if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
              const accessToInsert = inmobiliariaAccess.map((access: any) => ({
                usuario_id: email,
                proyecto_id: access.proyecto_id,
                id_entidad_relacionada_dueno: access.id_entidad_relacionada_dueno,
                activo: true
              }));

              const { error: accessError } = await supabaseAdmin
                .from("proyectos_acceso")
                .upsert(accessToInsert, { 
                  onConflict: "usuario_id,proyecto_id",
                  ignoreDuplicates: true 
                });

              if (accessError) {
                console.error("Error copying project access to agent:", accessError);
              } else {
                console.log(`Copied ${accessToInsert.length} project access entries to agent ${email}`);
              }
            }
          }
        }
      } catch (accessCopyError) {
        console.error("Error in project access copy process:", accessCopyError);
      }
    }

    const message = existingAuthUser 
      ? `Usuario creado (auth existente). La contraseña no fue cambiada.`
      : `Usuario creado con contraseña temporal: ${defaultPassword}`;

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          email: usuarioData.email,
          nombre: usuarioData.nombre,
          rol_id: usuarioData.rol_id,
        },
        message
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
