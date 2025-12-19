import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const idProyectoParam = url.searchParams.get('id_proyecto');

    if (!idProyectoParam) {
      return new Response(JSON.stringify({ error: 'id_proyecto is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const idProyecto = parseInt(idProyectoParam, 10);
    if (isNaN(idProyecto)) {
      return new Response(JSON.stringify({ error: 'id_proyecto must be a valid integer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[getPropiedadesCompradores] Fetching data for proyecto: ${idProyecto}`);

    // Step 1: Get edificios for this project
    const { data: edificios, error: edificiosError } = await supabase
      .from('edificios')
      .select('id')
      .eq('id_proyecto', idProyecto)
      .eq('activo', true);

    if (edificiosError) {
      console.error('[getPropiedadesCompradores] Error fetching edificios:', edificiosError);
      throw edificiosError;
    }

    if (!edificios || edificios.length === 0) {
      console.log('[getPropiedadesCompradores] No edificios found for proyecto:', idProyecto);
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const edificioIds = edificios.map(e => e.id);

    // Step 2: Get edificios_modelos for these edificios
    const { data: edificiosModelos, error: emError } = await supabase
      .from('edificios_modelos')
      .select('id, id_edificio, id_modelo')
      .in('id_edificio', edificioIds)
      .eq('activo', true);

    if (emError) {
      console.error('[getPropiedadesCompradores] Error fetching edificios_modelos:', emError);
      throw emError;
    }

    if (!edificiosModelos || edificiosModelos.length === 0) {
      console.log('[getPropiedadesCompradores] No edificios_modelos found');
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emIds = edificiosModelos.map(em => em.id);
    const modeloIds = [...new Set(edificiosModelos.map(em => em.id_modelo).filter(id => id != null))];

    // Step 3: Get modelos
    const { data: modelos, error: modelosError } = await supabase
      .from('modelos')
      .select('id, nombre')
      .in('id', modeloIds)
      .eq('activo', true);

    if (modelosError) {
      console.error('[getPropiedadesCompradores] Error fetching modelos:', modelosError);
      throw modelosError;
    }

    const modelosMap = new Map((modelos || []).map(m => [m.id, m]));

    // Step 4: Get propiedades for these edificios_modelos
    const { data: propiedades, error: propError } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        numero_piso,
        m2_interiores,
        m2_exteriores,
        id_edificio_modelo,
        id_estatus_disponibilidad
      `)
      .in('id_edificio_modelo', emIds)
      .eq('activo', true);

    if (propError) {
      console.error('[getPropiedadesCompradores] Error fetching propiedades:', propError);
      throw propError;
    }

    if (!propiedades || propiedades.length === 0) {
      console.log('[getPropiedadesCompradores] No propiedades found');
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const propiedadIds = propiedades.map(p => p.id);
    const estatusIds = [...new Set(propiedades.map(p => p.id_estatus_disponibilidad).filter(id => id != null))];

    // Step 5: Get estatus_disponibilidad
    const { data: estatuses, error: estatusError } = await supabase
      .from('estatus_disponibilidad')
      .select('id, nombre')
      .in('id', estatusIds);

    if (estatusError) {
      console.error('[getPropiedadesCompradores] Error fetching estatus:', estatusError);
    }

    const estatusMap = new Map((estatuses || []).map(e => [e.id, e.nombre]));

    // Step 6: Get ofertas for these properties (where id_producto is null)
    const { data: ofertas, error: ofertasError } = await supabase
      .from('ofertas')
      .select('id, id_propiedad')
      .in('id_propiedad', propiedadIds)
      .is('id_producto', null)
      .eq('activo', true);

    if (ofertasError) {
      console.error('[getPropiedadesCompradores] Error fetching ofertas:', ofertasError);
      throw ofertasError;
    }

    if (!ofertas || ofertas.length === 0) {
      console.log('[getPropiedadesCompradores] No ofertas found');
      // Return propiedades with empty compradores
      const result = propiedades.map(prop => {
        const em = edificiosModelos.find(e => e.id === prop.id_edificio_modelo);
        const modelo = em ? modelosMap.get(em.id_modelo) : null;
        return {
          id_propiedad: prop.id,
          nivel: prop.numero_piso,
          numero_propiedad: prop.numero_propiedad,
          estatus_propiedad: estatusMap.get(prop.id_estatus_disponibilidad) || null,
          m2_interiores: prop.m2_interiores,
          m2_exteriores: prop.m2_exteriores,
          id_modelo: modelo?.id || null,
          modelo: modelo?.nombre || null,
          compradores: []
        };
      });
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ofertaIds = ofertas.map(o => o.id);

    // Step 7: Get cuentas_cobranza for these ofertas
    const { data: cuentas, error: cuentasError } = await supabase
      .from('cuentas_cobranza')
      .select('id, id_oferta')
      .in('id_oferta', ofertaIds)
      .eq('activo', true);

    if (cuentasError) {
      console.error('[getPropiedadesCompradores] Error fetching cuentas:', cuentasError);
      throw cuentasError;
    }

    const cuentaIds = (cuentas || []).map(c => c.id);

    // Step 8: Get compradores for these cuentas
    let compradores: any[] = [];
    if (cuentaIds.length > 0) {
      const { data: compradoresData, error: compradoresError } = await supabase
        .from('compradores')
        .select('id, id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      if (compradoresError) {
        console.error('[getPropiedadesCompradores] Error fetching compradores:', compradoresError);
        throw compradoresError;
      }
      compradores = compradoresData || [];
    }

    // Step 9: Get personas for these compradores
    const personaIds = [...new Set(compradores.map(c => c.id_persona).filter(id => id != null))];
    let personas: any[] = [];
    if (personaIds.length > 0) {
      const { data: personasData, error: personasError } = await supabase
        .from('personas')
        .select('*')
        .in('id', personaIds);

      if (personasError) {
        console.error('[getPropiedadesCompradores] Error fetching personas:', personasError);
        throw personasError;
      }
      personas = personasData || [];
    }

    const personasMap = new Map(personas.map(p => [p.id, p]));

    // Build the response structure
    const result = propiedades.map(prop => {
      const em = edificiosModelos.find(e => e.id === prop.id_edificio_modelo);
      const modelo = em ? modelosMap.get(em.id_modelo) : null;

      // Find ofertas for this property
      const propOfertaIds = ofertas
        .filter(o => o.id_propiedad === prop.id)
        .map(o => o.id);

      // Find cuentas for these ofertas
      const propCuentaIds = (cuentas || [])
        .filter(c => propOfertaIds.includes(c.id_oferta))
        .map(c => c.id);

      // Find compradores for these cuentas
      const propCompradores = compradores
        .filter(c => propCuentaIds.includes(c.id_cuenta_cobranza))
        .map(c => {
          const persona = personasMap.get(c.id_persona);
          return {
            porcentaje_copropiedad: c.porcentaje_copropiedad,
            ...persona
          };
        });

      return {
        id_propiedad: prop.id,
        nivel: prop.numero_piso,
        numero_propiedad: prop.numero_propiedad,
        estatus_propiedad: estatusMap.get(prop.id_estatus_disponibilidad) || null,
        m2_interiores: prop.m2_interiores,
        m2_exteriores: prop.m2_exteriores,
        id_modelo: modelo?.id || null,
        modelo: modelo?.nombre || null,
        compradores: propCompradores
      };
    });

    console.log(`[getPropiedadesCompradores] Found ${result.length} propiedades for proyecto ${idProyecto}`);

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[getPropiedadesCompradores] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
