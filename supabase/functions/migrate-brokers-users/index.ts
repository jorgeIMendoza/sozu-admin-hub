import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMP_PASSWORD = 'Temporal123!';
const BATCH_SIZE = 50;

interface MigrationRequest {
  dry_run?: boolean;
  limit?: number;
  tipo?: 'inmobiliarias' | 'rep_legales' | 'rep_comerciales' | 'todos';
}

interface UserToCreate {
  email: string;
  personaId: number;
  nombre: string;
  rolId: number;
  idInmobiliaria: number | null;
  tipo: 'inmobiliaria' | 'rep_legal' | 'rep_comercial';
}

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

    // Parse request options
    let options: MigrationRequest = { dry_run: false, tipo: 'todos' };
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // No body or invalid JSON, use defaults
    }

    const { dry_run, limit, tipo } = options;

    console.log(`Iniciando migración dinámica (dry_run: ${dry_run}, limit: ${limit || 'sin límite'}, tipo: ${tipo})...`);

    // Get existing usuarios to check which ones already exist
    const { data: existingUsuarios } = await supabaseAdmin
      .from('usuarios')
      .select('email, rol_id');
    
    const existingEmailsByRole = new Map<string, Set<number>>();
    (existingUsuarios || []).forEach((u: any) => {
      const key = u.email.toLowerCase();
      if (!existingEmailsByRole.has(key)) {
        existingEmailsByRole.set(key, new Set());
      }
      existingEmailsByRole.get(key)!.add(u.rol_id);
    });

    const usersToCreate: UserToCreate[] = [];

    // 1. DETECT INMOBILIARIAS WITHOUT USER (rol_id = 4)
    if (tipo === 'inmobiliarias' || tipo === 'todos') {
      console.log('Buscando inmobiliarias sin usuario...');
      
      const { data: inmobiliariasData } = await supabaseAdmin
        .from('entidades_relacionadas')
        .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email)')
        .eq('id_tipo_entidad', 5) // Inmobiliaria
        .eq('activo', true);

      (inmobiliariasData || []).forEach((er: any) => {
        const persona = er.personas;
        if (persona?.email && persona?.id) {
          const emailLower = persona.email.toLowerCase();
          const existingRoles = existingEmailsByRole.get(emailLower);
          
          // Check if user with Inmobiliaria role (4) already exists
          if (!existingRoles || !existingRoles.has(4)) {
            usersToCreate.push({
              email: persona.email,
              personaId: persona.id,
              nombre: persona.nombre_legal || 'Sin nombre',
              rolId: 4,
              idInmobiliaria: null,
              tipo: 'inmobiliaria'
            });
          }
        }
      });
      
      console.log(`Inmobiliarias sin usuario encontradas: ${usersToCreate.filter(u => u.tipo === 'inmobiliaria').length}`);
    }

    // 2. DETECT REPRESENTANTES LEGALES WITHOUT USER (rol_id = 3)
    if (tipo === 'rep_legales' || tipo === 'todos') {
      console.log('Buscando representantes legales sin usuario...');
      
      // Get inmobiliarias with legal representatives
      const { data: inmobiliariasWithRepLeg } = await supabaseAdmin
        .from('personas')
        .select(`
          id,
          nombre_legal,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey(id_tipo_entidad, activo)
        `)
        .not('id_entidad_relacionada_rep_leg', 'is', null);

      // Filter to only active inmobiliarias
      const inmobiliariasActivas = (inmobiliariasWithRepLeg || []).filter((p: any) => 
        p.entidades_relacionadas?.some((er: any) => er.id_tipo_entidad === 5 && er.activo === true)
      );

      // Get rep legal details
      const repLegIds = inmobiliariasActivas.map((p: any) => p.id_entidad_relacionada_rep_leg).filter(Boolean);
      
      if (repLegIds.length > 0) {
        const { data: repLegEntidades } = await supabaseAdmin
          .from('entidades_relacionadas')
          .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email)')
          .in('id', repLegIds);

        const repLegMap = new Map((repLegEntidades || []).map((e: any) => [e.id, e]));

        inmobiliariasActivas.forEach((inmo: any) => {
          const repLegEntidad = repLegMap.get(inmo.id_entidad_relacionada_rep_leg);
          const persona = repLegEntidad?.personas;
          
          if (persona?.email && persona?.id) {
            const emailLower = persona.email.toLowerCase();
            const existingRoles = existingEmailsByRole.get(emailLower);
            
            // Check if user with Agente Inmobiliario role (3) already exists
            if (!existingRoles || !existingRoles.has(3)) {
              // Check if not already added
              if (!usersToCreate.some(u => u.email.toLowerCase() === emailLower && u.rolId === 3)) {
                usersToCreate.push({
                  email: persona.email,
                  personaId: persona.id,
                  nombre: persona.nombre_legal || 'Sin nombre',
                  rolId: 3,
                  idInmobiliaria: inmo.id,
                  tipo: 'rep_legal'
                });
              }
            }
          }
        });
      }
      
      console.log(`Representantes legales sin usuario encontrados: ${usersToCreate.filter(u => u.tipo === 'rep_legal').length}`);
    }

    // 3. DETECT REPRESENTANTES COMERCIALES WITHOUT USER (rol_id = 3)
    if (tipo === 'rep_comerciales' || tipo === 'todos') {
      console.log('Buscando representantes comerciales sin usuario...');
      
      // Get inmobiliarias with commercial representatives
      const { data: inmobiliariasWithRepCom } = await supabaseAdmin
        .from('personas')
        .select(`
          id,
          nombre_legal,
          id_entidad_relacionada_rep_com,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey(id_tipo_entidad, activo)
        `)
        .not('id_entidad_relacionada_rep_com', 'is', null);

      // Filter to only active inmobiliarias
      const inmobiliariasActivas = (inmobiliariasWithRepCom || []).filter((p: any) => 
        p.entidades_relacionadas?.some((er: any) => er.id_tipo_entidad === 5 && er.activo === true)
      );

      // Get rep comercial details
      const repComIds = inmobiliariasActivas.map((p: any) => p.id_entidad_relacionada_rep_com).filter(Boolean);
      
      if (repComIds.length > 0) {
        const { data: repComEntidades } = await supabaseAdmin
          .from('entidades_relacionadas')
          .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email)')
          .in('id', repComIds);

        const repComMap = new Map((repComEntidades || []).map((e: any) => [e.id, e]));

        inmobiliariasActivas.forEach((inmo: any) => {
          const repComEntidad = repComMap.get(inmo.id_entidad_relacionada_rep_com);
          const persona = repComEntidad?.personas;
          
          if (persona?.email && persona?.id) {
            const emailLower = persona.email.toLowerCase();
            const existingRoles = existingEmailsByRole.get(emailLower);
            
            // Check if user with Agente Inmobiliario role (3) already exists
            if (!existingRoles || !existingRoles.has(3)) {
              // Check if not already added
              if (!usersToCreate.some(u => u.email.toLowerCase() === emailLower && u.rolId === 3)) {
                usersToCreate.push({
                  email: persona.email,
                  personaId: persona.id,
                  nombre: persona.nombre_legal || 'Sin nombre',
                  rolId: 3,
                  idInmobiliaria: inmo.id,
                  tipo: 'rep_comercial'
                });
              }
            }
          }
        });
      }
      
      console.log(`Representantes comerciales sin usuario encontrados: ${usersToCreate.filter(u => u.tipo === 'rep_comercial').length}`);
    }

    // Apply limit if specified
    const usersToProcess = limit ? usersToCreate.slice(0, limit) : usersToCreate;

    // Summary counts
    const summary = {
      total_detectados: usersToCreate.length,
      inmobiliarias_sin_usuario: usersToCreate.filter(u => u.tipo === 'inmobiliaria').length,
      rep_legales_sin_usuario: usersToCreate.filter(u => u.tipo === 'rep_legal').length,
      rep_comerciales_sin_usuario: usersToCreate.filter(u => u.tipo === 'rep_comercial').length,
      a_procesar: usersToProcess.length,
      usuarios_creados: 0,
      auth_users_creados: 0,
      errores: 0,
    };

    // If dry_run, just return the preview
    if (dry_run) {
      console.log('Modo dry_run - solo retornando preview');
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          summary,
          usuarios_a_crear: usersToProcess.map(u => ({
            email: u.email,
            nombre: u.nombre,
            tipo: u.tipo,
            rol: u.rolId === 4 ? 'Inmobiliaria' : 'Agente Inmobiliario',
          })),
          message: `Se detectaron ${summary.total_detectados} usuarios faltantes. Use dry_run: false para ejecutar la migración.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing auth users for email lookup
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUsersByEmail = new Map(
      existingAuthUsers?.users?.map(u => [u.email?.toLowerCase(), u]) || []
    );

    const results: Array<{
      email: string;
      nombre: string;
      tipo: string;
      authCreated: boolean;
      usuarioCreated: boolean;
      error?: string;
    }> = [];

    // Process in batches
    for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
      const batch = usersToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Procesando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(usersToProcess.length / BATCH_SIZE)}...`);

      for (const usuario of batch) {
        console.log(`Procesando: ${usuario.nombre} (${usuario.email}) - ${usuario.tipo}`);

        try {
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
                tipo: usuario.tipo,
                authCreated: false,
                usuarioCreated: false,
                error: `Error auth: ${authError.message}`
              });
              summary.errores++;
              continue;
            }

            authUserId = authData.user!.id;
            authCreated = true;
            summary.auth_users_creados++;
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
              summary.auth_users_creados--;
            }
            
            results.push({
              email: usuario.email,
              nombre: usuario.nombre,
              tipo: usuario.tipo,
              authCreated: false,
              usuarioCreated: false,
              error: `Error usuario: ${usuarioError.message}`
            });
            summary.errores++;
            continue;
          }

          console.log(`  ✓ Usuario creado exitosamente`);
          summary.usuarios_creados++;

          // For agents (rol_id 3), handle inmobiliaria linking and project access
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
            tipo: usuario.tipo,
            authCreated,
            usuarioCreated: true,
          });

        } catch (error) {
          console.error(`  ✗ Error inesperado:`, error);
          results.push({
            email: usuario.email,
            nombre: usuario.nombre,
            tipo: usuario.tipo,
            authCreated: false,
            usuarioCreated: false,
            error: `Error: ${(error as Error).message}`
          });
          summary.errores++;
        }
      }
    }

    console.log(`Migración completada: ${summary.usuarios_creados}/${usersToProcess.length} usuarios creados`);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
        message: `Migración completada. ${summary.usuarios_creados} usuarios creados, ${summary.errores} errores. Contraseña temporal: ${TEMP_PASSWORD}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en migración:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
