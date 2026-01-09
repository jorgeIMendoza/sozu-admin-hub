import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { corsHeaders } from '../_shared/cors.ts';

interface CheckEscrituracionRequest {
  id_cuenta_cobranza: number;
}

interface CheckEscrituracionResponse {
  success: boolean;
  status_changed: boolean;
  message: string;
  conditions_met: {
    estatus_valido: boolean;
    cuenta_pagada: boolean;
    todos_documentos_verificados: boolean;
    tiene_compradores: boolean;
  };
  id_propiedad?: number;
  estatus_actual?: number;
  documentos_pendientes?: number;
  saldo_pendiente?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { id_cuenta_cobranza }: CheckEscrituracionRequest = await req.json();

    console.log(`[check-escrituracion] Verificando cuenta ${id_cuenta_cobranza}`);

    // 1. Obtener la propiedad asociada a la cuenta de cobranza
    const { data: propiedad, error: propiedadError } = await supabase
      .from('cuentas_cobranza')
      .select(`
        id,
        ofertas!fk_ccob_oferta (
          id_propiedad,
          propiedades!fk_ofertas_propiedad (
            id,
            id_estatus_disponibilidad,
            numero_propiedad
          )
        )
      `)
      .eq('id', id_cuenta_cobranza)
      .eq('activo', true)
      .single();

    if (propiedadError || !propiedad) {
      console.error('[check-escrituracion] Error obteniendo propiedad:', propiedadError);
      throw new Error('Cuenta de cobranza no encontrada');
    }

    const propiedadData = (propiedad as any).ofertas.propiedades;
    const idPropiedad = propiedadData.id;
    const estatusActual = propiedadData.id_estatus_disponibilidad;

    console.log(`[check-escrituracion] Propiedad ${idPropiedad} con estatus ${estatusActual}`);

    // 2. Validar que el estatus sea 5 (Vendido) o 9 (Pagada completamente)
    if (estatusActual !== 5 && estatusActual !== 9) {
      console.log(`[check-escrituracion] Estatus ${estatusActual} no es válido (debe ser 5 o 9)`);
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: `La propiedad debe estar en estatus Vendido (5) o Pagada completamente (9). Estatus actual: ${estatusActual}`,
          conditions_met: {
            estatus_valido: false,
            cuenta_pagada: false,
            todos_documentos_verificados: false,
            tiene_compradores: false
          },
          id_propiedad: idPropiedad,
          estatus_actual: estatusActual
        } as CheckEscrituracionResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2.5 Validar que la cuenta esté completamente pagada
    // Excluir conceptos de cancelación (7 = Pago por cancelación, 9 = Devolución de pago)
    const { data: acuerdosPendientes, error: acuerdosError } = await supabase
      .from('acuerdos_pago')
      .select('id, monto, pago_completado, id_concepto')
      .eq('id_cuenta_cobranza', id_cuenta_cobranza)
      .eq('activo', true)
      .eq('pago_completado', false)
      .not('id_concepto', 'in', '(7,9)'); // Excluir conceptos de cancelación

    if (acuerdosError) {
      console.error('[check-escrituracion] Error verificando pagos pendientes:', acuerdosError);
      throw new Error('Error al verificar pagos pendientes');
    }

    if (acuerdosPendientes && acuerdosPendientes.length > 0) {
      const saldoPendiente = acuerdosPendientes.reduce((sum, a) => sum + Number(a.monto), 0);
      console.log(`[check-escrituracion] Cuenta tiene ${acuerdosPendientes.length} acuerdos pendientes. Saldo: $${saldoPendiente.toLocaleString()}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: `La cuenta tiene pagos pendientes. Saldo: $${saldoPendiente.toLocaleString()}`,
          conditions_met: {
            estatus_valido: true,
            cuenta_pagada: false,
            todos_documentos_verificados: false,
            tiene_compradores: false
          },
          id_propiedad: idPropiedad,
          estatus_actual: estatusActual,
          saldo_pendiente: saldoPendiente
        } as CheckEscrituracionResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[check-escrituracion] ✅ Cuenta completamente pagada');

    // 3. Obtener todos los compradores activos de esta cuenta
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select('id_persona')
      .eq('id_cuenta_cobranza', id_cuenta_cobranza)
      .eq('activo', true);

    if (compradoresError) {
      console.error('[check-escrituracion] Error obteniendo compradores:', compradoresError);
      throw new Error('Error al obtener compradores');
    }

    if (!compradores || compradores.length === 0) {
      console.log('[check-escrituracion] No hay compradores activos');
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: 'No hay compradores activos en esta cuenta',
          conditions_met: {
            estatus_valido: true,
            cuenta_pagada: true,
            todos_documentos_verificados: false,
            tiene_compradores: false
          },
          id_propiedad: idPropiedad,
          estatus_actual: estatusActual
        } as CheckEscrituracionResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const personaIds = compradores.map(c => c.id_persona);
    console.log(`[check-escrituracion] Verificando documentos de ${compradores.length} comprador(es): ${personaIds.join(', ')}`);

    // 4. Verificar que TODOS los documentos de TODOS los compradores estén verificados
    // Excluir documentos tipo 22 (Factura PDF)
    let todosVerificados = true;
    let totalDocumentos = 0;
    let documentosVerificados = 0;

    for (const personaId of personaIds) {
      const { data: documentos, error: docsError } = await supabase
        .from('documentos')
        .select('id, id_estatus_verificacion, id_tipo_documento')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .neq('id_tipo_documento', 22); // Excluir Factura PDF

      if (docsError) {
        console.error(`[check-escrituracion] Error obteniendo documentos de persona ${personaId}:`, docsError);
        continue;
      }

      if (!documentos || documentos.length === 0) {
        console.log(`[check-escrituracion] Persona ${personaId} no tiene documentos activos`);
        todosVerificados = false;
        continue;
      }

      totalDocumentos += documentos.length;
      // id_estatus_verificacion = 2 significa Validado
      const verificados = documentos.filter(d => d.id_estatus_verificacion === 2).length;
      documentosVerificados += verificados;

      console.log(`[check-escrituracion] Persona ${personaId}: ${verificados}/${documentos.length} documentos verificados`);

      if (verificados < documentos.length) {
        todosVerificados = false;
      }
    }

    console.log(`[check-escrituracion] Total: ${documentosVerificados}/${totalDocumentos} documentos verificados`);

    // 5. Si NO todos los documentos están verificados, retornar sin cambiar estatus
    if (!todosVerificados) {
      const pendientes = totalDocumentos - documentosVerificados;
      console.log(`[check-escrituracion] Faltan ${pendientes} documento(s) por verificar`);
      
      return new Response(
        JSON.stringify({
          success: true,
          status_changed: false,
          message: `Faltan ${pendientes} documento(s) por verificar`,
          conditions_met: {
            estatus_valido: true,
            cuenta_pagada: true,
            todos_documentos_verificados: false,
            tiene_compradores: true
          },
          id_propiedad: idPropiedad,
          estatus_actual: estatusActual,
          documentos_pendientes: pendientes
        } as CheckEscrituracionResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Si TODAS las condiciones se cumplen, actualizar el estatus a 7 (Escrituración)
    console.log(`[check-escrituracion] ✅ Todas las condiciones cumplidas. Actualizando propiedad ${idPropiedad} a estatus 7 (Escrituración)`);

    const { error: updateError } = await supabase
      .from('propiedades')
      .update({
        id_estatus_disponibilidad: 7,
        fecha_actualizacion: new Date().toISOString()
      })
      .eq('id', idPropiedad);

    if (updateError) {
      console.error('[check-escrituracion] Error actualizando propiedad:', updateError);
      throw new Error('Error al actualizar el estatus de la propiedad');
    }

    console.log(`[check-escrituracion] 🎉 Propiedad ${idPropiedad} actualizada exitosamente a estatus Escrituración (7)`);

    return new Response(
      JSON.stringify({
        success: true,
        status_changed: true,
        message: 'La propiedad ha sido actualizada a estatus Escrituración',
        conditions_met: {
          estatus_valido: true,
          cuenta_pagada: true,
          todos_documentos_verificados: true,
          tiene_compradores: true
        },
        id_propiedad: idPropiedad,
        estatus_actual: 7
      } as CheckEscrituracionResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-escrituracion] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        status_changed: false,
        message: error.message || 'Error al verificar estatus de escrituración',
        conditions_met: {
          estatus_valido: false,
          cuenta_pagada: false,
          todos_documentos_verificados: false,
          tiene_compradores: false
        }
      } as CheckEscrituracionResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
