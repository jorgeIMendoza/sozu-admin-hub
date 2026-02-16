import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPER_ADMIN_EMAILS = [
  'rodrigo.terveen@sozu.com',
  'joseramon.escobar@sozu.com',
  'jorge.mendoza@sozu.com',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { id_cuenta_cobranza, id_documento } = await req.json();

    if (!id_cuenta_cobranza || !id_documento) {
      return new Response(
        JSON.stringify({ success: false, message: 'id_cuenta_cobranza e id_documento son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[timbrar-factura-comision-sozu] Timbrando factura doc: ${id_documento}, cuenta: ${id_cuenta_cobranza}`);

    // 1. Verificar que el documento existe y es draft
    const { data: documento } = await supabase
      .from('documentos')
      .select('id, es_draft, url, numero')
      .eq('id', id_documento)
      .eq('id_tipo_documento', 47)
      .eq('activo', true)
      .single();

    if (!documento) {
      throw new Error('Documento no encontrado o no es de tipo factura comisión Sozu');
    }

    if (!documento.es_draft) {
      return new Response(
        JSON.stringify({ success: true, message: 'La factura ya está timbrada', already_timbrada: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener datos de la cuenta para recalcular info
    const { data: cuenta } = await supabase
      .from('cuentas_cobranza')
      .select('id_oferta, precio_final, porcentaje_comision_venta')
      .eq('id', id_cuenta_cobranza)
      .single();

    if (!cuenta) throw new Error('Cuenta de cobranza no encontrada');

    const { data: oferta } = await supabase
      .from('ofertas')
      .select('id_propiedad')
      .eq('id', cuenta.id_oferta)
      .single();

    if (!oferta?.id_propiedad) throw new Error('No hay propiedad asociada');

    const { data: propiedad } = await supabase
      .from('propiedades')
      .select('id, id_entidad_relacionada_dueno')
      .eq('id', oferta.id_propiedad)
      .single();

    if (!propiedad?.id_entidad_relacionada_dueno) throw new Error('No hay entidad dueña');

    const { data: entidad } = await supabase
      .from('entidades_relacionadas')
      .select('id_persona')
      .eq('id', propiedad.id_entidad_relacionada_dueno)
      .single();

    if (!entidad) throw new Error('Entidad no encontrada');

    const { data: propietario } = await supabase
      .from('personas')
      .select('nombre_legal, rfc, email, regimen, uso_cfdi, direccion_fiscal_codigo_postal')
      .eq('id', entidad.id_persona)
      .single();

    if (!propietario) throw new Error('Propietario no encontrado');

    // 3. Obtener API key de producción
    const apiKey = Deno.env.get('COMISIONES_SOZU_API_KEY');
    if (!apiKey) throw new Error('COMISIONES_SOZU_API_KEY no está configurado');

    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) throw new Error('N8N_WEBHOOK_BASE_URL no está configurado');

    // 4. Calcular monto
    const montoComision = ((cuenta.precio_final || 0) * (cuenta.porcentaje_comision_venta || 0)) / 100;

    // 5. Llamar N8N para timbrar
    const facturaPayload = {
      api_key: apiKey,
      tipo_factura: 'comision_venta_sozu',
      es_draft: false,
      factura_id: documento.numero,
      receptor: {
        nombre: propietario.nombre_legal,
        rfc: propietario.rfc,
        regimen: propietario.regimen,
        uso_cfdi: propietario.uso_cfdi || 'G03',
        codigo_postal: propietario.direccion_fiscal_codigo_postal,
        email: propietario.email,
      },
      conceptos: [{
        descripcion: `Comisión de venta - Cuenta ${id_cuenta_cobranza}`,
        monto: montoComision,
      }],
      id_cuenta_cobranza,
      id_propiedad: propiedad.id,
    };

    console.log(`[timbrar-factura-comision-sozu] Llamando N8N para timbrar`);

    const n8nResponse = await fetch(`${n8nBaseUrl}/generaFactura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(facturaPayload),
    });

    let facturaResult: any = {};
    try {
      facturaResult = await n8nResponse.json();
    } catch {
      const textResult = await n8nResponse.text();
      facturaResult = { url: textResult };
    }

    console.log(`[timbrar-factura-comision-sozu] N8N response status: ${n8nResponse.status}`);

    // 6. Actualizar documento: ya no es draft
    const { error: updateDocError } = await supabase
      .from('documentos')
      .update({
        es_draft: false,
        id_estatus_verificacion: 2, // Validado
        url: facturaResult.url || documento.url,
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', id_documento);

    if (updateDocError) {
      console.error('[timbrar-factura-comision-sozu] Error actualizando documento:', updateDocError);
      throw new Error('Error al actualizar el documento');
    }

    // 7. Enviar notificación
    try {
      const ccEmails = SUPER_ADMIN_EMAILS.join(',');
      const notificationPayload = {
        tipo: 'email',
        from: 'Notificaciones Sozu <notificaciones@sozu.com>',
        email: propietario.email,
        cc: ccEmails,
        asunto: `Factura Timbrada de Comisión de Venta - Cuenta ${id_cuenta_cobranza}`,
        mensaje: {
          nombre: propietario.nombre_legal,
          actividad: 'Factura de comisión de venta timbrada',
          detalles: `<tr><td class='label'>Cuenta:</td><td class='value'>${id_cuenta_cobranza}</td></tr><tr><td class='label'>Monto Comisión:</td><td class='value'>$${montoComision.toFixed(2)} MXN</td></tr><tr><td class='label'>Estado:</td><td class='value'>Timbrada</td></tr>`,
        },
        templateId: 36978552,
      };

      await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      console.log(`[timbrar-factura-comision-sozu] Notificación timbrado enviada a ${propietario.email}`);
    } catch (notifError) {
      console.error('[timbrar-factura-comision-sozu] Error enviando notificación:', notifError);
    }

    console.log(`[timbrar-factura-comision-sozu] ✅ Factura timbrada exitosamente`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Factura timbrada exitosamente',
        id_documento,
        monto_comision: montoComision,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[timbrar-factura-comision-sozu] Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
