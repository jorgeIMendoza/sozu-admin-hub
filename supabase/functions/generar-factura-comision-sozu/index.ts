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
    const { id_cuenta_cobranza } = await req.json();

    if (!id_cuenta_cobranza) {
      return new Response(
        JSON.stringify({ success: false, message: 'id_cuenta_cobranza es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generar-factura-comision-sozu] Iniciando para cuenta: ${id_cuenta_cobranza}`);

    // 1. Verificar si ya existe una factura de comisión Sozu para esta cuenta
    const { data: cuentaExistente } = await supabase
      .from('cuentas_cobranza')
      .select('id_documento_factura_comision_sozu')
      .eq('id', id_cuenta_cobranza)
      .single();

    if (cuentaExistente?.id_documento_factura_comision_sozu) {
      console.log(`[generar-factura-comision-sozu] Ya existe factura para cuenta ${id_cuenta_cobranza}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Ya existe una factura de comisión para esta cuenta', already_exists: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener la oferta y propiedad
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select('id_oferta, precio_final, porcentaje_comision_venta')
      .eq('id', id_cuenta_cobranza)
      .single();

    if (cuentaError || !cuenta) {
      throw new Error('No se pudo obtener la cuenta de cobranza');
    }

    const { data: oferta } = await supabase
      .from('ofertas')
      .select('id_propiedad')
      .eq('id', cuenta.id_oferta)
      .single();

    if (!oferta?.id_propiedad) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay propiedad asociada', not_applicable: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verificar que la propiedad esté en estatus Vendido (5)
    const { data: propiedad } = await supabase
      .from('propiedades')
      .select('id, id_estatus_disponibilidad, id_entidad_relacionada_dueno')
      .eq('id', oferta.id_propiedad)
      .single();

    if (!propiedad || propiedad.id_estatus_disponibilidad !== 5) {
      console.log(`[generar-factura-comision-sozu] Propiedad no está en estatus Vendido`);
      return new Response(
        JSON.stringify({ success: true, message: 'La propiedad no está en estatus Vendido', not_applicable: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!propiedad.id_entidad_relacionada_dueno) {
      console.log(`[generar-factura-comision-sozu] Propiedad sin entidad dueña`);
      return new Response(
        JSON.stringify({ success: true, message: 'La propiedad no tiene entidad dueña configurada', not_applicable: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Obtener la entidad dueña y verificar facturar_comision_sozu = true
    const { data: entidadDuena } = await supabase
      .from('entidades_relacionadas')
      .select('id, facturar_comision_sozu, porcentaje_comision, id_persona, id_proyecto')
      .eq('id', propiedad.id_entidad_relacionada_dueno)
      .single();

    if (!entidadDuena) {
      throw new Error('No se pudo obtener la entidad dueña');
    }

    if (!entidadDuena.facturar_comision_sozu) {
      console.log(`[generar-factura-comision-sozu] Entidad dueña no tiene facturar_comision_sozu = true`);
      return new Response(
        JSON.stringify({ success: true, message: 'El propietario no requiere facturación de comisión Sozu', not_applicable: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Calcular monto de comisión
    const precioFinal = cuenta.precio_final || 0;
    const porcentajeComision = cuenta.porcentaje_comision_venta || 0;
    const montoComision = (precioFinal * porcentajeComision) / 100;

    if (montoComision <= 0) {
      console.log(`[generar-factura-comision-sozu] Monto de comisión es 0 o negativo`);
      return new Response(
        JSON.stringify({ success: true, message: 'El monto de comisión es 0', not_applicable: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generar-factura-comision-sozu] Monto comisión: ${montoComision} (${precioFinal} * ${porcentajeComision}%)`);

    // 6. Obtener la URL base de N8N
    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) {
      throw new Error('N8N_WEBHOOK_BASE_URL no está configurado');
    }

    // 7. Llamar al webhook N8N con payload simplificado
    console.log(`[generar-factura-comision-sozu] Llamando N8N webhook: ${n8nBaseUrl}/generaFactura`);

    const n8nResponse = await fetch(`${n8nBaseUrl}/generaFactura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_factura: 'comision' }),
    });

    let facturaResult: any = {};
    const responseText = await n8nResponse.text();
    console.log(`[generar-factura-comision-sozu] N8N response status: ${n8nResponse.status}, text: "${responseText}"`);
    try {
      facturaResult = JSON.parse(responseText);
    } catch {
      facturaResult = { url: responseText || null };
    }

    // Usar URL placeholder válida si N8N no devuelve URL
    const docUrl = facturaResult.url && facturaResult.url.startsWith('http')
      ? facturaResult.url
      : 'https://pendiente-de-generar.sozu.com';

    // 8. Registrar documento en tabla documentos
    const { data: documento, error: docError } = await supabase
      .from('documentos')
      .insert({
        id_cuenta_cobranza,
        id_propiedad: propiedad.id,
        id_tipo_documento: 47,
        url: docUrl,
        id_estatus_verificacion: 1,
        activo: true,
        es_draft: true,
        numero: facturaResult.factura_id || null,
      })
      .select('id')
      .single();

    if (docError) {
      console.error(`[generar-factura-comision-sozu] Error creando documento:`, docError);
      throw new Error('Error al registrar el documento de factura');
    }

    // 9. Actualizar cuentas_cobranza con referencia al documento
    const { error: updateError } = await supabase
      .from('cuentas_cobranza')
      .update({
        id_documento_factura_comision_sozu: documento.id,
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', id_cuenta_cobranza);

    if (updateError) {
      console.error(`[generar-factura-comision-sozu] Error actualizando cuenta:`, updateError);
    }

    // 10. Obtener datos del propietario para la notificación
    const { data: propietario } = await supabase
      .from('personas')
      .select('nombre_legal, email')
      .eq('id', entidadDuena.id_persona)
      .single();

    // 11. Enviar notificación por correo
    if (propietario?.email) {
      try {
        const ccEmails = SUPER_ADMIN_EMAILS.join(',');
        const notificationPayload = {
          tipo: 'email',
          from: 'Notificaciones Sozu <notificaciones@sozu.com>',
          email: propietario.email,
          cc: ccEmails,
          asunto: `Factura Draft de Comisión de Venta - Cuenta ${id_cuenta_cobranza}`,
          mensaje: {
            nombre: propietario.nombre_legal,
            actividad: 'Generación de factura de comisión de venta (Draft)',
            detalles: `<tr><td class='label'>Cuenta:</td><td class='value'>${id_cuenta_cobranza}</td></tr><tr><td class='label'>Monto Comisión:</td><td class='value'>$${montoComision.toFixed(2)} MXN</td></tr><tr><td class='label'>Porcentaje:</td><td class='value'>${porcentajeComision}%</td></tr><tr><td class='label'>Estado:</td><td class='value'>Draft (pendiente de timbrado)</td></tr>`,
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

        console.log(`[generar-factura-comision-sozu] Notificación enviada a ${propietario.email}`);
      } catch (notifError) {
        console.error(`[generar-factura-comision-sozu] Error enviando notificación:`, notifError);
      }
    }

    console.log(`[generar-factura-comision-sozu] ✅ Factura draft generada exitosamente (doc ID: ${documento.id})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Factura draft de comisión generada exitosamente',
        id_documento: documento.id,
        monto_comision: montoComision,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generar-factura-comision-sozu] Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
