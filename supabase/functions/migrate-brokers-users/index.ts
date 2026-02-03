import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Usuarios a crear para Brokers and Brothers
const USUARIOS_A_CREAR = [
  { 
    email: 'contacto@brokersandbrothers.com', 
    personaId: 786, 
    nombre: 'Brokers and Brothers',
    rolId: 4,  // Inmobiliaria
    idInmobiliaria: null
  },
  { 
    email: 'eduardo@brokersbrothers.com', 
    personaId: 2361, 
    nombre: 'Eduardo Ochoa',
    rolId: 3,  // Agente Inmobiliario
    idInmobiliaria: 786  // Brokers and Brothers
  },
];

const TEMP_PASSWORD = 'Temporal123!';

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

    // Verify requesting user is Super Admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is Super Admin
    const { data: adminCheck } = await supabaseAdmin
      .from('usuarios')
      .select('rol_id, roles!inner(nombre)')
      .eq('auth_user_id', requestingUser.id)
      .single();

    const rolNombre = (adminCheck?.roles as any)?.nombre;
    if (rolNombre !== 'Super Administrador') {
      return new Response(
        JSON.stringify({ error: 'Solo Super Administradores pueden ejecutar esta migración' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Iniciando migración de usuarios Brokers and Brothers...');

    // Get existing auth users
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUsersByEmail = new Map(
      existingAuthUsers?.users?.map(u => [u.email?.toLowerCase(), u]) || []
    );

    const results: Array<{
      email: string;
      nombre: string;
      authCreated: boolean;
      usuarioCreated: boolean;
      error?: string;
    }> = [];

    for (const usuario of USUARIOS_A_CREAR) {
      console.log(`Procesando: ${usuario.nombre} (${usuario.email})`);

      try {
        // Check if usuario already exists
        const { data: existingUsuario } = await supabaseAdmin
          .from('usuarios')
          .select('id')
          .eq('email', usuario.email)
          .maybeSingle();

        if (existingUsuario) {
          console.log(`  → Usuario ya existe, saltando`);
          results.push({
            email: usuario.email,
            nombre: usuario.nombre,
            authCreated: false,
            usuarioCreated: false,
            error: 'Usuario ya existe'
          });
          continue;
        }

        let authUserId: string;
        let authCreated = false;

        // Check if auth user exists
        const existingAuth = authUsersByEmail.get(usuario.email.toLowerCase());

        if (existingAuth) {
          console.log(`  → Auth user existe: ${existingAuth.id}`);
          authUserId = existingAuth.id;
        } else {
          // Create auth user
          console.log(`  → Creando auth user...`);
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: usuario.email,
            password: TEMP_PASSWORD,
            email_confirm: true,
          });

          if (authError) {
            console.error(`  ✗ Error creando auth user:`, authError.message);
            results.push({
              email: usuario.email,
              nombre: usuario.nombre,
              authCreated: false,
              usuarioCreated: false,
              error: `Error auth: ${authError.message}`
            });
            continue;
          }

          authUserId = authData.user!.id;
          authCreated = true;
          console.log(`  → Auth user creado: ${authUserId}`);
        }

        // Create usuario record
        console.log(`  → Creando registro en usuarios...`);
        const { error: usuarioError } = await supabaseAdmin
          .from('usuarios')
          .insert({
            email: usuario.email,
            nombre: usuario.nombre,
            rol_id: usuario.rolId,
            id_persona: usuario.personaId,
            auth_user_id: authUserId,
            debe_cambiar_password: true,
            activo: true,
          });

        if (usuarioError) {
          console.error(`  ✗ Error creando usuario:`, usuarioError.message);
          
          // If we just created the auth user, we should clean it up
          if (authCreated) {
            await supabaseAdmin.auth.admin.deleteUser(authUserId);
          }
          
          results.push({
            email: usuario.email,
            nombre: usuario.nombre,
            authCreated: false,
            usuarioCreated: false,
            error: `Error usuario: ${usuarioError.message}`
          });
          continue;
        }

        console.log(`  ✓ Usuario creado exitosamente`);

        // For agents, link to inmobiliaria via entidades_relacionadas
        if (usuario.rolId === 3 && usuario.idInmobiliaria) {
          // Check if entidad_relacionada already exists
          const { data: existingEntidad } = await supabaseAdmin
            .from('entidades_relacionadas')
            .select('id')
            .eq('id_persona', usuario.personaId)
            .eq('id_tipo_entidad', 19)
            .eq('activo', true)
            .maybeSingle();

          if (!existingEntidad) {
            // Create entidad_relacionada linking agent to inmobiliaria
            const { error: entidadError } = await supabaseAdmin
              .from('entidades_relacionadas')
              .insert({
                id_persona: usuario.personaId,
                id_tipo_entidad: 19, // Agente
                id_persona_duena_lead: usuario.idInmobiliaria,
                activo: true
              });

            if (entidadError) {
              console.error(`  ⚠ Error creando entidad_relacionada:`, entidadError.message);
            } else {
              console.log(`  ✓ Entidad relacionada creada, agente vinculado a inmobiliaria`);
            }
          }

          // Copy project access from the inmobiliaria
          const { data: inmobiliariaPersona } = await supabaseAdmin
            .from('personas')
            .select('email')
            .eq('id', usuario.idInmobiliaria)
            .single();

          if (inmobiliariaPersona?.email) {
            const { data: inmobiliariaAccess } = await supabaseAdmin
              .from('proyectos_acceso')
              .select('proyecto_id, id_entidad_relacionada_dueno')
              .eq('usuario_id', inmobiliariaPersona.email)
              .eq('activo', true);

            if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
              const accessToInsert = inmobiliariaAccess.map((access: any) => ({
                usuario_id: usuario.email,
                proyecto_id: access.proyecto_id,
                id_entidad_relacionada_dueno: access.id_entidad_relacionada_dueno,
                activo: true
              }));

              const { error: accessError } = await supabaseAdmin
                .from('proyectos_acceso')
                .upsert(accessToInsert, { 
                  onConflict: 'usuario_id,proyecto_id',
                  ignoreDuplicates: true 
                });

              if (accessError) {
                console.error(`  ⚠ Error copiando acceso a proyectos:`, accessError.message);
              } else {
                console.log(`  ✓ Copiado acceso a ${accessToInsert.length} proyectos`);
              }
            }
          }
        }

        results.push({
          email: usuario.email,
          nombre: usuario.nombre,
          authCreated,
          usuarioCreated: true,
        });

      } catch (error) {
        console.error(`  ✗ Error inesperado:`, error);
        results.push({
          email: usuario.email,
          nombre: usuario.nombre,
          authCreated: false,
          usuarioCreated: false,
          error: `Error: ${error.message}`
        });
      }
    }

    const successCount = results.filter(r => r.usuarioCreated).length;
    const authCreatedCount = results.filter(r => r.authCreated).length;

    console.log(`Migración completada: ${successCount}/${USUARIOS_A_CREAR.length} usuarios creados`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: USUARIOS_A_CREAR.length,
          usuariosCreados: successCount,
          authUsersCreados: authCreatedCount,
        },
        results,
        message: `Migración completada. ${successCount} usuarios creados. Contraseña temporal: ${TEMP_PASSWORD}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en migración:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
