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

    // Execute raw SQL query to get all the data
    const { data: rawData, error: queryError } = await supabase.rpc('get_propiedades_compradores', {
      p_id_proyecto: idProyecto
    });

    // If the RPC doesn't exist, we'll use multiple queries approach
    if (queryError && queryError.message.includes('function') && queryError.message.includes('does not exist')) {
      console.log('[getPropiedadesCompradores] Using multiple queries approach');
      
      // Get all cuentas_cobranza with their related data for this project
      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          id_oferta,
          ofertas!inner (
            id,
            id_propiedad,
            id_producto
          )
        `)
        .is('ofertas.id_producto', null);

      if (cuentasError) {
        console.error('[getPropiedadesCompradores] Error fetching cuentas:', cuentasError);
        throw cuentasError;
      }

      // Get property IDs from ofertas
      const propiedadIds = [...new Set(
        cuentasData?.map(c => (c.ofertas as any)?.id_propiedad).filter(id => id != null) || []
      )];

      if (propiedadIds.length === 0) {
        return new Response(JSON.stringify({ data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get propiedades with edificio_modelo -> edificio -> proyecto filter
      const { data: propiedades, error: propError } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_interiores,
          m2_exteriores,
          id_edificio_modelo,
          id_estatus_disponibilidad,
          edificios_modelos!inner (
            id,
            id_modelo,
            id_edificio,
            edificios!inner (
              id,
              id_proyecto
            ),
            modelos (
              id,
              nombre
            )
          ),
          estatus_disponibilidad (
            id,
            nombre
          )
        `)
        .in('id', propiedadIds)
        .eq('edificios_modelos.edificios.id_proyecto', idProyecto);

      if (propError) {
        console.error('[getPropiedadesCompradores] Error fetching propiedades:', propError);
        throw propError;
      }

      if (!propiedades || propiedades.length === 0) {
        return new Response(JSON.stringify({ data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get ofertas for these properties
      const { data: ofertas, error: ofertasError } = await supabase
        .from('ofertas')
        .select('id, id_propiedad')
        .in('id_propiedad', propiedades.map(p => p.id))
        .is('id_producto', null);

      if (ofertasError) {
        console.error('[getPropiedadesCompradores] Error fetching ofertas:', ofertasError);
        throw ofertasError;
      }

      const ofertaIds = ofertas?.map(o => o.id) || [];

      // Get cuentas_cobranza for these ofertas
      const { data: cuentas, error: cuentasErr } = await supabase
        .from('cuentas_cobranza')
        .select('id, id_oferta')
        .in('id_oferta', ofertaIds);

      if (cuentasErr) {
        console.error('[getPropiedadesCompradores] Error fetching cuentas:', cuentasErr);
        throw cuentasErr;
      }

      const cuentaIds = cuentas?.map(c => c.id) || [];

      // Get compradores for these cuentas
      const { data: compradores, error: compradoresError } = await supabase
        .from('compradores')
        .select(`
          id,
          id_cuenta_cobranza,
          id_persona,
          porcentaje_copropiedad,
          personas (*)
        `)
        .in('id_cuenta_cobranza', cuentaIds);

      if (compradoresError) {
        console.error('[getPropiedadesCompradores] Error fetching compradores:', compradoresError);
        throw compradoresError;
      }

      // Build the response structure
      const result = propiedades.map(prop => {
        const edificioModelo = prop.edificios_modelos as any;
        const modelo = edificioModelo?.modelos;
        const estatusDisp = prop.estatus_disponibilidad as any;

        // Find ofertas for this property
        const propOfertaIds = ofertas
          ?.filter(o => o.id_propiedad === prop.id)
          .map(o => o.id) || [];

        // Find cuentas for these ofertas
        const propCuentaIds = cuentas
          ?.filter(c => propOfertaIds.includes(c.id_oferta))
          .map(c => c.id) || [];

        // Find compradores for these cuentas
        const propCompradores = compradores
          ?.filter(c => propCuentaIds.includes(c.id_cuenta_cobranza))
          .map(c => ({
            porcentaje_copropiedad: c.porcentaje_copropiedad,
            ...(c.personas as any)
          })) || [];

        return {
          id_propiedad: prop.id,
          nivel: prop.numero_piso,
          numero_propiedad: prop.numero_propiedad,
          estatus_propiedad: estatusDisp?.nombre || null,
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
    }

    if (queryError) {
      console.error('[getPropiedadesCompradores] Error:', queryError);
      throw queryError;
    }

    return new Response(JSON.stringify({ data: rawData }), {
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
