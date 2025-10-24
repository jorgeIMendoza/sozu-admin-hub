import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { id_propiedad, id_persona } = await req.json();
    
    // Obtener el usuario del token de autorización
    const authHeader = req.headers.get('Authorization');
    let email_usuario = 'jorge.mendoza@sozu.com'; // Usuario por defecto (mismo que en NewOfferDialog)
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      if (user?.email) {
        email_usuario = user.email;
      }
    }

    console.log('🔄 Iniciando proceso de asignación de propiedad:', { id_propiedad, id_persona, email_usuario });

    // Validar que se proporcionen los datos necesarios
    if (!id_propiedad || !id_persona) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Faltan datos requeridos: id_propiedad, id_persona' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1. Validar que la propiedad existe y está activa
    const { data: propiedad, error: propiedadError } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        id_estatus_disponibilidad,
        id_entidad_relacionada_dueno,
        activo
      `)
      .eq('id', id_propiedad)
      .eq('activo', true)
      .single();

    if (propiedadError || !propiedad) {
      console.error('❌ Error al obtener propiedad:', propiedadError);
      return new Response(
        JSON.stringify({ success: false, message: 'La propiedad no existe o no está activa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 1b. Obtener el proyecto de la entidad relacionada
    const { data: entidadRelacionada, error: entidadError } = await supabase
      .from('entidades_relacionadas')
      .select(`
        id_proyecto,
        proyectos!entidades_relacionadas_id_proyecto_fkey(id, nombre)
      `)
      .eq('id', propiedad.id_entidad_relacionada_dueno)
      .single();

    if (entidadError || !entidadRelacionada) {
      console.error('❌ Error al obtener entidad relacionada:', entidadError);
      return new Response(
        JSON.stringify({ success: false, message: 'No se pudo obtener el proyecto de la propiedad' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const proyecto = (entidadRelacionada.proyectos as any);
    if (!proyecto) {
      return new Response(
        JSON.stringify({ success: false, message: 'No se pudo obtener el proyecto de la propiedad' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Validar que la propiedad esté en estatus "Disponible" (2) o "Listo" (3)
    if (propiedad.id_estatus_disponibilidad !== 2 && propiedad.id_estatus_disponibilidad !== 3) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Solo se pueden asignar propiedades en estatus "Disponible" o "Listo"' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar que no tenga cuenta de cobranza activa
    const { data: ofertasExistentes } = await supabase
      .from('ofertas')
      .select('id')
      .eq('id_propiedad', id_propiedad)
      .eq('activo', true);

    if (ofertasExistentes && ofertasExistentes.length > 0) {
      const ofertaIds = ofertasExistentes.map(o => o.id);
      
      const { data: cuentaExistente } = await supabase
        .from('cuentas_cobranza')
        .select('id')
        .in('id_oferta', ofertaIds)
        .eq('activo', true)
        .maybeSingle();

      if (cuentaExistente) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Esta propiedad ya tiene una cuenta de cobranza activa' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // 2. Validar que la persona existe y es del tipo "Comprador" (id_tipo_entidad = 2)
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select(`
        id,
        nombre_legal,
        entidades_relacionadas!entidades_relacionadas_id_persona_fkey(
          id_tipo_entidad
        )
      `)
      .eq('id', id_persona)
      .eq('activo', true)
      .single();

    if (personaError || !persona) {
      console.error('❌ Error al obtener persona:', personaError);
      return new Response(
        JSON.stringify({ success: false, message: 'La persona no existe o no está activa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Validar que sea comprador
    const esComprador = persona.entidades_relacionadas?.some(
      (er: any) => er.id_tipo_entidad === 2
    );

    if (!esComprador) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'La persona seleccionada no es un comprador' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 3. Generar siglas de la persona
    const nombrePalabras = persona.nombre_legal.trim().split(/\s+/);
    const siglas = nombrePalabras
      .map((palabra: string) => palabra.charAt(0).toUpperCase())
      .join('');

    const nombreEsquema = `asignacion_${propiedad.numero_propiedad}_${proyecto.nombre}_${siglas}`;
    
    console.log('📝 Creando esquema de pago:', nombreEsquema);

    // 5. Crear esquema de pago manual
    const { data: esquemaPago, error: esquemaError } = await supabase
      .from('esquemas_pago')
      .insert({
        nombre: nombreEsquema,
        id_proyecto: proyecto.id,
        porcentaje_enganche: 0,
        porcentaje_mensualidades: 0,
        porcentaje_entrega: 0,
        numero_mensualidades: 0,
        porcentaje_descuento_aumento: 0,
        es_manual: true,
        activo: true
      })
      .select('id')
      .single();

    if (esquemaError || !esquemaPago) {
      console.error('❌ Error al crear esquema de pago:', esquemaError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Error al crear el esquema de pago',
          error: esquemaError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ Esquema de pago creado:', esquemaPago.id);

    // 6. Crear oferta
    const { data: oferta, error: ofertaError } = await supabase
      .from('ofertas')
      .insert({
        id_propiedad: id_propiedad,
        id_persona_lead: id_persona,
        id_esquema_pago_seleccionado: esquemaPago.id,
        email_creador: email_usuario,
        // No especificar fecha_generacion para usar el default de la base de datos (CURRENT_TIMESTAMP)
        activo: true
      })
      .select('id')
      .single();

    if (ofertaError || !oferta) {
      console.error('❌ Error al crear oferta:', ofertaError);
      // Rollback: eliminar esquema de pago
      await supabase.from('esquemas_pago').delete().eq('id', esquemaPago.id);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Error al crear la oferta',
          error: ofertaError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ Oferta creada:', oferta.id);

    // 7. Crear cuenta de cobranza
    const { data: cuentaCobranza, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .insert({
        id_oferta: oferta.id,
        precio_final: 0,
        porcentaje_comision_venta: 0,
        valor_uma: null,
        clabe_stp: null,
        es_aprobado: true,
        fecha_compra: new Date().toISOString().split('T')[0],
        activo: true
      })
      .select('id')
      .single();

    if (cuentaError || !cuentaCobranza) {
      console.error('❌ Error al crear cuenta de cobranza:', cuentaError);
      // Rollback: eliminar oferta y esquema
      await supabase.from('ofertas').delete().eq('id', oferta.id);
      await supabase.from('esquemas_pago').delete().eq('id', esquemaPago.id);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Error al crear la cuenta de cobranza',
          error: cuentaError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ Cuenta de cobranza creada:', cuentaCobranza.id);

    // 8. Crear acuerdo de pago
    const { error: acuerdoError } = await supabase
      .from('acuerdos_pago')
      .insert({
        id_cuenta_cobranza: cuentaCobranza.id,
        id_concepto: 15, // Asignación
        monto: 0,
        fecha_pago: new Date().toISOString().split('T')[0],
        orden: 1,
        pago_completado: true,
        activo: true
      });

    if (acuerdoError) {
      console.error('❌ Error al crear acuerdo de pago:', acuerdoError);
      // Rollback: eliminar cuenta, oferta y esquema
      await supabase.from('cuentas_cobranza').delete().eq('id', cuentaCobranza.id);
      await supabase.from('ofertas').delete().eq('id', oferta.id);
      await supabase.from('esquemas_pago').delete().eq('id', esquemaPago.id);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Error al crear el acuerdo de pago',
          error: acuerdoError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ Acuerdo de pago creado');

    // 9. Actualizar estatus de la propiedad a "Asignado" (id=10)
    const { error: updatePropiedadError } = await supabase
      .from('propiedades')
      .update({
        id_estatus_disponibilidad: 10, // Asignado
        fecha_actualizacion: new Date().toISOString()
      })
      .eq('id', id_propiedad);

    if (updatePropiedadError) {
      console.error('❌ Error al actualizar estatus de propiedad:', updatePropiedadError);
      // No hacer rollback completo, solo logear el error
      console.warn('⚠️ La propiedad no se actualizó pero el resto del proceso se completó');
    } else {
      console.log('✅ Estatus de propiedad actualizado a "Asignado"');
    }

    // 10. Insertar comprador
    const { error: compradorError } = await supabase
      .from('compradores')
      .insert({
        id_cuenta_cobranza: cuentaCobranza.id,
        id_persona: id_persona,
        porcentaje_copropiedad: 100,
        activo: true
      });

    if (compradorError) {
      console.error('❌ Error al insertar comprador:', compradorError);
      // No hacer rollback, solo logear
      console.warn('⚠️ El comprador no se insertó pero el resto del proceso se completó');
    } else {
      console.log('✅ Comprador insertado correctamente');
    }

    console.log('🎉 Proceso de asignación completado exitosamente');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Propiedad asignada exitosamente',
        cuenta_cobranza_id: cuentaCobranza.id,
        oferta_id: oferta.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Error general en asignación de propiedad:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error interno del servidor',
        error: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
