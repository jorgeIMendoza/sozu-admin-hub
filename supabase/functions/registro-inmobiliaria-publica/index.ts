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

    // Check if inmobiliaria email already exists
    const inmobiliariaEmailLower = inmobiliaria.email.toLowerCase();
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
    const repLegalEmailLower = representante_legal.email.toLowerCase();
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
