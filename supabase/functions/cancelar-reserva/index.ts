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
      
      // Verificar que existe el acuerdo de pago (es un objeto, no array)
      if (!reserva.acuerdos_pago || typeof reserva.acuerdos_pago !== 'object') {
        console.error('No se encontró acuerdo de pago:', reserva.acuerdos_pago);
        return new Response(
          JSON.stringify({ error: 'No se encontró el acuerdo de pago asociado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const acuerdoPagoOriginal = reserva.acuerdos_pago;
      console.log('Acuerdo de pago original:', acuerdoPagoOriginal);
      
      // TRANSACCIÓN: 3 operaciones atómicas
      // 1. Desasociar el acuerdo de pago de la reserva original y cambiar estatus
      const { error: updateReservaError } = await supabase
        .from('reservas')
        .update({ 
          id_estatus_reserva: 6, // Reagendada
          id_acuerdo_pago: null // Desasociar el acuerdo
        })
        .eq('id', reserva_id);

      if (updateReservaError) {
        console.error('Error al actualizar estatus de reserva original:', updateReservaError);
        throw updateReservaError;
      }

      // 2. Crear la nueva reserva con el mismo espacio y asignar el acuerdo de pago original
      const { data: nuevaReserva, error: nuevaReservaError } = await supabase
        .from('reservas')
        .insert({
          id_espacio_reservable_edificio: reserva.id_espacio_reservable_edificio, // Mismo espacio
          id_persona_que_reserva: reserva.id_persona_que_reserva,
          fecha_reserva: reserva.fecha_reserva, // Mantener misma fecha inicialmente
          hora_reserva: reserva.hora_reserva, // Mantener misma hora inicialmente
          costo_final: reserva.costo_final,
          id_acuerdo_pago: acuerdoPagoOriginal.id, // Asignar acuerdo original
          id_estatus_reserva: 2, // Pagada (porque el acuerdo ya está pagado)
          activo: true,
        })
        .select()
        .single();

      if (nuevaReservaError || !nuevaReserva) {
        console.error('Error al crear nueva reserva:', nuevaReservaError);
        // ROLLBACK: Revertir el cambio de estatus y reasociar el acuerdo
        await supabase
          .from('reservas')
          .update({ 
            id_estatus_reserva: 2,
            id_acuerdo_pago: acuerdoPagoOriginal.id
          })
          .eq('id', reserva_id);
        
        throw nuevaReservaError;
      }

      console.log('Nueva reserva creada:', nuevaReserva.id);
      console.log('Acuerdo de pago original reasignado:', acuerdoPagoOriginal.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Reserva reagendada exitosamente. Se creó una nueva reserva con el mismo pago aplicado para el mismo espacio.',
          nuevo_estatus: 6,
          nueva_reserva_id: nuevaReserva.id,
          acuerdo_pago_id: acuerdoPagoOriginal.id
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
