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
    
    const url = new URL(req.url);
    const idProyectoParam = url.searchParams.get('id_proyecto');
    if (idProyectoParam) {
      idProyecto = parseInt(idProyectoParam, 10);
    }
    
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

    // Step 1: Get project IDs from entidades_relacionadas where id_tipo_entidad = 5 (Inmobiliaria)
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
        return new Response(JSON.stringify({ proyectos: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (proyectoIds.length === 0) {
      console.log('[getProyectosSozu] No proyectos found with id_tipo_entidad = 5');
      return new Response(JSON.stringify({ proyectos: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Get proyectos with all required fields
    const { data: proyectos, error: proyectosError } = await supabase
      .from('proyectos')
      .select(`
        id, 
        nombre, 
        descripcion,
        direccion, 
        latitud,
        longitud,
        url_logo,
        url_imagen_portada,
        fecha_entrega,
        id_estatus_proyecto,
        estatus_proyecto:id_estatus_proyecto (id, nombre)
      `)
      .eq('activo', true)
      .in('id', proyectoIds);

    if (proyectosError) {
      console.error('[getProyectosSozu] Error fetching proyectos:', proyectosError);
      throw proyectosError;
    }

    // Step 3: Get edificios for all projects
    const { data: edificios, error: edificiosError } = await supabase
      .from('edificios')
      .select('id, id_proyecto, nombre, numero_pisos, fecha_lanzamiento')
      .eq('activo', true)
      .in('id_proyecto', proyectoIds);

    if (edificiosError) {
      console.error('[getProyectosSozu] Error fetching edificios:', edificiosError);
      throw edificiosError;
    }

    const edificioIds = edificios?.map(e => e.id) || [];

    // Step 4: Get edificios_modelos for all edificios
    let edificiosModelos: any[] = [];
    if (edificioIds.length > 0) {
      const { data: em, error: emError } = await supabase
        .from('edificios_modelos')
        .select('id_edificio, id_modelo')
        .eq('activo', true)
        .in('id_edificio', edificioIds);

      if (emError) {
        console.error('[getProyectosSozu] Error fetching edificios_modelos:', emError);
        throw emError;
      }
      edificiosModelos = em || [];
    }

    const modeloIds = [...new Set(edificiosModelos.map(em => em.id_modelo).filter(id => id !== null))];

    // Step 5: Get modelos with required fields
    let modelos: any[] = [];
    if (modeloIds.length > 0) {
      const { data: m, error: modelosError } = await supabase
        .from('modelos')
        .select('id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano')
        .eq('activo', true)
        .in('id', modeloIds);

      if (modelosError) {
        console.error('[getProyectosSozu] Error fetching modelos:', modelosError);
        throw modelosError;
      }
      modelos = m || [];
    }

    // Step 6: Build the nested response structure
    const result = (proyectos || []).map(proyecto => {
      // Get edificios for this project
      const proyectoEdificios = (edificios || [])
        .filter(e => e.id_proyecto === proyecto.id)
        .map(edificio => {
          // Get modelo IDs for this edificio
          const edificioModeloIds = edificiosModelos
            .filter(em => em.id_edificio === edificio.id)
            .map(em => em.id_modelo);
          
          // Get modelos for this edificio
          const edificioModelos = modelos.filter(m => edificioModeloIds.includes(m.id));
          
          return {
            id: edificio.id,
            nombre: edificio.nombre,
            numero_pisos: edificio.numero_pisos,
            fecha_lanzamiento: edificio.fecha_lanzamiento,
            modelos: edificioModelos.map(m => ({
              id: m.id,
              nombre: m.nombre,
              descripcion: m.descripcion,
              numero_recamaras: m.numero_recamaras,
              numero_completo_banos: m.numero_completo_banos,
              numero_medio_bano: m.numero_medio_bano
            }))
          };
        });

      return {
        id: proyecto.id,
        nombre: proyecto.nombre,
        descripcion: proyecto.descripcion,
        direccion: proyecto.direccion,
        latitud: proyecto.latitud,
        longitud: proyecto.longitud,
        url_logo: proyecto.url_logo,
        url_imagen_portada: proyecto.url_imagen_portada,
        fecha_entrega: proyecto.fecha_entrega,
        estatus_proyecto: proyecto.estatus_proyecto,
        edificios: proyectoEdificios
      };
    });

    console.log(`[getProyectosSozu] Found ${result.length} proyectos with edificios and modelos`);

    return new Response(JSON.stringify({ proyectos: result }), {
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
