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

async function buildInvoicePayload(supabase: any, idCuentaCobranza: number, idPropiedad: number, apiKey: string, esDraft: boolean, montoComision: number, porcentajeComision: number) {
  // 1. Propiedad
  const { data: prop } = await supabase.from('propiedades').select('numero_propiedad, m2_interiores, m2_exteriores, numero_piso, id_entidad_relacionada_dueno').eq('id', idPropiedad).single();
  if (!prop) throw new Error('Propiedad no encontrada');

  // 2. Dirección del proyecto via entidad dueña
  let direccion = '';
  if (prop.id_entidad_relacionada_dueno) {
    const { data: ent } = await supabase.from('entidades_relacionadas').select('id_proyecto').eq('id', prop.id_entidad_relacionada_dueno).single();
    if (ent?.id_proyecto) {
      const { data: proy } = await supabase.from('proyectos').select('direccion').eq('id', ent.id_proyecto).single();
      direccion = proy?.direccion || '';
    }
  }

  // 3. Cuenta cobranza completa
  const { data: cuenta } = await supabase.from('cuentas_cobranza').select('*').eq('id', idCuentaCobranza).single();
  if (!cuenta) throw new Error('Cuenta no encontrada');

  // 4. Compradores
  const { data: compradoresRaw } = await supabase.from('compradores').select('id_persona, porcentaje_copropiedad').eq('id_cuenta_cobranza', idCuentaCobranza).eq('activo', true);

  const compradores = [];
  for (const c of (compradoresRaw || [])) {
    const { data: persona } = await supabase.from('personas').select('*').eq('id', c.id_persona).single();
    if (!persona) continue;

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

    compradores.push({
      id_persona: persona.id,
      nombre_completo: persona.nombre_legal,
      porcentaje_propiedad: c.porcentaje_copropiedad || 0,
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
    });
  }

  // 5. Estacionamientos
  const { data: estacionamientos } = await supabase.from('estacionamientos').select('*, tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre)').eq('id_propiedad', idPropiedad).eq('activo', true);

  // 6. Bodegas
  const { data: bodegas } = await supabase.from('bodegas').select('*').eq('id_propiedad', idPropiedad).eq('activo', true);

  // 7. Notario
  let notario = null;
  if (cuenta.id_notario) {
    const { data } = await supabase.from('notarios').select('nombre, notaria, direccion, email, telefono').eq('id', cuenta.id_notario).single();
    if (data) {
      notario = {
        nombre: data.nombre?.trim() || '',
        notaria: data.notaria?.trim() || '',
        direccion: data.direccion?.trim() || '',
        email: data.email?.trim() || '',
        telefono: data.telefono?.trim() || '',
      };
    }
  }

  // Format fecha_escritura
  let fechaEscritura = '';
  if (cuenta.fecha_escritura) {
    const d = new Date(cuenta.fecha_escritura);
    fechaEscritura = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return {
    api_key: apiKey,
    environment: 'produccion',
    tipo_factura: 'comision',
    id_propiedad: idPropiedad,
    id_cuenta_cobranza: idCuentaCobranza,
    es_draft: esDraft,
    monto_comision: montoComision,
    porcentaje_comision: porcentajeComision,
    propiedad: {
      numero_propiedad: prop.numero_propiedad,
      metraje_escriturable: (prop.m2_interiores || 0) + (prop.m2_exteriores || 0),
      direccion,
      precio_final: cuenta.precio_final,
      piso: prop.numero_piso,
    },
    estacionamientos: (estacionamientos || []).map((e: any) => ({
      nombre: e.nombre,
      tipo: e.tipos_estacionamiento?.nombre || '',
      m2: e.m2,
      ubicacion: e.ubicacion || '',
      es_incluido: e.es_incluido,
    })),
    bodegas: (bodegas || []).map((b: any) => ({
      nombre: b.nombre,
      m2: b.m2,
      ubicacion: b.ubicacion || '',
      es_incluido: b.es_incluido,
    })),
    escrituracion: {
      numero_escritura: cuenta.numero_escritura || '',
      fecha_escritura: fechaEscritura,
      libro: cuenta.libro || '',
      hoja: cuenta.hoja || '',
      clave_catastral: cuenta.clave_catastral || '',
      numero_unidad_privativa: cuenta.numero_unidad_privativa || '',
      notario,
    },
    compradores,
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
    const porcentajeComision = cuenta.porcentaje_comision_venta || 0;

    // 2. Obtener propiedad
    const { data: oferta } = await supabase.from('ofertas').select('id_propiedad').eq('id', cuenta.id_oferta).single();
    if (!oferta?.id_propiedad) throw new Error('No hay propiedad asociada a la oferta');

    // 3. Leer API key y N8N URL
    const apiKey = 'COMISIONES_SOZU_API_KEY';

    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) throw new Error('N8N_WEBHOOK_BASE_URL no está configurado');

    // 4. Construir payload completo
    const payload = await buildInvoicePayload(supabase, id_cuenta_cobranza, oferta.id_propiedad, apiKey, false, montoComision, porcentajeComision);

    console.log(`[timbrar-factura-comision-sozu] Enviando payload completo a N8N con ${payload.compradores.length} compradores`);

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
