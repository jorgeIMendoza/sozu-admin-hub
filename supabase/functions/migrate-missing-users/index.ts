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

    // 1. Find Inmobiliarias without user
    console.log('Buscando inmobiliarias sin usuario...');
    const { data: inmobiliariasWithoutUser, error: inmoError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        SELECT p.id, p.nombre_legal, p.email
        FROM personas p
        JOIN entidades_relacionadas er ON er.id_persona = p.id
        WHERE er.id_tipo_entidad = 5
          AND er.activo = true
          AND p.activo = true
          AND p.email IS NOT NULL
          AND p.email != ''
          AND NOT EXISTS (
            SELECT 1 FROM usuarios u 
            WHERE u.email = p.email 
              AND u.rol_id = 4 
              AND u.activo = true
          )
      `
    });

    // If RPC doesn't exist, use direct query approach
    let inmobiliariasData: any[] = [];
    if (inmoError) {
      console.log('RPC no disponible, usando consulta directa...');
      
      // Get all active inmobiliarias
      const { data: allInmobiliarias } = await supabaseAdmin
        .from('entidades_relacionadas')
        .select('id_persona, personas!inner(id, nombre_legal, email, activo)')
        .eq('id_tipo_entidad', 5)
        .eq('activo', true);

      // Get all existing users with rol_id = 4
      const { data: existingInmoUsers } = await supabaseAdmin
        .from('usuarios')
        .select('email')
        .eq('rol_id', ROL_INMOBILIARIA)
        .eq('activo', true);

      const existingEmails = new Set((existingInmoUsers || []).map(u => u.email?.toLowerCase()));

      inmobiliariasData = (allInmobiliarias || [])
        .filter(er => {
          const persona = er.personas as any;
          return persona?.activo && 
                 persona?.email && 
                 !existingEmails.has(persona.email.toLowerCase());
        })
        .map(er => ({
          id: (er.personas as any).id,
          nombre_legal: (er.personas as any).nombre_legal,
          email: (er.personas as any).email
        }));
    } else {
      inmobiliariasData = inmobiliariasWithoutUser || [];
    }

    console.log(`Encontradas ${inmobiliariasData.length} inmobiliarias sin usuario`);

    for (const inmo of inmobiliariasData) {
      usersToCreate.push({
        email: inmo.email,
        nombre: inmo.nombre_legal,
        rol: 'Inmobiliaria',
        rol_id: ROL_INMOBILIARIA,
        tipo: 'inmobiliaria',
        id_persona: inmo.id
      });
    }

    // 2. Find Representatives without user
    console.log('Buscando representantes sin usuario...');
    
    // Get all active inmobiliarias with their representatives
    const { data: inmobiliariasWithReps } = await supabaseAdmin
      .from('personas')
      .select(`
        id,
        nombre_legal,
        id_entidad_relacionada_rep_leg,
        id_entidad_relacionada_rep_com,
        entidades_relacionadas!inner(id_tipo_entidad, activo)
      `)
      .eq('activo', true);

    // Filter to only inmobiliarias (type 5)
    const activeInmobiliarias = (inmobiliariasWithReps || []).filter(p => {
      const er = p.entidades_relacionadas as any;
      return Array.isArray(er) 
        ? er.some((e: any) => e.id_tipo_entidad === 5 && e.activo)
        : (er?.id_tipo_entidad === 5 && er?.activo);
    });

    // Collect all representative entidad_relacionada IDs
    const repIds: number[] = [];
    const repToInmoMap: Map<number, number> = new Map();

    for (const inmo of activeInmobiliarias) {
      if (inmo.id_entidad_relacionada_rep_leg) {
        repIds.push(inmo.id_entidad_relacionada_rep_leg);
        repToInmoMap.set(inmo.id_entidad_relacionada_rep_leg, inmo.id);
      }
      if (inmo.id_entidad_relacionada_rep_com) {
        repIds.push(inmo.id_entidad_relacionada_rep_com);
        repToInmoMap.set(inmo.id_entidad_relacionada_rep_com, inmo.id);
      }
    }

    if (repIds.length > 0) {
      // Get persona data for all representatives
      const { data: repEntidades } = await supabaseAdmin
        .from('entidades_relacionadas')
        .select('id, id_persona, personas!inner(id, nombre_legal, email, activo)')
        .in('id', repIds);

      // Get existing users with rol_id = 3
      const { data: existingAgentUsers } = await supabaseAdmin
        .from('usuarios')
        .select('email')
        .eq('rol_id', ROL_AGENTE_INMOBILIARIO)
        .eq('activo', true);

      const existingAgentEmails = new Set((existingAgentUsers || []).map(u => u.email?.toLowerCase()));

      const processedEmails = new Set<string>();

      for (const rep of repEntidades || []) {
        const persona = rep.personas as any;
        if (!persona?.activo || !persona?.email) continue;
        
        const emailLower = persona.email.toLowerCase();
        if (existingAgentEmails.has(emailLower) || processedEmails.has(emailLower)) continue;
        
        processedEmails.add(emailLower);

        // Determine if this is rep_legal or rep_comercial
        let tipo: 'rep_legal' | 'rep_comercial' = 'rep_legal';
        for (const inmo of activeInmobiliarias) {
          if (inmo.id_entidad_relacionada_rep_com === rep.id) {
            tipo = 'rep_comercial';
            break;
          }
        }

        usersToCreate.push({
          email: persona.email,
          nombre: persona.nombre_legal,
          rol: 'Agente Inmobiliario',
          rol_id: ROL_AGENTE_INMOBILIARIO,
          tipo,
          id_persona: persona.id,
          id_inmobiliaria: repToInmoMap.get(rep.id)
        });
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
          message: 'Ejecuta con dry_run: false para crear los usuarios'
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
