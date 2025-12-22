import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Campos específicos a extraer de persona
const PERSONA_FIELDS = [
  'nombre_legal',
  'email',
  'telefono',
  'tipo_persona',
  'sexo',
  'fecha_nacimiento',
  'curp',
  'rfc',
  'direccion_fiscal_calle',
  'direccion_fiscal_num_ext',
  'direccion_fiscal_num_int',
  'direccion_fiscal_colonia',
  'direccion_fiscal_codigo_postal',
  'direccion_fiscal_id_municipio',
  'direccion_fiscal_id_estado',
  'direccion_fiscal_id_pais',
  'regimen',
  'uso_cfdi'
];

// Función helper para extraer solo los campos especificados
function extractPersonaFields(persona: any, porcentaje: number, tipo: 'comprador' | 'propietario') {
  if (!persona) return null;
  
  const result: any = { 
    tipo,
    porcentaje_copropiedad: porcentaje 
  };
  for (const field of PERSONA_FIELDS) {
    result[field] = persona[field] ?? null;
  }
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id_proyecto = url.searchParams.get('id_proyecto');

    if (!id_proyecto) {
      return new Response(
        JSON.stringify({ error: 'id_proyecto is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[getPropiedadesPropietario] Fetching data for project: ${id_proyecto}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch edificios for the project
    const { data: edificios, error: edificiosError } = await supabase
      .from('edificios')
      .select('id, nombre')
      .eq('id_proyecto', id_proyecto)
      .eq('activo', true);

    if (edificiosError) {
      console.error('Error fetching edificios:', edificiosError);
      throw edificiosError;
    }

    const edificioIds = edificios?.map(e => e.id) || [];
    console.log(`[getPropiedadesPropietario] Found ${edificioIds.length} edificios`);

    if (edificioIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch edificios_modelos
    const { data: edificiosModelos, error: emError } = await supabase
      .from('edificios_modelos')
      .select('id, id_edificio, id_modelo')
      .in('id_edificio', edificioIds)
      .eq('activo', true);

    if (emError) {
      console.error('Error fetching edificios_modelos:', emError);
      throw emError;
    }

    const modeloIds = [...new Set(edificiosModelos?.map(em => em.id_modelo) || [])];
    const edificioModeloIds = edificiosModelos?.map(em => em.id) || [];

    // 3. Fetch modelos
    const { data: modelos, error: modelosError } = await supabase
      .from('modelos')
      .select('id, nombre')
      .in('id', modeloIds)
      .eq('activo', true);

    if (modelosError) {
      console.error('Error fetching modelos:', modelosError);
      throw modelosError;
    }

    // 4. Fetch propiedades
    const { data: propiedades, error: propiedadesError } = await supabase
      .from('propiedades')
      .select('id, numero_propiedad, numero_piso, m2_interiores, m2_exteriores, id_edificio_modelo, id_estatus_disponibilidad, id_entidad_relacionada_dueno')
      .in('id_edificio_modelo', edificioModeloIds)
      .eq('activo', true);

    if (propiedadesError) {
      console.error('Error fetching propiedades:', propiedadesError);
      throw propiedadesError;
    }

    console.log(`[getPropiedadesPropietario] Found ${propiedades?.length || 0} propiedades`);

    const propiedadIds = propiedades?.map(p => p.id) || [];
    const estatusIds = [...new Set(propiedades?.map(p => p.id_estatus_disponibilidad).filter(Boolean) || [])];
    const entidadDuenoIds = [...new Set(propiedades?.map(p => p.id_entidad_relacionada_dueno).filter(Boolean) || [])];

    // 5. Fetch estatus_disponibilidad
    const { data: estatusDisponibilidad, error: estatusError } = await supabase
      .from('estatus_disponibilidad')
      .select('id, nombre')
      .in('id', estatusIds);

    if (estatusError) {
      console.error('Error fetching estatus_disponibilidad:', estatusError);
      throw estatusError;
    }

    // 6. Fetch entidades_relacionadas for owners
    const { data: entidadesRelacionadas, error: entidadesError } = await supabase
      .from('entidades_relacionadas')
      .select('id, id_persona')
      .in('id', entidadDuenoIds)
      .eq('activo', true);

    if (entidadesError) {
      console.error('Error fetching entidades_relacionadas:', entidadesError);
      throw entidadesError;
    }

    // 7. Fetch ofertas for the properties
    const { data: ofertas, error: ofertasError } = await supabase
      .from('ofertas')
      .select('id, id_propiedad')
      .in('id_propiedad', propiedadIds)
      .eq('activo', true);

    if (ofertasError) {
      console.error('Error fetching ofertas:', ofertasError);
      throw ofertasError;
    }

    const ofertaIds = ofertas?.map(o => o.id) || [];

    // 8. Fetch cuentas_cobranza
    const { data: cuentasCobranza, error: cuentasError } = await supabase
      .from('cuentas_cobranza')
      .select('id, id_oferta')
      .in('id_oferta', ofertaIds)
      .eq('activo', true);

    if (cuentasError) {
      console.error('Error fetching cuentas_cobranza:', cuentasError);
      throw cuentasError;
    }

    const cuentaIds = cuentasCobranza?.map(c => c.id) || [];

    // 9. Fetch compradores
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select('id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
      .in('id_cuenta_cobranza', cuentaIds)
      .eq('activo', true);

    if (compradoresError) {
      console.error('Error fetching compradores:', compradoresError);
      throw compradoresError;
    }

    // Collect all persona IDs (from compradores AND from entidades_relacionadas for owners)
    const personaIdsFromCompradores = compradores?.map(c => c.id_persona).filter(Boolean) || [];
    const personaIdsFromOwners = entidadesRelacionadas?.map(er => er.id_persona).filter(Boolean) || [];
    const allPersonaIds = [...new Set([...personaIdsFromCompradores, ...personaIdsFromOwners])];

    console.log(`[getPropiedadesPropietario] Fetching ${allPersonaIds.length} personas (compradores + owners)`);

    // 10. Fetch personas with specific fields
    let personas: any[] = [];
    if (allPersonaIds.length > 0) {
      const { data: personasData, error: personasError } = await supabase
        .from('personas')
        .select(PERSONA_FIELDS.join(', ') + ', id')
        .in('id', allPersonaIds)
        .eq('activo', true);

      if (personasError) {
        console.error('Error fetching personas:', personasError);
        throw personasError;
      }
      personas = personasData || [];
    }

    // Create lookup maps
    const edificioModeloMap = new Map(edificiosModelos?.map(em => [em.id, em]) || []);
    const modeloMap = new Map(modelos?.map(m => [m.id, m]) || []);
    const estatusMap = new Map(estatusDisponibilidad?.map(e => [e.id, e]) || []);
    const entidadMap = new Map(entidadesRelacionadas?.map(er => [er.id, er]) || []);
    const personasMap = new Map(personas?.map(p => [p.id, p]) || []);

    // Create oferta -> propiedad mapping
    const ofertaPropiedadMap = new Map(ofertas?.map(o => [o.id, o.id_propiedad]) || []);
    
    // Create cuenta -> oferta mapping
    const cuentaOfertaMap = new Map(cuentasCobranza?.map(c => [c.id, c.id_oferta]) || []);

    // Group compradores by propiedad
    const compradoresByPropiedad = new Map<number, any[]>();
    for (const comp of compradores || []) {
      const ofertaId = cuentaOfertaMap.get(comp.id_cuenta_cobranza);
      if (ofertaId) {
        const propiedadId = ofertaPropiedadMap.get(ofertaId);
        if (propiedadId) {
          if (!compradoresByPropiedad.has(propiedadId)) {
            compradoresByPropiedad.set(propiedadId, []);
          }
          compradoresByPropiedad.get(propiedadId)!.push(comp);
        }
      }
    }

    // Build the response
    const result = propiedades?.map(prop => {
      const edificioModelo = edificioModeloMap.get(prop.id_edificio_modelo);
      const modelo = edificioModelo ? modeloMap.get(edificioModelo.id_modelo) : null;
      const estatus = estatusMap.get(prop.id_estatus_disponibilidad);

      // Get compradores for this property
      const propCompradores = compradoresByPropiedad.get(prop.id) || [];
      
      let finalCompradoresPropietarios: any[] = [];

      if (propCompradores.length > 0) {
        // Property has buyers - use them with tipo: "comprador"
        finalCompradoresPropietarios = propCompradores
          .map(c => {
            const persona = personasMap.get(c.id_persona);
            return extractPersonaFields(persona, c.porcentaje_copropiedad, 'comprador');
          })
          .filter(Boolean);
      } else {
        // No buyers - fallback to owner via id_entidad_relacionada_dueno with tipo: "propietario"
        if (prop.id_entidad_relacionada_dueno) {
          const entidad = entidadMap.get(prop.id_entidad_relacionada_dueno);
          if (entidad && entidad.id_persona) {
            const ownerPersona = personasMap.get(entidad.id_persona);
            if (ownerPersona) {
              finalCompradoresPropietarios = [extractPersonaFields(ownerPersona, 100, 'propietario')];
            }
          }
        }
      }

      return {
        id_propiedad: prop.id,
        nivel: prop.numero_piso,
        numero_propiedad: prop.numero_propiedad,
        estatus_propiedad: estatus?.nombre || null,
        m2_interiores: prop.m2_interiores,
        m2_exteriores: prop.m2_exteriores,
        id_modelo: modelo?.id || null,
        modelo: modelo?.nombre || null,
        compradores_propietarios: finalCompradoresPropietarios
      };
    }) || [];

    console.log(`[getPropiedadesPropietario] Returning ${result.length} properties`);

    return new Response(
      JSON.stringify({ data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[getPropiedadesPropietario] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
