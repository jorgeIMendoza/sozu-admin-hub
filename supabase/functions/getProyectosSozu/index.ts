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

    // Get id_proyecto from query params or body
    let idProyecto: number | null = null;
    
    // Check query params first
    const url = new URL(req.url);
    const idProyectoParam = url.searchParams.get('id_proyecto');
    if (idProyectoParam) {
      idProyecto = parseInt(idProyectoParam, 10);
    }
    
    // If not in query params, check body (for POST requests)
    if (!idProyecto && req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.id_proyecto) {
          idProyecto = parseInt(body.id_proyecto, 10);
        }
      } catch {
        // Body might be empty or not JSON
      }
    }

    console.log('[getProyectosSozu] id_proyecto:', idProyecto);

    // Step 1: Get project IDs from entidades_relacionadas where id_tipo_entidad = 5
    const { data: entidades, error: entidadesError } = await supabase
      .from('entidades_relacionadas')
      .select('id_proyecto')
      .eq('id_tipo_entidad', 5)
      .eq('activo', true);

    if (entidadesError) {
      console.error('[getProyectosSozu] Error fetching entidades:', entidadesError);
      throw entidadesError;
    }

    // Get unique project IDs, filtering out nulls
    let proyectoIds = [...new Set(
      entidades?.map(e => e.id_proyecto).filter(id => id !== null && id !== undefined) || []
    )];

    // If id_proyecto is provided, filter to only include that project if it's in the list
    if (idProyecto) {
      if (proyectoIds.includes(idProyecto)) {
        proyectoIds = [idProyecto];
      } else {
        console.log('[getProyectosSozu] id_proyecto not found in Sozu projects');
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (proyectoIds.length === 0) {
      console.log('[getProyectosSozu] No proyectos found with id_tipo_entidad = 5');
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Get proyectos that match the criteria
    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select('id, nombre, direccion, fecha_entrega')
      .eq('activo', true)
      .eq('id_estatus_proyecto', 13)
      .in('id', proyectoIds);

    if (error) {
      console.error('[getProyectosSozu] Error fetching proyectos:', error);
      throw error;
    }

    const result = proyectos || [];

    console.log(`[getProyectosSozu] Found ${result.length} proyectos`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[getProyectosSozu] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
