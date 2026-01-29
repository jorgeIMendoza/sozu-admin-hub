import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Inmobiliarias a migrar (excluyendo Sozu que ya es Super Admin)
const INMOBILIARIAS_TO_MIGRATE = [
  { email: 'dac@gmail.com', personaId: 2265, nombre: 'DAC' },
  { email: 'atencion@interamerican.com.mx', personaId: 1882, nombre: 'INTERAMERICAN' },
  { email: 'contacto@krinmobiliaria.com', personaId: 1880, nombre: 'KRE' },
  { email: 'bb@trustreal.mx', personaId: 1874, nombre: 'TRUST' },
  { email: 'contacto@vivaltainmobiliaria.com', personaId: 1876, nombre: 'VIVALTA' },
];

const TEMP_PASSWORD = 'Temporal123!';
const ROL_INMOBILIARIA = 4;

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

    console.log('Iniciando migración de usuarios inmobiliaria...');

    // Get existing auth users
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUsersByEmail = new Map(
      existingAuthUsers?.users?.map(u => [u.email, u]) || []
    );

    const results: Array<{
      email: string;
      nombre: string;
      authCreated: boolean;
      usuarioCreated: boolean;
      error?: string;
    }> = [];

    for (const inmo of INMOBILIARIAS_TO_MIGRATE) {
      console.log(`Procesando: ${inmo.nombre} (${inmo.email})`);

      try {
        // Check if usuario already exists
        const { data: existingUsuario } = await supabaseAdmin
          .from('usuarios')
          .select('id')
          .eq('email', inmo.email)
          .eq('rol_id', ROL_INMOBILIARIA)
          .maybeSingle();

        if (existingUsuario) {
          console.log(`  → Usuario ya existe, saltando`);
          results.push({
            email: inmo.email,
            nombre: inmo.nombre,
            authCreated: false,
            usuarioCreated: false,
            error: 'Usuario ya existe con rol Inmobiliaria'
          });
          continue;
        }

        let authUserId: string;
        let authCreated = false;

        // Check if auth user exists
        const existingAuth = authUsersByEmail.get(inmo.email);

        if (existingAuth) {
          console.log(`  → Auth user existe: ${existingAuth.id}`);
          authUserId = existingAuth.id;
        } else {
          // Create auth user
          console.log(`  → Creando auth user...`);
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: inmo.email,
            password: TEMP_PASSWORD,
            email_confirm: true,
          });

          if (authError) {
            console.error(`  ✗ Error creando auth user:`, authError.message);
            results.push({
              email: inmo.email,
              nombre: inmo.nombre,
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

        // Get persona name
        const { data: personaData } = await supabaseAdmin
          .from('personas')
          .select('nombre_legal')
          .eq('id', inmo.personaId)
          .single();

        const nombreUsuario = personaData?.nombre_legal || inmo.nombre;

        // Create usuario record
        console.log(`  → Creando registro en usuarios...`);
        const { error: usuarioError } = await supabaseAdmin
          .from('usuarios')
          .insert({
            email: inmo.email,
            nombre: nombreUsuario,
            rol_id: ROL_INMOBILIARIA,
            id_persona: inmo.personaId,
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
            email: inmo.email,
            nombre: inmo.nombre,
            authCreated: false,
            usuarioCreated: false,
            error: `Error usuario: ${usuarioError.message}`
          });
          continue;
        }

        console.log(`  ✓ Usuario creado exitosamente`);
        results.push({
          email: inmo.email,
          nombre: inmo.nombre,
          authCreated,
          usuarioCreated: true,
        });

      } catch (error) {
        console.error(`  ✗ Error inesperado:`, error);
        results.push({
          email: inmo.email,
          nombre: inmo.nombre,
          authCreated: false,
          usuarioCreated: false,
          error: `Error: ${error.message}`
        });
      }
    }

    const successCount = results.filter(r => r.usuarioCreated).length;
    const authCreatedCount = results.filter(r => r.authCreated).length;

    console.log(`Migración completada: ${successCount}/${INMOBILIARIAS_TO_MIGRATE.length} usuarios creados`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: INMOBILIARIAS_TO_MIGRATE.length,
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
