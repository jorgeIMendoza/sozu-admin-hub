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

async function buildDuenoData(supabase: any, idPersona: number) {
  const { data: persona } = await supabase.from('personas').select('*').eq('id', idPersona).single();
  if (!persona) return null;

  let pais = '', estado = '', municipio = '';
  if (persona.direccion_fiscal_id_pais) {
    const { data } = await supabase.from('paises').select('nombre').eq('id', persona.direccion_fiscal_id_pais).single();
    pais = data?.nombre || '';
  }
  if (persona.direccion_fiscal_id_estado) {
    const { data } = await supabase.from('estados_mx').select('nombre').eq('id', persona.direccion_fiscal_id_estado).single();
    estado = data?.nombre || '';
  }
  if (persona.direccion_fiscal_id_municipio) {
    const { data } = await supabase.from('municipios_mx').select('nombre').eq('id', persona.direccion_fiscal_id_municipio).single();
    municipio = data?.nombre || '';
  }

  return {
    id_persona: persona.id,
    nombre_completo: persona.nombre_legal || '',
    email: persona.email || '',
    telefono: persona.telefono || '',
    rfc: persona.rfc || '',
    curp: persona.curp || '',
    regimen: persona.regimen || '',
    uso_cfdi: persona.uso_cfdi || '',
    direccion_fiscal: {
      calle: persona.direccion_fiscal_calle || '',
      numero_exterior: persona.direccion_fiscal_num_ext || '',
      numero_interior: persona.direccion_fiscal_num_int || '',
      colonia: persona.direccion_fiscal_colonia || '',
      codigo_postal: persona.direccion_fiscal_codigo_postal || '',
      municipio,
      estado,
      pais,
    },
  };
}

async function buildInvoicePayload(supabase: any, idCuentaCobranza: number, idPropiedad: number, apiKey: string, esDraft: boolean, montoComision: number, porcentajeComision: number, environment: string) {
  // 1. Propiedad
  const { data: prop } = await supabase.from('propiedades').select('numero_propiedad, m2_interiores, m2_exteriores, numero_piso, id_entidad_relacionada_dueno').eq('id', idPropiedad).single();
  if (!prop) throw new Error('Propiedad no encontrada');

  // 2. Dirección y nombre del proyecto via entidad dueña
  let direccion = '';
  let nombreProyecto = '';
  let idPersonaDueno: number | null = null;
  if (prop.id_entidad_relacionada_dueno) {
    const { data: ent } = await supabase.from('entidades_relacionadas').select('id_proyecto, id_persona').eq('id', prop.id_entidad_relacionada_dueno).single();
    idPersonaDueno = ent?.id_persona || null;
    if (ent?.id_proyecto) {
      const { data: proy } = await supabase.from('proyectos').select('direccion, nombre').eq('id', ent.id_proyecto).single();
      direccion = proy?.direccion || '';
      nombreProyecto = proy?.nombre || '';
    }
  }

  // 3. Cuenta cobranza
  const { data: cuenta } = await supabase.from('cuentas_cobranza').select('precio_final, iva_incluido').eq('id', idCuentaCobranza).single();
  if (!cuenta) throw new Error('Cuenta no encontrada');

  // 4. Dueño
  let dueno = null;
  if (idPersonaDueno) {
    dueno = await buildDuenoData(supabase, idPersonaDueno);
  }

  return {
    api_key: apiKey,
    environment,
    tipo_factura: 'comision',
    id_propiedad: idPropiedad,
    id_cuenta_cobranza: idCuentaCobranza,
    es_draft: esDraft,
    monto_comision: montoComision,
    porcentaje_comision: porcentajeComision,
    iva_incluido: cuenta.iva_incluido || false,
    propiedad: {
      numero_propiedad: prop.numero_propiedad,
      metraje_escriturable: (prop.m2_interiores || 0) + (prop.m2_exteriores || 0),
      direccion,
      precio_final: cuenta.precio_final,
      piso: prop.numero_piso,
      proyecto: nombreProyecto,
    },
    dueno,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { id_cuenta_cobranza, environment: envFromBody } = await req.json();
    const environment = envFromBody || 'produccion';

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
    const porcentajeComision = cuenta.porcentaje_comision_venta || 0;

    // 2. Obtener propiedad
    const { data: oferta } = await supabase.from('ofertas').select('id_propiedad').eq('id', cuenta.id_oferta).single();
    if (!oferta?.id_propiedad) throw new Error('No hay propiedad asociada a la oferta');

    // 3. API key y N8N URL
    const apiKey = 'COMISIONES_SOZU_API_KEY';

    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) throw new Error('N8N_WEBHOOK_BASE_URL no está configurado');

    // 4. Construir payload
    const payload = await buildInvoicePayload(supabase, id_cuenta_cobranza, oferta.id_propiedad, apiKey, false, montoComision, porcentajeComision, environment);

    console.log(`[timbrar-factura-comision-sozu] Enviando payload a N8N con dueno: ${payload.dueno?.nombre_completo || 'N/A'}`);

    // 5. Llamar N8N
    const n8nResponse = await fetch(`${n8nBaseUrl}/generaFactura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let facturaResult: any = {};
    const responseText = await n8nResponse.text();
    console.log(`[timbrar-factura-comision-sozu] N8N response status: ${n8nResponse.status}, text: ${responseText}`);
    try {
      facturaResult = JSON.parse(responseText);
    } catch {
      facturaResult = { url: responseText };
    }

    // 6. Actualizar cuenta
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

    // 7. Notificación al propietario
    const { data: propiedad } = await supabase.from('propiedades').select('id_entidad_relacionada_dueno').eq('id', oferta.id_propiedad).single();

    let propietarioEmail = '';
    let propietarioNombre = '';

    if (propiedad?.id_entidad_relacionada_dueno) {
      const { data: entidad } = await supabase.from('entidades_relacionadas').select('id_persona').eq('id', propiedad.id_entidad_relacionada_dueno).single();
      if (entidad) {
        const { data: propietario } = await supabase.from('personas').select('nombre_legal, email').eq('id', entidad.id_persona).single();
        if (propietario) {
          propietarioEmail = propietario.email || '';
          propietarioNombre = propietario.nombre_legal || '';
        }
      }
    }

    if (propietarioEmail) {
      try {
        const ccEmails = SUPER_ADMIN_EMAILS.join(',');
        await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({
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
          }),
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
