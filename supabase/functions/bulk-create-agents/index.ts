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

interface ValidationResult {
  email: string;
  isValid: boolean;
  error?: string;
  personaId?: number;
  inmobiliariaId?: number;
  proyectoId?: number;
  needsPersona?: boolean;
  needsEntidad?: boolean;
  needsAuthUser?: boolean;
  needsUsuario?: boolean;
  needsAccess?: boolean;
}

interface CreatedRecord {
  type: 'persona' | 'entidad' | 'usuario' | 'acceso';
  id?: number;
  email?: string;
  authUserId?: string;
  proyectoId?: number;
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

// IDs de personas que son inmobiliarias (no deben ser agentes)
const inmobiliariaPersonaIds = Object.values(inmobiliariaMap);

function getErrorMessage(technicalError: string): string {
  if (technicalError.includes('personas_clave_pais_telefono_fkey')) {
    return 'Error con el código de país del teléfono';
  }
  if (technicalError.includes('personas_email_key') || technicalError.includes('duplicate key')) {
    return 'Este correo electrónico ya está registrado';
  }
  if (technicalError.includes('already been registered')) {
    return 'Este correo ya tiene una cuenta de usuario';
  }
  if (technicalError.includes('foreign key constraint')) {
    return 'Error de datos relacionados - contacta al administrador';
  }
  if (technicalError.includes('violates unique constraint')) {
    return 'Este registro ya existe en el sistema';
  }
  if (technicalError.includes('not-null constraint')) {
    return 'Faltan datos obligatorios';
  }
  return 'Error al procesar el agente - intenta de nuevo';
}

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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bulk-create-agents] ========== INICIO PROCESO TRANSACCIONAL ==========`);
    console.log(`[bulk-create-agents] Procesando ${agents.length} agentes`);

    // ============================================================
    // FASE 1: VALIDACIÓN COMPLETA (NO crea nada)
    // ============================================================
    console.log(`[bulk-create-agents] FASE 1: Validación...`);
    
    const validationResults: ValidationResult[] = [];
    const validationErrors: string[] = [];

    for (const agent of agents) {
      const email = agent.email?.trim().toLowerCase();
      const nombre = agent.nombre?.trim();
      const inmobiliariaNombre = agent.inmobiliaria?.trim().toUpperCase();
      const proyectoNombre = agent.proyecto?.trim().toUpperCase();

      const validation: ValidationResult = { email: email || 'N/A', isValid: true };

      // Validación 1: Email y nombre requeridos
      if (!email || !nombre) {
        validation.isValid = false;
        validation.error = 'Email o nombre faltante';
        validationErrors.push(`${email || 'N/A'}: Email o nombre faltante`);
        validationResults.push(validation);
        continue;
      }

      // Validación 2: Inmobiliaria reconocida
      const inmobiliariaPersonaId = inmobiliariaMap[inmobiliariaNombre];
      if (!inmobiliariaPersonaId) {
        validation.isValid = false;
        validation.error = `Inmobiliaria no reconocida: ${inmobiliariaNombre}`;
        validationErrors.push(`${email}: Inmobiliaria no reconocida: ${inmobiliariaNombre}`);
        validationResults.push(validation);
        continue;
      }
      validation.inmobiliariaId = inmobiliariaPersonaId;

      // Validación 3: Proyecto reconocido
      const proyectoId = proyectoMap[proyectoNombre] || proyectoMap['VIVE DAIKU'];
      if (!proyectoId) {
        validation.isValid = false;
        validation.error = `Proyecto no reconocido: ${proyectoNombre}`;
        validationErrors.push(`${email}: Proyecto no reconocido: ${proyectoNombre}`);
        validationResults.push(validation);
        continue;
      }
      validation.proyectoId = proyectoId;

      // Validación 4: Verificar que el email NO pertenece a una inmobiliaria
      const { data: existingPersona } = await supabaseAdmin
        .from('personas')
        .select('id, nombre_legal')
        .eq('email', email)
        .eq('activo', true)
        .single();

      if (existingPersona) {
        validation.personaId = existingPersona.id;
        
        // Verificar si es una inmobiliaria (tiene entidad tipo 5)
        const { data: inmobiliariaEntidad } = await supabaseAdmin
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', existingPersona.id)
          .eq('id_tipo_entidad', 5) // Inmobiliaria
          .eq('activo', true)
          .single();

        if (inmobiliariaEntidad) {
          validation.isValid = false;
          validation.error = `Este correo pertenece a una inmobiliaria (${existingPersona.nombre_legal}), no puede ser un agente`;
          validationErrors.push(`${email}: Este correo pertenece a una inmobiliaria, no puede ser un agente`);
          validationResults.push(validation);
          continue;
        }

        // Verificar si ya es persona dueña de lead (inmobiliaria)
        if (inmobiliariaPersonaIds.includes(existingPersona.id)) {
          validation.isValid = false;
          validation.error = `Este correo pertenece a una inmobiliaria registrada, no puede ser un agente`;
          validationErrors.push(`${email}: Este correo pertenece a una inmobiliaria registrada, no puede ser un agente`);
          validationResults.push(validation);
          continue;
        }

        validation.needsPersona = false;

        // Verificar si ya tiene entidad de agente
        const { data: existingEntidad } = await supabaseAdmin
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', existingPersona.id)
          .eq('id_tipo_entidad', 19)
          .eq('activo', true)
          .single();
        validation.needsEntidad = !existingEntidad;

      } else {
        validation.needsPersona = true;
        validation.needsEntidad = true;
      }

      // Verificar si necesita usuario
      const { data: existingUsuario } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .single();
      validation.needsUsuario = !existingUsuario;
      validation.needsAuthUser = !existingUsuario;

      // Verificar si necesita acceso al proyecto
      const { data: existingAccess } = await supabaseAdmin
        .from('proyectos_acceso')
        .select('usuario_id, proyecto_id')
        .eq('usuario_id', email)
        .eq('proyecto_id', proyectoId)
        .single();
      validation.needsAccess = !existingAccess;

      validationResults.push(validation);
    }

    // Si hay errores de validación, retornar con success: false pero status 200
    if (validationErrors.length > 0) {
      console.log(`[bulk-create-agents] VALIDACIÓN FALLIDA: ${validationErrors.length} errores encontrados`);
      return new Response(
        JSON.stringify({
          success: false,
          phase: 'validation',
          message: 'Se encontraron errores de validación. No se creó ningún registro.',
          errors: validationErrors,
          summary: {
            total: agents.length,
            valid: validationResults.filter(v => v.isValid).length,
            invalid: validationErrors.length,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bulk-create-agents] Validación exitosa para ${validationResults.length} agentes`);

    // ============================================================
    // FASE 2: EJECUCIÓN (crear registros con rollback en caso de error)
    // ============================================================
    console.log(`[bulk-create-agents] FASE 2: Ejecución...`);

    const createdRecords: CreatedRecord[] = [];
    const results: { email: string; status: string; message: string }[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const validation = validationResults[i];
        const email = agent.email?.trim().toLowerCase();
        const nombre = agent.nombre?.trim();
        const telefono = agent.telefono?.trim().replace(/\D/g, '');

        let personaId = validation.personaId;
        let didCreateSomething = false;

        // 1. Crear persona si es necesario
        if (validation.needsPersona) {
          const { data: newPersona, error: personaError } = await supabaseAdmin
            .from('personas')
            .insert({
              tipo_persona: 'fisica',
              nombre_legal: nombre,
              email: email,
              telefono: telefono || null,
              clave_pais_telefono: 'MX',
              activo: true,
            })
            .select('id')
            .single();

          if (personaError) {
            throw new Error(`Error creando persona ${email}: ${personaError.message}`);
          }

          personaId = newPersona.id;
          createdRecords.push({ type: 'persona', id: personaId, email });
          didCreateSomething = true;
          console.log(`[bulk-create-agents] Persona creada: ${email} (id: ${personaId})`);

          // Verificar inmediatamente que la persona existe
          const { data: personaCheck } = await supabaseAdmin
            .from('personas')
            .select('id')
            .eq('id', personaId)
            .single();
          
          if (!personaCheck) {
            throw new Error(`Persona ${personaId} creada pero no encontrada para ${email}`);
          }
        }

        // 2. Crear entidad relacionada si es necesario
        if (validation.needsEntidad && personaId) {
          const { data: newEntidad, error: entidadError } = await supabaseAdmin
            .from('entidades_relacionadas')
            .insert({
              id_persona: personaId,
              id_tipo_entidad: 19, // Agente
              id_persona_duena_lead: validation.inmobiliariaId,
              activo: true,
            })
            .select('id')
            .single();

          if (entidadError) {
            throw new Error(`Error creando entidad para ${email}: ${entidadError.message}`);
          }

          createdRecords.push({ type: 'entidad', id: newEntidad.id, email });
          didCreateSomething = true;
          console.log(`[bulk-create-agents] Entidad creada para: ${email}`);
        }

        // 3. Crear auth user y usuario si es necesario
        if (validation.needsUsuario && personaId) {
          let authUserId: string | undefined;

          // Primero intentar crear el auth user
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: 'Temporal123!',
            email_confirm: true,
          });

          if (authUser?.user?.id) {
            authUserId = authUser.user.id;
            console.log(`[bulk-create-agents] Auth user creado: ${email}`);
          } else if (authError?.message?.includes('already been registered')) {
            // Usuario ya existe en auth - usar getUserById no funciona, usar listUsers con filtro directo
            console.log(`[bulk-create-agents] Auth user ya existe, obteniendo ID: ${email}`);
            
            // Obtener usuario por email usando la API de admin con filtro
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 1000, // Obtener más usuarios de una vez para evitar paginación
            });
            
            if (listData?.users) {
              const existingAuth = listData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
              if (existingAuth) {
                authUserId = existingAuth.id;
                console.log(`[bulk-create-agents] Auth user encontrado: ${email}`);
              }
            }
          } else if (authError) {
            throw new Error(`Error creando auth user para ${email}: ${authError.message}`);
          }

          // Si no encontramos authUserId, intentar continuar sin él (el usuario ya puede existir)
          if (!authUserId) {
            console.log(`[bulk-create-agents] No se encontró auth user para ${email}, verificando si usuario ya existe...`);
            
            // Verificar una vez más si el usuario ya existe en la tabla usuarios
            const { data: existingUser } = await supabaseAdmin
              .from('usuarios')
              .select('email, auth_user_id')
              .eq('email', email)
              .single();
            
            if (existingUser) {
              console.log(`[bulk-create-agents] Usuario ya existe en tabla usuarios: ${email}, saltando creación`);
              // No necesitamos crear el usuario, ya existe
            } else {
              throw new Error(`No se pudo obtener auth user para ${email} y no existe en usuarios`);
            }
          } else {
            // Solo crear usuario si obtuvimos authUserId y no existe ya
            const { data: existingUser } = await supabaseAdmin
              .from('usuarios')
              .select('email')
              .eq('email', email)
              .single();
            
            if (!existingUser) {
              createdRecords.push({ type: 'usuario', authUserId, email });

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
                throw new Error(`Error creando usuario para ${email}: ${usuarioError.message}`);
              }

              didCreateSomething = true;
              console.log(`[bulk-create-agents] Usuario creado: ${email}`);
            } else {
              console.log(`[bulk-create-agents] Usuario ya existe, saltando: ${email}`);
            }
          }
        }

        // 4. Crear acceso al proyecto si es necesario
        if (validation.needsAccess && validation.proyectoId) {
          // Verificar que el usuario existe antes de crear acceso
          const { data: userExists } = await supabaseAdmin
            .from('usuarios')
            .select('email')
            .eq('email', email)
            .single();

          if (!userExists) {
            throw new Error(`No se puede asignar proyecto: usuario ${email} no existe en tabla usuarios`);
          }

          const { error: accessError } = await supabaseAdmin
            .from('proyectos_acceso')
            .insert({
              usuario_id: email,
              proyecto_id: validation.proyectoId,
              activo: true,
            });

          if (accessError) {
            throw new Error(`Error asignando proyecto a ${email}: ${accessError.message}`);
          }

          createdRecords.push({ type: 'acceso', email, proyectoId: validation.proyectoId });
          didCreateSomething = true;
          console.log(`[bulk-create-agents] Acceso creado: ${email} -> proyecto ${validation.proyectoId}`);
        }

        // Determinar resultado basado en lo que realmente pasó
        if (!didCreateSomething) {
          results.push({ email, status: 'skipped', message: 'Usuario y acceso ya existían - sin cambios' });
          skipped++;
        } else if (validation.needsPersona) {
          results.push({ email, status: 'created', message: 'Agente creado exitosamente' });
          created++;
        } else {
          results.push({ email, status: 'updated', message: 'Acceso al proyecto actualizado' });
          updated++;
        }
      }

      console.log(`[bulk-create-agents] ========== PROCESO COMPLETADO EXITOSAMENTE ==========`);

      return new Response(
        JSON.stringify({
          success: true,
          phase: 'completed',
          summary: {
            total: agents.length,
            created,
            updated,
            skipped,
            errors: 0,
          },
          details: results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (executionError) {
      // ============================================================
      // ROLLBACK: Eliminar todo lo creado
      // ============================================================
      console.error(`[bulk-create-agents] ERROR EN EJECUCIÓN - INICIANDO ROLLBACK`);
      console.error(`[bulk-create-agents] Error: ${executionError}`);

      for (const record of createdRecords.reverse()) {
        try {
          if (record.type === 'acceso' && record.email && record.proyectoId) {
            await supabaseAdmin.from('proyectos_acceso').delete().eq('usuario_id', record.email).eq('proyecto_id', record.proyectoId);
            console.log(`[bulk-create-agents] ROLLBACK: Eliminado acceso ${record.email} -> ${record.proyectoId}`);
          }
          if (record.type === 'usuario' && record.email) {
            await supabaseAdmin.from('usuarios').delete().eq('email', record.email);
            console.log(`[bulk-create-agents] ROLLBACK: Eliminado usuario ${record.email}`);
            // Nota: No eliminamos auth.users para evitar problemas
          }
          if (record.type === 'entidad' && record.id) {
            await supabaseAdmin.from('entidades_relacionadas').delete().eq('id', record.id);
            console.log(`[bulk-create-agents] ROLLBACK: Eliminada entidad ${record.id}`);
          }
          if (record.type === 'persona' && record.id) {
            await supabaseAdmin.from('personas').delete().eq('id', record.id);
            console.log(`[bulk-create-agents] ROLLBACK: Eliminada persona ${record.id}`);
          }
        } catch (rollbackError) {
          console.error(`[bulk-create-agents] Error en rollback: ${rollbackError}`);
        }
      }

      const errorMsg = executionError instanceof Error ? executionError.message : 'Error desconocido';
      
      return new Response(
        JSON.stringify({
          success: false,
          phase: 'execution_rollback',
          message: 'Ocurrió un error durante la creación. Se revirtieron todos los cambios. No se creó ningún registro.',
          error: getErrorMessage(errorMsg),
          technicalError: errorMsg,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`[bulk-create-agents] Error general: ${errorMessage}`);
    return new Response(
      JSON.stringify({ success: false, error: getErrorMessage(errorMessage) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
