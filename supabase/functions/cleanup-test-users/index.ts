import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify caller is Super Admin
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders });
    }
    const callerUserId = claimsData.claims.sub;
    const { data: callerUser } = await supabaseAdmin.from('usuarios').select('rol_id').eq('auth_user_id', callerUserId).single();
    if (!callerUser || callerUser.rol_id !== 1) {
      return new Response(JSON.stringify({ error: 'Solo Super Admin puede ejecutar esta función' }), { status: 403, headers: corsHeaders });
    }

    // Hardcoded list of users to delete
    const usersToDelete = [
      { email: 'jorge.externo@yopmail.com', authId: '7593b2c4-5fc6-4156-ad83-a52f2d07f041', nombre: 'Jorge Mendoza C' },
      { email: 'juanito.lechuga@yopmail.com', authId: '358a79a1-b7d5-4b7b-92cb-c42c31e332d2', nombre: 'Juanito Lechuga' },
      { email: 'otro.agente@yopmail.com', authId: '28195a55-3b7e-4f7b-98e7-d181667421ba', nombre: 'Otro Agente' },
      { email: 'paco.zanahorias@yopmail.com', authId: '8f8010e0-6ea6-4e6d-804d-f6ea0fe5db30', nombre: 'Paco Zanahorias' },
      { email: 'pakita@yopmail.com', authId: '02e77408-3208-46f2-841a-2eb2c5cafc22', nombre: 'Pakita Jitomates' },
      { email: 'richi.manzanas@yopmail.com', authId: 'e7bcd509-9e7d-44fa-9a86-4c9f956912f0', nombre: 'Ricardo Manzanas' },
      { email: 'inmo.prueba@yopmail.com', authId: '41fa5b38-e7b6-4870-892c-e321400b8aa4', nombre: 'Inmobiliaria Prueba' },
      { email: 'publik@yopmail.com', authId: '411f62f9-d111-4367-99fd-6b5418426a3e', nombre: 'Prueba Inmo Publik' },
      { email: 'segunda.test@yopmail.com', authId: 'd0e922f7-cd17-462a-bbbd-8a7de285ef94', nombre: 'Segunda inmo Test' },
      { email: 'tercera@yopmail.com', authId: 'bedfe0fd-8380-4fc1-bafb-874ca646eff2', nombre: 'tercera inmo Prueba' },
      { email: 'abel.ramon@yopmail.com', authId: 'e9b4409e-1ea4-41e5-9685-5dd21009185c', nombre: 'Test Abel Ramon' },
    ];

    const emails = usersToDelete.map(u => u.email);
    const entidadesIds = [3475, 3477, 3465, 3462, 3442, 3422, 3478, 3480, 3476, 3461, 3464, 3444, 3479];

    const results: Record<string, unknown> = {};

    // Step 1: Delete proyectos_acceso
    const { data: paDeleted, error: paError } = await supabaseAdmin
      .from('proyectos_acceso')
      .delete()
      .in('usuario_id', emails)
      .select('id');
    results.proyectos_acceso = { deleted: paDeleted?.length || 0, error: paError?.message || null };

    // Step 2: Delete entidades_relacionadas
    const { data: erDeleted, error: erError } = await supabaseAdmin
      .from('entidades_relacionadas')
      .delete()
      .in('id', entidadesIds)
      .select('id');
    results.entidades_relacionadas = { deleted: erDeleted?.length || 0, error: erError?.message || null };

    // Step 3: Delete usuarios
    const { data: usrDeleted, error: usrError } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .in('email', emails)
      .select('email');
    results.usuarios = { deleted: usrDeleted?.length || 0, error: usrError?.message || null };

    // Step 4: Delete auth.users
    const authResults: { email: string; success: boolean; error?: string }[] = [];
    for (const user of usersToDelete) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.authId);
      authResults.push({
        email: user.email,
        success: !authError,
        error: authError?.message,
      });
    }
    results.auth_users = authResults;

    const totalAuthDeleted = authResults.filter(r => r.success).length;

    return new Response(JSON.stringify({
      success: true,
      summary: {
        proyectos_acceso: results.proyectos_acceso,
        entidades_relacionadas: results.entidades_relacionadas,
        usuarios: results.usuarios,
        auth_users_deleted: totalAuthDeleted,
        auth_users_failed: authResults.filter(r => !r.success),
      },
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
