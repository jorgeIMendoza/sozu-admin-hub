import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InmobiliariaInput {
  razon_social: string;
  email: string;
  telefono: string;
  clave_pais_telefono: string;
}

interface RepresentanteLegalInput {
  nombre_legal: string;
  email: string;
  telefono: string;
  clave_pais_telefono: string;
  rfc?: string;
}

interface RequestBody {
  inmobiliaria: InmobiliariaInput;
  representante_legal: RepresentanteLegalInput;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    const { inmobiliaria, representante_legal } = body;

    console.log('Registro público de inmobiliaria:', {
      inmobiliaria: { ...inmobiliaria, email: inmobiliaria.email.substring(0, 5) + '***' },
      rep_legal: { ...representante_legal, email: representante_legal.email.substring(0, 5) + '***' }
    });

    // Validate required fields
    if (!inmobiliaria.razon_social || !inmobiliaria.email || !inmobiliaria.telefono) {
      return new Response(
        JSON.stringify({ success: false, message: 'Faltan campos requeridos de la inmobiliaria' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!representante_legal.nombre_legal || !representante_legal.email || !representante_legal.telefono) {
      return new Response(
        JSON.stringify({ success: false, message: 'Faltan campos requeridos del representante legal' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inmobiliaria.email) || !emailRegex.test(representante_legal.email)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Formato de email inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate phone (10 digits)
    if (inmobiliaria.telefono.length !== 10 || representante_legal.telefono.length !== 10) {
      return new Response(
        JSON.stringify({ success: false, message: 'El teléfono debe tener 10 dígitos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate that rep legal email is different from inmobiliaria email
    const inmobiliariaEmailLower = inmobiliaria.email.toLowerCase();
    const repLegalEmailLower = representante_legal.email.toLowerCase();

    if (inmobiliariaEmailLower === repLegalEmailLower) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'El email del representante legal no puede ser el mismo que el de la inmobiliaria' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if inmobiliaria email already exists in personas
    const { data: existingInmobEmail } = await supabase
      .from('personas')
      .select('id, nombre_legal')
      .ilike('email', inmobiliariaEmailLower)
      .eq('activo', true)
      .maybeSingle();

    if (existingInmobEmail) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `El email ${inmobiliaria.email} ya está registrado` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if rep legal email already exists in personas
    const { data: existingRepLegalEmail } = await supabase
      .from('personas')
      .select('id, nombre_legal')
      .ilike('email', repLegalEmailLower)
      .eq('activo', true)
      .maybeSingle();

    if (existingRepLegalEmail) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `El email del representante legal ${representante_legal.email} ya está registrado` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if email exists in usuarios
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('email')
      .ilike('email', inmobiliariaEmailLower)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `El email ${inmobiliaria.email} ya está registrado como usuario` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if representante legal email already exists in usuarios
    // repLegalEmailLower already declared above
    const { data: existingRepUser } = await supabase
      .from('usuarios')
      .select('email')
      .ilike('email', repLegalEmailLower)
      .maybeSingle();

    if (existingRepUser) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `El email del representante legal ${representante_legal.email} ya está registrado como usuario` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1. Create persona for Representante Legal (tipo_persona = 'pf')
    const { data: repLegalPersona, error: repLegalPersonaError } = await supabase
      .from('personas')
      .insert({
        nombre_legal: representante_legal.nombre_legal,
        email: repLegalEmailLower,
        telefono: representante_legal.telefono,
        clave_pais_telefono: representante_legal.clave_pais_telefono,
        rfc: representante_legal.rfc || null,
        tipo_persona: 'pf',
        activo: true,
        es_draft: true, // Mark as draft
      })
      .select()
      .single();

    if (repLegalPersonaError) {
      console.error('Error creating rep legal persona:', repLegalPersonaError);
      throw new Error(`Error al crear representante legal: ${repLegalPersonaError.message}`);
    }

    console.log('Rep legal persona created:', repLegalPersona.id);

    // 2. Create entidad_relacionada for Rep. Legal (id_tipo_entidad = 1)
    const { data: repLegalEntidad, error: repLegalEntidadError } = await supabase
      .from('entidades_relacionadas')
      .insert({
        id_persona: repLegalPersona.id,
        id_tipo_entidad: 1, // Representante Legal
        activo: true,
      })
      .select()
      .single();

    if (repLegalEntidadError) {
      console.error('Error creating rep legal entidad:', repLegalEntidadError);
      // Rollback - delete persona
      await supabase.from('personas').delete().eq('id', repLegalPersona.id);
      throw new Error(`Error al crear entidad del representante legal: ${repLegalEntidadError.message}`);
    }

    console.log('Rep legal entidad created:', repLegalEntidad.id);

    // 3. Create persona for Inmobiliaria (tipo_persona = 'pm', es_draft = true)
    const { data: inmobiliariaPersona, error: inmobiliariaPersonaError } = await supabase
      .from('personas')
      .insert({
        nombre_legal: inmobiliaria.razon_social,
        email: inmobiliariaEmailLower,
        telefono: inmobiliaria.telefono,
        clave_pais_telefono: inmobiliaria.clave_pais_telefono,
        tipo_persona: 'pm',
        activo: true,
        es_draft: true, // Mark as draft - needs admin approval
        id_entidad_relacionada_rep_leg: repLegalEntidad.id,
      })
      .select()
      .single();

    if (inmobiliariaPersonaError) {
      console.error('Error creating inmobiliaria persona:', inmobiliariaPersonaError);
      // Rollback
      await supabase.from('entidades_relacionadas').delete().eq('id', repLegalEntidad.id);
      await supabase.from('personas').delete().eq('id', repLegalPersona.id);
      throw new Error(`Error al crear inmobiliaria: ${inmobiliariaPersonaError.message}`);
    }

    console.log('Inmobiliaria persona created:', inmobiliariaPersona.id);

    // 4. Create entidad_relacionada for Inmobiliaria (id_tipo_entidad = 5)
    const { data: inmobiliariaEntidad, error: inmobiliariaEntidadError } = await supabase
      .from('entidades_relacionadas')
      .insert({
        id_persona: inmobiliariaPersona.id,
        id_tipo_entidad: 5, // Inmobiliaria
        activo: true,
      })
      .select()
      .single();

    if (inmobiliariaEntidadError) {
      console.error('Error creating inmobiliaria entidad:', inmobiliariaEntidadError);
      // Rollback
      await supabase.from('personas').delete().eq('id', inmobiliariaPersona.id);
      await supabase.from('entidades_relacionadas').delete().eq('id', repLegalEntidad.id);
      await supabase.from('personas').delete().eq('id', repLegalPersona.id);
      throw new Error(`Error al crear entidad de inmobiliaria: ${inmobiliariaEntidadError.message}`);
    }

    console.log('Inmobiliaria entidad created:', inmobiliariaEntidad.id);

    // Log the activity
    try {
      await supabase.from('logs_actividad').insert({
        tipo_accion: 'registro_publico',
        tipo_entidad: 'inmobiliaria',
        id_entidad: inmobiliariaPersona.id,
        valor_nuevo: JSON.stringify({
          inmobiliaria: { razon_social: inmobiliaria.razon_social, email: inmobiliariaEmailLower },
          representante_legal: { nombre: representante_legal.nombre_legal, email: repLegalEmailLower }
        }),
        descripcion: `Registro público de inmobiliaria: ${inmobiliaria.razon_social}`,
      });
    } catch (logError) {
      console.error('Error logging activity:', logError);
    }

    // Send notification to admins about the new draft inmobiliaria
    try {
      console.log('Sending draft inmobiliaria notification via enviar-notificacion edge function');

      // Get Super Admin users (rol_id = 1)
      const { data: superAdmins } = await supabase
        .from('usuarios')
        .select('email, telefono, clave_pais_telefono')
        .eq('rol_id', 1)
        .eq('activo', true);

      // Get Project Admin users (rol_id = 2)
      const { data: adminProyecto } = await supabase
        .from('usuarios')
        .select('email, telefono, clave_pais_telefono')
        .eq('rol_id', 2)
        .eq('activo', true);

      // Format super admin emails
      const correosSuperAdmin = (superAdmins || [])
        .map(u => u.email)
        .filter(Boolean)
        .join(',');

      // Format project admin emails
      const correosAdminProy = (adminProyecto || [])
        .map(u => u.email)
        .filter(Boolean)
        .join(',');

      // Get country phone codes from DB
      const { data: paises } = await supabase
        .from('paises')
        .select('id, clave_pais_telefono')
        .eq('activo', true);

      const codigosPorPais = new Map(
        (paises || []).map((p: { id: string; clave_pais_telefono: string | null }) => [p.id.trim(), p.clave_pais_telefono?.trim()])
      );

      // Helper to format phone numbers with country code from DB
      const formatearTelefonos = (usuarios: { telefono: string | null; clave_pais_telefono: string | null }[]) => {
        return (usuarios || [])
          .filter(u => u.telefono)
          .map(u => {
            const clavePais = (u.clave_pais_telefono || 'MX').trim();
            const codigoPais = codigosPorPais.get(clavePais) || '+52';
            return `${codigoPais}${u.telefono}`;
          })
          .join(',');
      };

      // Format project admin phones, with fallback to super admins
      const numerosAdminProy = formatearTelefonos(adminProyecto || []) || formatearTelefonos(superAdmins || []);

      const notificationPayload = {
        tipo: "ambos",
        from: "Notificaciones Sozu <notificaciones@sozu.com>",
        email: correosAdminProy || correosSuperAdmin,
        cc: correosSuperAdmin,
        telefono: numerosAdminProy,
        mensajeWA: `Se ha creado la Inmobiliaria *${inmobiliaria.razon_social}*, con el usuario: *${inmobiliariaEmailLower}* desde el formulario, revisa la pestaña de DRAFT para verificar.`,
        asunto: "Nueva Inmobiliaria (Pendiente de Aprobación)",
        mensaje: {
          nombre: 'Administrador',
          actividad: "Registro de inmobiliaria desde formulario público",
          detalles: `<tr><td class='label'>Nombre:</td> <td class='value'>${inmobiliaria.razon_social}</td> </tr><tr><td class='label'>Usuario:</td><td class='value'>${inmobiliariaEmailLower}</td></tr><tr><td class='label'>Estado:</td><td class='value'>Pendiente de aprobación (DRAFT)</td></tr>`
        },
        templateId: 41353048
      };

      console.log('Notification payload:', JSON.stringify(notificationPayload));

      const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify(notificationPayload)
      });

      if (!notificationResponse.ok) {
        console.error('Error sending draft inmobiliaria notification:', notificationResponse.status);
      } else {
        console.log('Draft inmobiliaria notification sent successfully');
      }
    } catch (notificationError) {
      console.error('Error sending draft inmobiliaria notification:', notificationError);
      // Don't throw error to avoid blocking the registration
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Inmobiliaria registrada correctamente. Pendiente de aprobación.',
        data: {
          inmobiliaria_id: inmobiliariaPersona.id,
          rep_legal_id: repLegalPersona.id,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in registro-inmobiliaria-publica:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Error interno del servidor' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
