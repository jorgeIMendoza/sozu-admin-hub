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

// ID de la categoría "Paquete de muebles"
const CATEGORIA_MUEBLES_ID = 3;

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
      .select('id, numero_propiedad, numero_piso, m2_interiores, m2_exteriores, id_edificio_modelo, id_estatus_disponibilidad, id_entidad_relacionada_dueno, id_tipo_propiedad')
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
    const tipoPropiedadIds = [...new Set(propiedades?.map(p => p.id_tipo_propiedad).filter(Boolean) || [])];

    // 5. Fetch estatus_disponibilidad
    const { data: estatusDisponibilidad, error: estatusError } = await supabase
      .from('estatus_disponibilidad')
      .select('id, nombre')
      .in('id', estatusIds);

    if (estatusError) {
      console.error('Error fetching estatus_disponibilidad:', estatusError);
      throw estatusError;
    }

    // 5.1 Fetch tipos_propiedad
    let tiposPropiedad: any[] = [];
    if (tipoPropiedadIds.length > 0) {
      const { data: tiposPropiedadData, error: tiposError } = await supabase
        .from('tipos_propiedad')
        .select('id, nombre')
        .in('id', tipoPropiedadIds);

      if (tiposError) {
        console.error('Error fetching tipos_propiedad:', tiposError);
        throw tiposError;
      }
      tiposPropiedad = tiposPropiedadData || [];
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

    // 7. Fetch ofertas for the properties (propiedades) - include id_producto to distinguish main vs product offers
    const { data: ofertas, error: ofertasError } = await supabase
      .from('ofertas')
      .select('id, id_propiedad, id_producto')
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

    // 10. Fetch ofertas de productos (muebles) asociadas a las propiedades
    // Especificamos el FK explícito para evitar ambigüedad
    const { data: ofertasProductoMuebles, error: ofertasProductoError } = await supabase
      .from('ofertas')
      .select(`
        id,
        id_propiedad,
        id_producto,
        productos_servicios!fk_ofertas_producto!inner (
          id,
          id_categoria
        )
      `)
      .in('id_propiedad', propiedadIds)
      .not('id_producto', 'is', null)
      .eq('activo', true)
      .eq('productos_servicios.id_categoria', CATEGORIA_MUEBLES_ID);

    if (ofertasProductoError) {
      console.error('Error fetching ofertas productos muebles:', ofertasProductoError);
      // No throw, just log - continue without this data
    }

    // Create a Set of property IDs that have furniture
    const propiedadesConMuebles = new Set<number>();
    if (ofertasProductoMuebles) {
      for (const oferta of ofertasProductoMuebles) {
        if (oferta.id_propiedad) {
          // Verificar que tiene cuenta de cobranza activa
          const { data: cuentaProducto, error: cuentaProductoError } = await supabase
            .from('cuentas_cobranza')
            .select('id')
            .eq('id_oferta', oferta.id)
            .eq('activo', true)
            .limit(1);
          
          if (!cuentaProductoError && cuentaProducto && cuentaProducto.length > 0) {
            propiedadesConMuebles.add(oferta.id_propiedad);
          }
        }
      }
    }

    console.log(`[getPropiedadesPropietario] Properties with furniture: ${propiedadesConMuebles.size}`);

    // Collect all persona IDs (from compradores AND from entidades_relacionadas for owners)
    const personaIdsFromCompradores = compradores?.map(c => c.id_persona).filter(Boolean) || [];
    const personaIdsFromOwners = entidadesRelacionadas?.map(er => er.id_persona).filter(Boolean) || [];
    const allPersonaIds = [...new Set([...personaIdsFromCompradores, ...personaIdsFromOwners])];

    console.log(`[getPropiedadesPropietario] Fetching ${allPersonaIds.length} personas (compradores + owners)`);

    // 11. Fetch personas with specific fields
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
    const tipoPropiedadMap = new Map(tiposPropiedad?.map(t => [t.id, t]) || []);
    const entidadMap = new Map(entidadesRelacionadas?.map(er => [er.id, er]) || []);
    const personasMap = new Map(personas?.map(p => [p.id, p]) || []);

    // Create oferta -> propiedad mapping and oferta -> id_producto mapping
    const ofertaPropiedadMap = new Map(ofertas?.map(o => [o.id, o.id_propiedad]) || []);
    const ofertaProductoMap = new Map(ofertas?.map(o => [o.id, o.id_producto]) || []);
    
    // Create cuenta -> oferta mapping
    const cuentaOfertaMap = new Map(cuentasCobranza?.map(c => [c.id, c.id_oferta]) || []);

    // Group compradores by propiedad, deduplicating by id_persona
    // Prefer the main property account (id_producto IS NULL) over product accounts
    const compradoresByPropiedad = new Map<number, any[]>();
    for (const comp of compradores || []) {
      const ofertaId = cuentaOfertaMap.get(comp.id_cuenta_cobranza);
      if (ofertaId) {
        const propiedadId = ofertaPropiedadMap.get(ofertaId);
        if (propiedadId) {
          if (!compradoresByPropiedad.has(propiedadId)) {
            compradoresByPropiedad.set(propiedadId, []);
          }
          
          const existingCompradores = compradoresByPropiedad.get(propiedadId)!;
          const existingIndex = existingCompradores.findIndex(c => c.id_persona === comp.id_persona);
          
          if (existingIndex === -1) {
            // New persona - add it with oferta info
            existingCompradores.push({ ...comp, _ofertaId: ofertaId });
          } else {
            // Persona already exists - prefer the one from main property account (id_producto IS NULL)
            const currentIdProducto = ofertaProductoMap.get(ofertaId);
            const existingOfertaId = existingCompradores[existingIndex]._ofertaId;
            const existingIdProducto = ofertaProductoMap.get(existingOfertaId);
            
            // If current is main property (no product) and existing is product, replace
            if (currentIdProducto === null && existingIdProducto !== null) {
              existingCompradores[existingIndex] = { ...comp, _ofertaId: ofertaId };
            }
            // Otherwise keep existing (first main property wins, or first product if no main)
          }
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

      const tipoPropiedad = tipoPropiedadMap.get(prop.id_tipo_propiedad);

      return {
        id_propiedad: prop.id,
        nivel: prop.numero_piso,
        numero_propiedad: prop.numero_propiedad,
        id_tipo_propiedad: prop.id_tipo_propiedad || null,
        tipo_propiedad: tipoPropiedad?.nombre || null,
        estatus_propiedad: estatus?.nombre || null,
        m2_interiores: prop.m2_interiores,
        m2_exteriores: prop.m2_exteriores,
        id_modelo: modelo?.id || null,
        modelo: modelo?.nombre || null,
        compro_muebles: propiedadesConMuebles.has(prop.id),
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
