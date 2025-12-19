import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get id_proyecto from query params
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

    console.log(`[getDatosEdificio] Fetching data for proyecto: ${idProyecto}`);

    // Step 1: Get the project
    const { data: proyecto, error: proyectoError } = await supabase
      .from('proyectos')
      .select('*')
      .eq('id', idProyecto)
      .eq('activo', true)
      .maybeSingle();

    if (proyectoError) {
      console.error('[getDatosEdificio] Error fetching proyecto:', proyectoError);
      throw proyectoError;
    }

    if (!proyecto) {
      return new Response(JSON.stringify({ error: 'Proyecto not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Get all buildings for this project
    const { data: edificios, error: edificiosError } = await supabase
      .from('edificios')
      .select('*')
      .eq('id_proyecto', idProyecto)
      .eq('activo', true);

    if (edificiosError) {
      console.error('[getDatosEdificio] Error fetching edificios:', edificiosError);
      throw edificiosError;
    }

    // Step 3: For each building, get its models
    const edificiosConModelos = await Promise.all(
      (edificios || []).map(async (edificio) => {
        const { data: edificiosModelos, error: emError } = await supabase
          .from('edificios_modelos')
          .select('id_modelo')
          .eq('id_edificio', edificio.id)
          .eq('activo', true);

        if (emError) {
          console.error(`[getDatosEdificio] Error fetching edificios_modelos for edificio ${edificio.id}:`, emError);
          return { edificio, modelos: [] };
        }

        const modeloIds = edificiosModelos?.map(em => em.id_modelo).filter(id => id !== null) || [];

        if (modeloIds.length === 0) {
          return { edificio, modelos: [] };
        }

        const { data: modelos, error: modelosError } = await supabase
          .from('modelos')
          .select('*')
          .in('id', modeloIds)
          .eq('activo', true);

        if (modelosError) {
          console.error(`[getDatosEdificio] Error fetching modelos for edificio ${edificio.id}:`, modelosError);
          return { edificio, modelos: [] };
        }

        return { edificio, modelos: modelos || [] };
      })
    );

    const result = {
      data: {
        proyecto,
        edificios: edificiosConModelos
      }
    };

    console.log(`[getDatosEdificio] Found ${edificiosConModelos.length} edificios for proyecto ${idProyecto}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[getDatosEdificio] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
