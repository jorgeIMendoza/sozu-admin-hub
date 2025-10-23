import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { reserva_id } = await req.json();

    if (!reserva_id) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el ID de la reserva' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cancelando reserva:', reserva_id);

    // Obtener la reserva actual
    const { data: reserva, error: reservaError } = await supabase
      .from('reservas')
      .select(`
        *,
        acuerdos_pago(
          id,
          monto,
          pago_completado,
          id_cuenta_cobranza
        )
      `)
      .eq('id', reserva_id)
      .maybeSingle();

    if (reservaError || !reserva) {
      console.error('Error al obtener reserva:', reservaError);
      return new Response(
        JSON.stringify({ error: 'No se encontró la reserva' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Reserva encontrada:', reserva);
    console.log('Estatus actual:', reserva.id_estatus_reserva);

    // Validar que se puede cancelar
    if (reserva.id_estatus_reserva > 2) {
      return new Response(
        JSON.stringify({ error: 'No se puede cancelar una reserva en progreso o terminada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Caso 1: Estatus Agendada (id=1)
    if (reserva.id_estatus_reserva === 1) {
      console.log('Cancelando reserva agendada');
      const { error: updateError } = await supabase
        .from('reservas')
        .update({ id_estatus_reserva: 5 }) // Cancelada
        .eq('id', reserva_id);

      if (updateError) {
        console.error('Error al cancelar:', updateError);
        throw updateError;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Reserva cancelada exitosamente',
          nuevo_estatus: 5
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Caso 2: Estatus Pagada (id=2)
    if (reserva.id_estatus_reserva === 2) {
      console.log('Reagendando reserva pagada');
      
      // Verificar que existe el acuerdo de pago
      if (!reserva.acuerdos_pago || !reserva.acuerdos_pago[0]) {
        return new Response(
          JSON.stringify({ error: 'No se encontró el acuerdo de pago asociado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const acuerdoPago = reserva.acuerdos_pago[0];
      
      // Iniciar transacción cambiando estatus y creando nueva reserva
      const { error: updateError } = await supabase
        .from('reservas')
        .update({ id_estatus_reserva: 6 }) // Reagendada
        .eq('id', reserva_id);

      if (updateError) {
        console.error('Error al actualizar estatus:', updateError);
        throw updateError;
      }

      // Crear nuevo acuerdo de pago para la nueva reserva
      const { data: nuevoAcuerdo, error: acuerdoError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_concepto: 1, // Concepto de reserva
          id_cuenta_cobranza: acuerdoPago.id_cuenta_cobranza,
          orden: 999, // Se actualizará después
          monto: acuerdoPago.monto,
          pago_completado: true, // Ya está pagado
        })
        .select()
        .single();

      if (acuerdoError || !nuevoAcuerdo) {
        console.error('Error al crear nuevo acuerdo:', acuerdoError);
        // Revertir el cambio de estatus
        await supabase
          .from('reservas')
          .update({ id_estatus_reserva: 2 })
          .eq('id', reserva_id);
        
        throw acuerdoError;
      }

      // Crear la nueva reserva con estatus Pagado
      const { data: nuevaReserva, error: nuevaReservaError } = await supabase
        .from('reservas')
        .insert({
          id_espacio_reservable_edificio: reserva.id_espacio_reservable_edificio,
          id_persona_que_reserva: reserva.id_persona_que_reserva,
          fecha_reserva: reserva.fecha_reserva,
          hora_reserva: reserva.hora_reserva,
          costo_final: reserva.costo_final,
          id_acuerdo_pago: nuevoAcuerdo.id,
          id_estatus_reserva: 2, // Pagada
          activo: true,
        })
        .select()
        .single();

      if (nuevaReservaError || !nuevaReserva) {
        console.error('Error al crear nueva reserva:', nuevaReservaError);
        // Revertir cambios
        await supabase
          .from('reservas')
          .update({ id_estatus_reserva: 2 })
          .eq('id', reserva_id);
        
        await supabase
          .from('acuerdos_pago')
          .delete()
          .eq('id', nuevoAcuerdo.id);
        
        throw nuevaReservaError;
      }

      console.log('Nueva reserva creada:', nuevaReserva.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Reserva reagendada exitosamente. Se creó una nueva reserva con el pago aplicado.',
          nuevo_estatus: 6,
          nueva_reserva_id: nuevaReserva.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Estado de reserva no válido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error en cancelar-reserva:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error al cancelar reserva' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
