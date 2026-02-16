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

    console.log(`[timbrar-factura-comision-sozu] Timbrando factura cuenta: ${id_cuenta_cobranza}`);

    // 1. Verificar que la cuenta tiene factura draft
    const { data: cuenta } = await supabase
      .from('cuentas_cobranza')
      .select('id_oferta, precio_final, porcentaje_comision_venta, url_factura_comision, es_draft_factura_comision')
      .eq('id', id_cuenta_cobranza)
      .single();

    if (!cuenta) throw new Error('Cuenta de cobranza no encontrada');

    if (!cuenta.url_factura_comision) {
      throw new Error('No existe factura draft para timbrar');
    }

    if (cuenta.es_draft_factura_comision === false) {
      return new Response(
        JSON.stringify({ success: true, message: 'La factura ya está timbrada', already_timbrada: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const montoComision = ((cuenta.precio_final || 0) * (cuenta.porcentaje_comision_venta || 0)) / 100;

    // 2. Obtener N8N URL
    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) throw new Error('N8N_WEBHOOK_BASE_URL no está configurado');

    // 3. Llamar N8N para timbrar
    console.log(`[timbrar-factura-comision-sozu] Llamando N8N para timbrar`);

    const n8nResponse = await fetch(`${n8nBaseUrl}/generaFactura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_factura: 'comision' }),
    });

    let facturaResult: any = {};
    const responseText = await n8nResponse.text();
    console.log(`[timbrar-factura-comision-sozu] N8N response text: ${responseText}`);
    try {
      facturaResult = JSON.parse(responseText);
    } catch {
      facturaResult = { url: responseText };
    }

    // 4. Actualizar cuenta: ya no es draft
    const { error: updateError } = await supabase
      .from('cuentas_cobranza')
      .update({
        es_draft_factura_comision: false,
        url_factura_comision: facturaResult.url || cuenta.url_factura_comision,
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', id_cuenta_cobranza);

    if (updateError) {
      console.error('[timbrar-factura-comision-sozu] Error actualizando cuenta:', updateError);
      throw new Error('Error al actualizar la cuenta');
    }

    // 5. Obtener datos del propietario para notificación
    const { data: oferta } = await supabase
      .from('ofertas')
      .select('id_propiedad')
      .eq('id', cuenta.id_oferta)
      .single();

    let propietarioEmail = '';
    let propietarioNombre = '';

    if (oferta?.id_propiedad) {
      const { data: propiedad } = await supabase
        .from('propiedades')
        .select('id_entidad_relacionada_dueno')
        .eq('id', oferta.id_propiedad)
        .single();

      if (propiedad?.id_entidad_relacionada_dueno) {
        const { data: entidad } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona')
          .eq('id', propiedad.id_entidad_relacionada_dueno)
          .single();

        if (entidad) {
          const { data: propietario } = await supabase
            .from('personas')
            .select('nombre_legal, email')
            .eq('id', entidad.id_persona)
            .single();

          if (propietario) {
            propietarioEmail = propietario.email || '';
            propietarioNombre = propietario.nombre_legal || '';
          }
        }
      }
    }

    // 6. Enviar notificación
    if (propietarioEmail) {
      try {
        const ccEmails = SUPER_ADMIN_EMAILS.join(',');
        const notificationPayload = {
          tipo: 'email',
          from: 'Notificaciones Sozu <notificaciones@sozu.com>',
          email: propietarioEmail,
          cc: ccEmails,
          asunto: `Factura Timbrada de Comisión de Venta - Cuenta ${id_cuenta_cobranza}`,
          mensaje: {
            nombre: propietarioNombre,
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

        console.log(`[timbrar-factura-comision-sozu] Notificación timbrado enviada a ${propietarioEmail}`);
      } catch (notifError) {
        console.error('[timbrar-factura-comision-sozu] Error enviando notificación:', notifError);
      }
    }

    console.log(`[timbrar-factura-comision-sozu] ✅ Factura timbrada exitosamente`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Factura timbrada exitosamente',
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
