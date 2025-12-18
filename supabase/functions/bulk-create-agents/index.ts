import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentRow {
  nombre: string;
  telefono: string;
  email: string;
  inmobiliaria: string;
  proyecto: string;
}

interface ProcessResult {
  email: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
}

// Mapeo de inmobiliarias por nombre
const inmobiliariaMap: Record<string, number> = {
  'TRUST': 1874,
  'VIVALTA': 1876,
  'KRE': 1880,
  'INTERAMERICAN': 1882,
};

// Mapeo de proyectos por nombre
const proyectoMap: Record<string, number> = {
  'VIVE DAIKU': 1453,
  'DAIKU': 1453,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { agents } = await req.json() as { agents: AgentRow[] };

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se proporcionaron agentes para procesar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bulk-create-agents] Procesando ${agents.length} agentes`);

    const results: ProcessResult[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const agent of agents) {
      const email = agent.email?.trim().toLowerCase();
      const nombre = agent.nombre?.trim();
      const telefono = agent.telefono?.trim().replace(/\D/g, '');
      const inmobiliariaNombre = agent.inmobiliaria?.trim().toUpperCase();
      const proyectoNombre = agent.proyecto?.trim().toUpperCase();

      // Validaciones básicas
      if (!email || !nombre) {
        results.push({ email: email || 'N/A', status: 'error', message: 'Email o nombre faltante' });
        errors++;
        continue;
      }

      // Obtener id de inmobiliaria
      const inmobiliariaPersonaId = inmobiliariaMap[inmobiliariaNombre];
      if (!inmobiliariaPersonaId) {
        results.push({ email, status: 'error', message: `Inmobiliaria no reconocida: ${inmobiliariaNombre}` });
        errors++;
        continue;
      }

      // Obtener id de proyecto
      const proyectoId = proyectoMap[proyectoNombre] || proyectoMap['VIVE DAIKU'];
      if (!proyectoId) {
        results.push({ email, status: 'error', message: `Proyecto no reconocido: ${proyectoNombre}` });
        errors++;
        continue;
      }

      try {
        // 1. Verificar si la persona ya existe
        const { data: existingPersona } = await supabaseAdmin
          .from('personas')
          .select('id, nombre_legal')
          .eq('email', email)
          .eq('activo', true)
          .single();

        let personaId: number;
        let isNewPersona = false;

        if (existingPersona) {
          personaId = existingPersona.id;
          console.log(`[bulk-create-agents] Persona existente: ${email} (id: ${personaId})`);
        } else {
          // Crear nueva persona
          const { data: newPersona, error: personaError } = await supabaseAdmin
            .from('personas')
            .insert({
              tipo_persona: 'fisica',
              nombre_legal: nombre,
              email: email,
              telefono: telefono || null,
              clave_pais_telefono: '52',
              activo: true,
            })
            .select('id')
            .single();

          if (personaError) {
            throw new Error(`Error creando persona: ${personaError.message}`);
          }

          personaId = newPersona.id;
          isNewPersona = true;
          console.log(`[bulk-create-agents] Nueva persona creada: ${email} (id: ${personaId})`);
        }

        // 2. Verificar/crear entidad relacionada (Agente - tipo 19)
        const { data: existingEntidad } = await supabaseAdmin
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', personaId)
          .eq('id_tipo_entidad', 19)
          .eq('activo', true)
          .single();

        if (!existingEntidad) {
          const { error: entidadError } = await supabaseAdmin
            .from('entidades_relacionadas')
            .insert({
              id_persona: personaId,
              id_tipo_entidad: 19, // Agente
              id_persona_duena_lead: inmobiliariaPersonaId,
              activo: true,
            });

          if (entidadError) {
            console.error(`[bulk-create-agents] Error creando entidad: ${entidadError.message}`);
          } else {
            console.log(`[bulk-create-agents] Entidad relacionada creada para persona ${personaId}`);
          }
        }

        // 3. Verificar si ya existe usuario
        const { data: existingUsuario } = await supabaseAdmin
          .from('usuarios')
          .select('id, auth_user_id')
          .eq('email', email)
          .single();

        let authUserId: string | null = null;

        if (existingUsuario) {
          authUserId = existingUsuario.auth_user_id;
          console.log(`[bulk-create-agents] Usuario existente: ${email}`);
        } else {
          // 4. Crear auth user
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: 'Temporal123!',
            email_confirm: true,
          });

          if (authError) {
            // Si el usuario ya existe en auth, intentar obtenerlo
            if (authError.message.includes('already been registered')) {
              const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
              const existingAuth = existingAuthUsers?.users?.find(u => u.email === email);
              if (existingAuth) {
                authUserId = existingAuth.id;
              }
            } else {
              throw new Error(`Error creando auth user: ${authError.message}`);
            }
          } else {
            authUserId = authUser.user.id;
          }

          if (authUserId) {
            // 5. Crear registro en usuarios
            const { error: usuarioError } = await supabaseAdmin
              .from('usuarios')
              .insert({
                email: email,
                nombre: nombre,
                rol_id: 3, // Agente Inmobiliario
                id_persona: personaId,
                auth_user_id: authUserId,
                debe_cambiar_password: true,
                activo: true,
              });

            if (usuarioError) {
              console.error(`[bulk-create-agents] Error creando usuario: ${usuarioError.message}`);
            } else {
              console.log(`[bulk-create-agents] Usuario creado: ${email}`);
            }
          }
        }

        // 6. Crear acceso al proyecto
        const { data: existingAccess } = await supabaseAdmin
          .from('proyectos_acceso')
          .select('id')
          .eq('usuario_id', email)
          .eq('proyecto_id', proyectoId)
          .single();

        if (!existingAccess) {
          const { error: accessError } = await supabaseAdmin
            .from('proyectos_acceso')
            .insert({
              usuario_id: email,
              proyecto_id: proyectoId,
              activo: true,
            });

          if (accessError) {
            console.error(`[bulk-create-agents] Error asignando proyecto: ${accessError.message}`);
          } else {
            console.log(`[bulk-create-agents] Acceso a proyecto asignado: ${email} -> proyecto ${proyectoId}`);
          }
        }

        if (isNewPersona) {
          results.push({ email, status: 'created', message: 'Agente creado exitosamente' });
          created++;
        } else {
          results.push({ email, status: 'updated', message: 'Agente existente actualizado' });
          updated++;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error(`[bulk-create-agents] Error procesando ${email}: ${errorMessage}`);
        results.push({ email, status: 'error', message: errorMessage });
        errors++;
      }
    }

    const summary = {
      total: agents.length,
      created,
      updated,
      skipped,
      errors,
    };

    console.log(`[bulk-create-agents] Resumen: ${JSON.stringify(summary)}`);

    return new Response(
      JSON.stringify({ success: true, summary, details: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`[bulk-create-agents] Error general: ${errorMessage}`);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
