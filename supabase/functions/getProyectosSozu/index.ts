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

    console.log('[getProyectosSozu] Fetching proyectos...');

    // Query proyectos with the specified conditions
    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select(`
        id,
        nombre,
        direccion,
        fecha_entrega,
        entidades_relacionadas!inner(id_tipo_entidad)
      `)
      .eq('activo', true)
      .eq('id_estatus_proyecto', 13)
      .eq('entidades_relacionadas.id_tipo_entidad', 5);

    if (error) {
      console.error('[getProyectosSozu] Error:', error);
      throw error;
    }

    // Transform the response to match the expected format
    const result = proyectos?.map(p => ({
      id: p.id,
      nombre: p.nombre,
      direccion: p.direccion,
      fecha_entrega: p.fecha_entrega
    })) || [];

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
