import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      id_cuenta_mantenimiento,
      id_espacio_reservable_edificio,
      id_persona_que_reserva,
      fecha_reserva,
      hora_reserva,
      costo_final,
    } = await req.json();

    // Validar datos requeridos
    if (!id_cuenta_mantenimiento || !id_espacio_reservable_edificio || !id_persona_que_reserva || !fecha_reserva || !hora_reserva) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Obtener el máximo orden existente para esta cuenta de cobranza
    const { data: maxOrdenData, error: maxOrdenError } = await supabase
      .from('acuerdos_pago')
      .select('orden')
      .eq('id_cuenta_cobranza', id_cuenta_mantenimiento)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxOrdenError) {
      console.error('Error al obtener max orden:', maxOrdenError);
      return new Response(
        JSON.stringify({ error: maxOrdenError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const nuevoOrden = (maxOrdenData?.orden || 0) + 1;

    // Validar que la cuenta esté al corriente (sin adeudos)
    // Obtener todos los acuerdos de pago de la cuenta
    const { data: acuerdos, error: acuerdosError } = await supabase
      .from('acuerdos_pago')
      .select('id, monto')
      .eq('id_cuenta_cobranza', id_cuenta_mantenimiento)
      .eq('activo', true);

    if (acuerdosError) {
      console.error('Error al obtener acuerdos:', acuerdosError);
      return new Response(
        JSON.stringify({ error: acuerdosError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Calcular total a pagar (incluye multas)
    let totalAPagar = 0;
    const acuerdoIds = acuerdos?.map(a => a.id) || [];

    // Sumar montos de acuerdos normales
    for (const acuerdo of acuerdos || []) {
      totalAPagar += Number(acuerdo.monto);
    }

    // Agregar multas al total a pagar
    if (acuerdoIds.length > 0) {
      const { data: multas } = await supabase
        .from('multas')
        .select('monto')
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      for (const multa of multas || []) {
        totalAPagar += Number(multa.monto);
      }
    }

    // Calcular total aplicado (aplicaciones_pago)
    let totalAplicado = 0;
    if (acuerdoIds.length > 0) {
      const { data: aplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select('monto')
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      for (const aplicacion of aplicaciones || []) {
        totalAplicado += Number(aplicacion.monto);
      }
    }

    // Obtener total pagado real (pagos directos a la cuenta)
    const { data: pagosReales } = await supabase
      .from('pagos')
      .select('monto')
      .eq('id_cuenta_cobranza', id_cuenta_mantenimiento)
      .eq('activo', true);

    let totalPagadoReal = 0;
    for (const pago of pagosReales || []) {
      totalPagadoReal += Number(pago.monto);
    }

    // Excedente = pagos reales - aplicaciones (dinero no aplicado aún)
    const excedente = totalPagadoReal - totalAplicado;

    // Saldo pendiente bruto = total a pagar - total aplicado
    const saldoPendienteBruto = totalAPagar - totalAplicado;

    // Saldo pendiente real = descuenta el excedente (si hay excedente, cubre el pendiente)
    const saldoPendienteReal = Math.max(0, saldoPendienteBruto - excedente);

    // Validar que no haya adeudo
    if (saldoPendienteReal > 0.01) { // Tolerancia de 1 centavo por redondeo
      return new Response(
        JSON.stringify({ 
          error: 'No se puede crear la reserva. La cuenta de mantenimiento tiene un saldo pendiente de $' + saldoPendienteReal.toFixed(2),
          saldo_pendiente: saldoPendienteReal
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Usar una transacción para crear acuerdo_pago y reserva
    const { data: acuerdo, error: acuerdoError } = await supabase
      .from('acuerdos_pago')
      .insert({
        id_cuenta_cobranza: id_cuenta_mantenimiento,
        id_concepto: 14,
        monto: costo_final,
        fecha_pago: fecha_reserva,
        orden: nuevoOrden,
        pago_completado: costo_final === 0, // Marcar como completado si el monto es 0
      })
      .select()
      .single();

    if (acuerdoError) {
      console.error('Error al crear acuerdo_pago:', acuerdoError);
      return new Response(
        JSON.stringify({ error: acuerdoError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Crear la reserva
    const { data: reserva, error: reservaError } = await supabase
      .from('reservas')
      .insert({
        id_acuerdo_pago: acuerdo.id,
        id_espacio_reservable_edificio: parseInt(id_espacio_reservable_edificio),
        fecha_reserva,
        hora_reserva,
        costo_final,
        id_estatus_reserva: 1,
        id_persona_que_reserva: parseInt(id_persona_que_reserva),
      })
      .select()
      .single();

    if (reservaError) {
      console.error('Error al crear reserva:', reservaError);
      
      // Rollback: eliminar el acuerdo_pago creado
      await supabase
        .from('acuerdos_pago')
        .delete()
        .eq('id', acuerdo.id);

      return new Response(
        JSON.stringify({ error: reservaError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: reserva }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error general:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
