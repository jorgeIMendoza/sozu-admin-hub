import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckSoldStatusRequest {
  id_cuenta_cobranza: number;
}

interface CheckSoldStatusResponse {
  success: boolean;
  status_changed: boolean;
  message: string;
  conditions_met: {
    enganche_completado: boolean;
    contrato_verificado: boolean;
  };
  id_propiedad?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { id_cuenta_cobranza }: CheckSoldStatusRequest = await req.json();

    console.log(`[check-property-sold-status] Iniciando verificación para cuenta_cobranza: ${id_cuenta_cobranza}`);

    // 1. Obtener la oferta y propiedad desde la cuenta de cobranza
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select('id_oferta')
      .eq('id', id_cuenta_cobranza)
      .single();

    if (cuentaError || !cuenta) {
      console.error('[check-property-sold-status] Error obteniendo cuenta:', cuentaError);
      throw new Error('No se pudo obtener la cuenta de cobranza');
    }

    const { data: oferta, error: ofertaError } = await supabase
      .from('ofertas')
      .select('id_propiedad')
      .eq('id', cuenta.id_oferta)
      .single();

    if (ofertaError || !oferta) {
      console.error('[check-property-sold-status] Error obteniendo oferta:', ofertaError);
      throw new Error('No se pudo obtener la oferta');
    }

    // Si no hay propiedad asociada, no es aplicable
    if (!oferta.id_propiedad) {
      console.log('[check-property-sold-status] No hay propiedad asociada a esta cuenta');
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: 'Esta cuenta no está asociada a una propiedad',
          conditions_met: {
            enganche_completado: false,
            contrato_verificado: false
          }
        } as CheckSoldStatusResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verificar el estatus actual de la propiedad
    const { data: propiedad, error: propiedadError } = await supabase
      .from('propiedades')
      .select('id, id_estatus_disponibilidad')
      .eq('id', oferta.id_propiedad)
      .single();

    if (propiedadError || !propiedad) {
      console.error('[check-property-sold-status] Error obteniendo propiedad:', propiedadError);
      throw new Error('No se pudo obtener la propiedad');
    }

    // Solo procesar si el estatus actual es 4 (Apartado)
    if (propiedad.id_estatus_disponibilidad !== 4) {
      console.log(`[check-property-sold-status] Propiedad ${propiedad.id} no está en estatus Apartado (estatus actual: ${propiedad.id_estatus_disponibilidad})`);
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: 'La propiedad no está en estatus Apartado',
          conditions_met: {
            enganche_completado: false,
            contrato_verificado: false
          },
          id_propiedad: propiedad.id
        } as CheckSoldStatusResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. CONDICIÓN 1: Verificar que todos los acuerdos de Apartado (1) y Enganche (2) estén completamente pagados
    const { data: acuerdos, error: acuerdosError } = await supabase
      .from('acuerdos_pago')
      .select('id, pago_completado, id_concepto')
      .eq('id_cuenta_cobranza', id_cuenta_cobranza)
      .in('id_concepto', [1, 2]) // Apartado y Enganche
      .eq('activo', true);

    if (acuerdosError) {
      console.error('[check-property-sold-status] Error obteniendo acuerdos:', acuerdosError);
      throw new Error('Error al verificar acuerdos de pago');
    }

    const totalAcuerdos = acuerdos?.length || 0;
    const acuerdosPagados = acuerdos?.filter(a => a.pago_completado).length || 0;
    const engancheCompletado = totalAcuerdos > 0 && totalAcuerdos === acuerdosPagados;

    console.log(`[check-property-sold-status] Acuerdos de enganche: ${acuerdosPagados}/${totalAcuerdos} pagados`);

    // 4. CONDICIÓN 2: Verificar que existe contrato firmado (tipo 18) verificado
    const { data: contratos, error: contratosError } = await supabase
      .from('documentos')
      .select('id')
      .eq('id_cuenta_cobranza', id_cuenta_cobranza)
      .eq('id_tipo_documento', 18) // Contrato firmado
      .eq('es_verificado', true)
      .eq('activo', true);

    if (contratosError) {
      console.error('[check-property-sold-status] Error verificando contrato:', contratosError);
      throw new Error('Error al verificar contrato firmado');
    }

    const contratoVerificado = (contratos?.length || 0) > 0;

    console.log(`[check-property-sold-status] Contrato verificado: ${contratoVerificado}`);

    // 5. Si AMBAS condiciones se cumplen, actualizar el estatus de la propiedad
    if (engancheCompletado && contratoVerificado) {
      console.log(`[check-property-sold-status] ✅ Todas las condiciones cumplidas. Actualizando propiedad ${propiedad.id} a estatus Vendido (5)`);

      // 5.1. PRIMERO: Desverificar todos los documentos de los compradores
      const { data: compradores, error: compradoresError } = await supabase
        .from('compradores')
        .select('id_persona')
        .eq('id_cuenta_cobranza', id_cuenta_cobranza)
        .eq('activo', true);

      if (compradoresError) {
        console.error('[check-property-sold-status] Error obteniendo compradores:', compradoresError);
        throw new Error('Error al obtener compradores');
      }

      if (compradores && compradores.length > 0) {
        const idsPersonas = compradores.map(c => c.id_persona);
        console.log(`[check-property-sold-status] Desverificando documentos de ${idsPersonas.length} comprador(es): ${idsPersonas.join(', ')}`);

        const { error: docsError } = await supabase
          .from('documentos')
          .update({ es_verificado: false })
          .in('id_persona', idsPersonas)
          .eq('activo', true);

        if (docsError) {
          console.error('[check-property-sold-status] Error desverificando documentos:', docsError);
          throw new Error('Error al desverificar documentos de compradores');
        }

        console.log(`[check-property-sold-status] ✅ Documentos de compradores desverificados exitosamente`);
      }

      // 5.2. LUEGO: Actualizar el estatus de la propiedad
      const { error: updateError } = await supabase
        .from('propiedades')
        .update({
          id_estatus_disponibilidad: 5, // Vendido
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', propiedad.id);

      if (updateError) {
        console.error('[check-property-sold-status] Error actualizando propiedad:', updateError);
        throw new Error('Error al actualizar el estatus de la propiedad');
      }

      console.log(`[check-property-sold-status] 🎉 Propiedad ${propiedad.id} actualizada exitosamente a estatus Vendido`);

      return new Response(
        JSON.stringify({
          success: true,
          status_changed: true,
          message: 'La propiedad ha sido marcada como Vendida automáticamente',
          conditions_met: {
            enganche_completado: true,
            contrato_verificado: true
          },
          id_propiedad: propiedad.id
        } as CheckSoldStatusResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Si no se cumplen ambas condiciones, retornar el estado actual
    console.log(`[check-property-sold-status] Condiciones no cumplidas. Enganche: ${engancheCompletado}, Contrato: ${contratoVerificado}`);

    return new Response(
      JSON.stringify({
        success: true,
        status_changed: false,
        message: 'No se cumplen todas las condiciones para marcar como Vendido',
        conditions_met: {
          enganche_completado: engancheCompletado,
          contrato_verificado: contratoVerificado
        },
        id_propiedad: propiedad.id
      } as CheckSoldStatusResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-property-sold-status] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        status_changed: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
        conditions_met: {
          enganche_completado: false,
          contrato_verificado: false
        }
      } as CheckSoldStatusResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
