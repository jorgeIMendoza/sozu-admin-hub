import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMP_PASSWORD = 'Temporal123!';
const ROL_INMOBILIARIA = 4;
const ROL_AGENTE_INMOBILIARIO = 3;

interface UserToCreate {
  email: string;
  nombre: string;
  rol: string;
  rol_id: number;
  tipo: 'inmobiliaria' | 'rep_legal' | 'rep_comercial';
  id_persona: number;
  id_inmobiliaria?: number;
}

interface CreationResult {
  email: string;
  nombre: string;
  tipo: string;
  success: boolean;
  message?: string;
  error?: string;
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

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // Default to dry_run = true for safety

    console.log(`Iniciando migración de usuarios faltantes (dry_run: ${dryRun})...`);

    const usersToCreate: UserToCreate[] = [];

    // 1. Get ALL active inmobiliarias
    console.log('Buscando todas las inmobiliarias activas...');
    const { data: allInmobiliarias, error: inmoError } = await supabaseAdmin
      .from('entidades_relacionadas')
      .select('id, id_persona')
      .eq('id_tipo_entidad', 5)
      .eq('activo', true);

    if (inmoError) {
      console.error('Error fetching inmobiliarias:', inmoError);
      throw inmoError;
    }

    const inmobiliariaPersonaIds = (allInmobiliarias || []).map(er => er.id_persona).filter(Boolean);
    console.log(`Total inmobiliarias activas: ${inmobiliariaPersonaIds.length}`);

    if (inmobiliariaPersonaIds.length === 0) {
      return new Response(
        JSON.stringify({
          dry_run: dryRun,
          users_to_create: [],
          total: 0,
          message: 'No hay inmobiliarias activas'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get personas data for all inmobiliarias
    const { data: inmobiliariaPersonas, error: personasError } = await supabaseAdmin
      .from('personas')
      .select('id, nombre_legal, email, id_entidad_relacionada_rep_leg, id_entidad_relacionada_rep_com')
      .in('id', inmobiliariaPersonaIds)
      .eq('activo', true);

    if (personasError) {
      console.error('Error fetching personas:', personasError);
      throw personasError;
    }

    console.log(`Personas de inmobiliarias encontradas: ${inmobiliariaPersonas?.length || 0}`);

    // Get ALL existing users with rol_id = 4 (by id_persona, not email)
    const { data: existingInmoUsers, error: usersError } = await supabaseAdmin
      .from('usuarios')
      .select('email, id_persona')
      .eq('rol_id', ROL_INMOBILIARIA)
      .eq('activo', true);

    if (usersError) {
      console.error('Error fetching existing users:', usersError);
    }

    // Create a Set of id_persona that already have users
    const existingInmoPersonaIds = new Set(
      (existingInmoUsers || [])
        .map(u => u.id_persona)
        .filter(Boolean)
    );

    console.log(`Usuarios Inmobiliaria existentes: ${existingInmoPersonaIds.size}`);

    // Find inmobiliarias without users
    let inmobiliariasWithoutUser = 0;
    for (const persona of inmobiliariaPersonas || []) {
      if (!existingInmoPersonaIds.has(persona.id)) {
        // This inmobiliaria doesn't have a user
        if (persona.email) {
          inmobiliariasWithoutUser++;
          usersToCreate.push({
            email: persona.email,
            nombre: persona.nombre_legal,
            rol: 'Inmobiliaria',
            rol_id: ROL_INMOBILIARIA,
            tipo: 'inmobiliaria',
            id_persona: persona.id
          });
        }
      }
    }

    console.log(`Inmobiliarias sin usuario (con email): ${inmobiliariasWithoutUser}`);

    // 2. Find Representatives without user
    console.log('Buscando representantes sin usuario...');
    
    // Collect all representative entidad_relacionada IDs
    const repLegIds: number[] = [];
    const repComIds: number[] = [];
    const repToInmoMap: Map<number, number> = new Map();

    for (const persona of inmobiliariaPersonas || []) {
      if (persona.id_entidad_relacionada_rep_leg) {
        repLegIds.push(persona.id_entidad_relacionada_rep_leg);
        repToInmoMap.set(persona.id_entidad_relacionada_rep_leg, persona.id);
      }
      if (persona.id_entidad_relacionada_rep_com) {
        repComIds.push(persona.id_entidad_relacionada_rep_com);
        repToInmoMap.set(persona.id_entidad_relacionada_rep_com, persona.id);
      }
    }

    const allRepIds = [...new Set([...repLegIds, ...repComIds])];
    console.log(`Total representantes referenciados: ${allRepIds.length}`);

    if (allRepIds.length > 0) {
      // Get persona data for all representatives
      const { data: repEntidades, error: repError } = await supabaseAdmin
        .from('entidades_relacionadas')
        .select('id, id_persona')
        .in('id', allRepIds);

      if (repError) {
        console.error('Error fetching rep entidades:', repError);
      }

      const repPersonaIds = (repEntidades || []).map(r => r.id_persona).filter(Boolean);
      
      if (repPersonaIds.length > 0) {
        // Get personas for representatives
        const { data: repPersonas, error: repPersonasError } = await supabaseAdmin
          .from('personas')
          .select('id, nombre_legal, email')
          .in('id', repPersonaIds)
          .eq('activo', true);

        if (repPersonasError) {
          console.error('Error fetching rep personas:', repPersonasError);
        }

        // Create map from entidad_relacionada.id to persona data
        const entidadToPersonaMap = new Map<number, any>();
        for (const er of repEntidades || []) {
          const persona = (repPersonas || []).find(p => p.id === er.id_persona);
          if (persona) {
            entidadToPersonaMap.set(er.id, persona);
          }
        }

        // Get existing users with rol_id = 3 (by id_persona)
        const { data: existingAgentUsers, error: agentUsersError } = await supabaseAdmin
          .from('usuarios')
          .select('email, id_persona')
          .eq('rol_id', ROL_AGENTE_INMOBILIARIO)
          .eq('activo', true);

        if (agentUsersError) {
          console.error('Error fetching agent users:', agentUsersError);
        }

        const existingAgentPersonaIds = new Set(
          (existingAgentUsers || [])
            .map(u => u.id_persona)
            .filter(Boolean)
        );

        console.log(`Usuarios Agente existentes: ${existingAgentPersonaIds.size}`);

        const processedPersonaIds = new Set<number>();

        // Check legal representatives
        for (const repLegId of repLegIds) {
          const persona = entidadToPersonaMap.get(repLegId);
          if (!persona || !persona.email) continue;
          if (existingAgentPersonaIds.has(persona.id)) continue;
          if (processedPersonaIds.has(persona.id)) continue;
          
          processedPersonaIds.add(persona.id);
          usersToCreate.push({
            email: persona.email,
            nombre: persona.nombre_legal,
            rol: 'Agente Inmobiliario',
            rol_id: ROL_AGENTE_INMOBILIARIO,
            tipo: 'rep_legal',
            id_persona: persona.id,
            id_inmobiliaria: repToInmoMap.get(repLegId)
          });
        }

        // Check commercial representatives
        for (const repComId of repComIds) {
          const persona = entidadToPersonaMap.get(repComId);
          if (!persona || !persona.email) continue;
          if (existingAgentPersonaIds.has(persona.id)) continue;
          if (processedPersonaIds.has(persona.id)) continue;
          
          processedPersonaIds.add(persona.id);
          usersToCreate.push({
            email: persona.email,
            nombre: persona.nombre_legal,
            rol: 'Agente Inmobiliario',
            rol_id: ROL_AGENTE_INMOBILIARIO,
            tipo: 'rep_comercial',
            id_persona: persona.id,
            id_inmobiliaria: repToInmoMap.get(repComId)
          });
        }
      }
    }

    console.log(`Total usuarios a crear: ${usersToCreate.length}`);

    // If dry_run, just return the list
    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          users_to_create: usersToCreate.map(u => ({
            email: u.email,
            nombre: u.nombre,
            rol: u.rol,
            tipo: u.tipo
          })),
          total: usersToCreate.length,
          message: usersToCreate.length > 0 
            ? 'Ejecuta con dry_run: false para crear los usuarios'
            : 'No hay usuarios faltantes'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute creation
    console.log('Ejecutando creación de usuarios...');
    
    // Get existing auth users for reuse
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUsersByEmail = new Map(
      existingAuthUsers?.users?.map(u => [u.email?.toLowerCase(), u]) || []
    );

    const results: CreationResult[] = [];
    let created = 0;
    let failed = 0;

    for (const user of usersToCreate) {
      console.log(`Procesando: ${user.nombre} (${user.email})`);

      try {
        let authUserId: string;
        let authCreated = false;

        // Check if auth user exists
        const existingAuth = authUsersByEmail.get(user.email.toLowerCase());

        if (existingAuth) {
          console.log(`  → Auth user existe: ${existingAuth.id}`);
          authUserId = existingAuth.id;
        } else {
          // Create auth user
          console.log(`  → Creando auth user...`);
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: user.email,
            password: TEMP_PASSWORD,
            email_confirm: true,
          });

          if (authError) {
            console.error(`  ✗ Error creando auth user:`, authError.message);
            results.push({
              email: user.email,
              nombre: user.nombre,
              tipo: user.tipo,
              success: false,
              error: `Error auth: ${authError.message}`
            });
            failed++;
            continue;
          }

          authUserId = authData.user!.id;
          authCreated = true;
          console.log(`  → Auth user creado: ${authUserId}`);
        }

        // Check if usuario already exists for this persona
        const { data: existingUsuario } = await supabaseAdmin
          .from('usuarios')
          .select('email')
          .eq('id_persona', user.id_persona)
          .eq('rol_id', user.rol_id)
          .eq('activo', true)
          .maybeSingle();

        if (existingUsuario) {
          console.log(`  → Usuario ya existe para esta persona, saltando`);
          results.push({
            email: user.email,
            nombre: user.nombre,
            tipo: user.tipo,
            success: false,
            error: 'Usuario ya existe para esta persona'
          });
          failed++;
          continue;
        }

        // Create usuario record
        console.log(`  → Creando registro en usuarios...`);
        const { error: usuarioError } = await supabaseAdmin
          .from('usuarios')
          .insert({
            email: user.email,
            nombre: user.nombre,
            rol_id: user.rol_id,
            id_persona: user.id_persona,
            auth_user_id: authUserId,
            debe_cambiar_password: true,
            activo: true,
          });

        if (usuarioError) {
          console.error(`  ✗ Error creando usuario:`, usuarioError.message);
          
          // If we just created the auth user, clean it up
          if (authCreated) {
            await supabaseAdmin.auth.admin.deleteUser(authUserId);
          }
          
          results.push({
            email: user.email,
            nombre: user.nombre,
            tipo: user.tipo,
            success: false,
            error: `Error usuario: ${usuarioError.message}`
          });
          failed++;
          continue;
        }

        console.log(`  ✓ Usuario creado exitosamente`);
        results.push({
          email: user.email,
          nombre: user.nombre,
          tipo: user.tipo,
          success: true,
          message: authCreated ? 'Usuario y auth creados' : 'Usuario creado (auth existente)'
        });
        created++;

      } catch (error) {
        console.error(`  ✗ Error inesperado:`, error);
        results.push({
          email: user.email,
          nombre: user.nombre,
          tipo: user.tipo,
          success: false,
          error: `Error: ${(error as Error).message}`
        });
        failed++;
      }
    }

    console.log(`Migración completada: ${created}/${usersToCreate.length} usuarios creados`);

    return new Response(
      JSON.stringify({
        dry_run: false,
        results,
        summary: {
          total: usersToCreate.length,
          created,
          failed
        },
        temp_password: TEMP_PASSWORD,
        message: `Migración completada. ${created} usuarios creados, ${failed} fallidos.`
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
