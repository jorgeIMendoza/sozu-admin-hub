import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import createReport from "https://esm.sh/docx-templates@4.11.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { id_cuenta_cobranza } = await req.json();
    
    if (!id_cuenta_cobranza) {
      throw new Error('id_cuenta_cobranza es requerido');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Obteniendo datos de la cuenta:', id_cuenta_cobranza);

    // Obtener datos de la cuenta
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select(`
        id,
        precio_final,
        id_notario,
        ofertas!fk_cuentas_cobranza_oferta (
          id,
          propiedades!ofertas_id_propiedad_fkey (
            id,
            numero_propiedad,
            edificios_modelos!fk_propiedades_edificio_modelo (
              modelos!edificios_modelos_id_modelo_fkey (
                nombre
              ),
              edificios!edificios_modelos_id_edificio_fkey (
                nombre,
                proyectos!edificios_id_proyecto_fkey (
                  id,
                  nombre
                )
              )
            )
          )
        )
      `)
      .eq('id', id_cuenta_cobranza)
      .single();

    if (cuentaError) throw cuentaError;
    if (!cuenta) throw new Error('Cuenta no encontrada');

    // Obtener compradores
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select(`
        id_persona,
        personas!compradores_id_persona_fkey (
          nombre_legal
        )
      `)
      .eq('id_cuenta_cobranza', id_cuenta_cobranza)
      .eq('activo', true);

    if (compradoresError) throw compradoresError;

    // Obtener el template del notario
    const { data: notario, error: notarioError } = await supabase
      .from('notarios')
      .select('url_template_proyecto_contrato')
      .eq('id', cuenta.id_notario)
      .single();

    if (notarioError) throw notarioError;
    if (!notario?.url_template_proyecto_contrato) {
      throw new Error('El notario no tiene un template configurado');
    }

    // Descargar el template
    const { data: templateData, error: templateError } = await supabase.storage
      .from('templates_proyecto_escritura')
      .download(notario.url_template_proyecto_contrato);

    if (templateError) throw templateError;

    // Leer el contenido del template como ArrayBuffer
    const arrayBuffer = await templateData.arrayBuffer();

    // Extraer datos
    const propiedad = cuenta.ofertas.propiedades;
    const edificioModelo = propiedad.edificios_modelos;
    const edificio = edificioModelo.edificios;
    const proyecto = edificio.proyectos;
    const modelo = edificioModelo.modelos;
    
    const compradoresNombres = compradores
      ?.map((c: any) => c.personas?.nombre_legal)
      .filter(Boolean)
      .join(', ') || 'N/A';

    // Datos para reemplazar en el template
    const mergeData = {
      nombre_proyecto: proyecto.nombre,
      nombre_edificio: edificio.nombre,
      numero_propiedad: propiedad.numero_propiedad,
      precio_final: cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2 }),
      nombre_comprador: compradoresNombres,
    };

    console.log('Generando documento con datos:', mergeData);

    // Generar el documento usando docx-templates
    const report = await createReport({
      template: arrayBuffer,
      data: mergeData,
      cmdDelimiter: ['{{', '}}'],
    });

    // Obtener la extensión del template original
    const templateExtension = notario.url_template_proyecto_contrato.split('.').pop() || 'docx';
    
    // Crear nombre del archivo con proyecto y numero_propiedad
    const proyectoClean = proyecto.nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const propiedadClean = propiedad.numero_propiedad.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `proyecto_escritura_${proyectoClean}_${propiedadClean}.${templateExtension}`;

    console.log('Draft generado exitosamente:', fileName);

    // Convertir a base64 para enviar al cliente
    const uint8Array = new Uint8Array(report);
    const base64Content = btoa(
      Array.from(uint8Array)
        .map(byte => String.fromCharCode(byte))
        .join('')
    );

    return new Response(
      JSON.stringify({
        success: true,
        content: base64Content,
        fileName: fileName,
        message: 'Draft generado exitosamente'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error generando draft:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error desconocido'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
