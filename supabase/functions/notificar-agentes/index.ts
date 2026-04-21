import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface NotificarRequest {
  tipo_evento: string;
  id_proyecto: number;
  datos?: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: NotificarRequest = await req.json();
    const { tipo_evento, id_proyecto, datos = {} } = body;

    if (!tipo_evento || !id_proyecto) {
      return new Response(JSON.stringify({ error: 'tipo_evento e id_proyecto son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get notification config
    const { data: config, error: configErr } = await supabaseAdmin
      .from('notificaciones_configuracion')
      .select('*')
      .eq('tipo_evento', tipo_evento)
      .single();

    if (configErr || !config) {
      console.log(`No config found for event: ${tipo_evento}`);
      return new Response(JSON.stringify({ message: 'Evento no configurado' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!config.activo) {
      console.log(`Event ${tipo_evento} is disabled`);
      return new Response(JSON.stringify({ message: 'Notificación desactivada' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get project name if not provided
    let nombreDesarrollo = datos.nombre_desarrollo || '';
    if (!nombreDesarrollo) {
      const { data: proyecto } = await supabaseAdmin
        .from('proyectos')
        .select('nombre')
        .eq('id', id_proyecto)
        .single();
      nombreDesarrollo = proyecto?.nombre || `Proyecto #${id_proyecto}`;
    }

    // 3. Get recipients by role
    const rolesDestino: number[] = config.roles_destino || [1, 3, 9];

    // Get all active users with target roles
    const { data: usuarios, error: usrErr } = await supabaseAdmin
      .from('usuarios')
      .select('email, telefono, clave_pais_telefono, rol_id')
      .in('rol_id', rolesDestino)
      .eq('activo', true);

    if (usrErr || !usuarios || usuarios.length === 0) {
      console.log('No recipients found');
      return new Response(JSON.stringify({ message: 'Sin destinatarios' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Filter by project access if required
    let filteredUsers = usuarios;
    if (config.requiere_acceso_proyecto) {
      // Get users with access to this project
      const { data: accesos } = await supabaseAdmin
        .from('proyectos_acceso')
        .select('usuario_id')
        .eq('proyecto_id', id_proyecto)
        .eq('activo', true);

      const emailsConAcceso = new Set((accesos || []).map(a => a.usuario_id));

      filteredUsers = usuarios.filter(u => {
        // Super Admin (rol_id = 1) always receives notifications
        if (u.rol_id === 1) return true;
        // Others need project access
        return emailsConAcceso.has(u.email);
      });
    }

    if (filteredUsers.length === 0) {
      console.log('No recipients after project access filter');
      return new Response(JSON.stringify({ message: 'Sin destinatarios con acceso' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Get country phone codes
    const { data: paises } = await supabaseAdmin
      .from('paises')
      .select('id, clave_pais_telefono')
      .eq('activo', true);

    const codigosPorPais = new Map(
      (paises || []).map((p: { id: string; clave_pais_telefono: string | null }) => [
        p.id.trim(),
        p.clave_pais_telefono?.trim(),
      ])
    );

    // 6. Replace placeholders in templates
    const replacePlaceholders = (template: string) => {
      let result = template;
      result = result.replace(/\{nombre_desarrollo\}/g, nombreDesarrollo);
      result = result.replace(/\{nombre_esquema\}/g, datos.nombre_esquema || '');
      // Replace any other custom datos
      for (const [key, value] of Object.entries(datos)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      return result;
    };

    const mensajeWA = replacePlaceholders(config.plantilla_wa);
    const asuntoEmail = replacePlaceholders(config.asunto_email);
    const detallesEmail = replacePlaceholders(config.plantilla_email_detalles);

    // 6.b Build dynamic templateModel for Postmark from mapeo_variables_postmark
    // mapeo_variables_postmark example (supports nested objects to mirror Postmark template structure):
    //   { "mensaje": { "proyecto": "{nombre_desarrollo}" }, "id_proyecto": "{id_proyecto}" }
    const mapeoVars: Record<string, unknown> = (config.mapeo_variables_postmark || {}) as Record<string, unknown>;
    // Recursively resolve placeholders preserving the nested object shape.
    const resolveMapping = (value: unknown): unknown => {
      if (typeof value === 'string') return replacePlaceholders(value);
      if (Array.isArray(value)) return value.map(resolveMapping);
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out[k] = resolveMapping(v);
        }
        return out;
      }
      return value;
    };
    const templateModel: Record<string, unknown> = {};
    // Always include base fallbacks so legacy templates keep working
    templateModel['nombre'] = 'Equipo';
    templateModel['actividad'] = asuntoEmail;
    templateModel['detalles'] = detallesEmail;
    // Apply user-defined mapping (supports nested objects)
    for (const [postmarkVar, valueExpr] of Object.entries(mapeoVars)) {
      templateModel[postmarkVar] = resolveMapping(valueExpr);
    }
    // Provide id_proyecto as a built-in token if mapped
    templateModel['id_proyecto'] = templateModel['id_proyecto'] || String(id_proyecto);

    // 7. Build email and phone lists
    const emails = filteredUsers.map(u => u.email).filter(Boolean).join(',');

    const isValidPhone = (tel: string | null) => tel && tel.replace(/\D/g, '').length >= 10;

    const telefonos = filteredUsers
      .filter(u => isValidPhone(u.telefono))
      .map(u => {
        const clavePais = (u.clave_pais_telefono || 'MX').trim();
        const codigoPais = codigosPorPais.get(clavePais) || '+52';
        return `${codigoPais}${u.telefono}`;
      })
      .join(',');

    // Determine channel
    let tipo = config.canal; // 'email' | 'whatsapp' | 'ambos'
    if (tipo === 'whatsapp' && !telefonos) {
      tipo = 'email'; // Fallback to email if no valid phones
    }
    if (tipo === 'ambos' && !telefonos) {
      tipo = 'email';
    }

    // 8. Send notification via enviar-notificacion
    // IMPORTANT: n8n construye el TemplateModel de Postmark de la siguiente forma:
    //   TemplateModel = { asunto, nombre_usuario, mensaje: <campo `mensaje` del payload> }
    // Por lo tanto, el campo `mensaje` del payload NO debe contener el templateModel completo,
    // sino exactamente el contenido que la plantilla espera bajo {{mensaje.*}}.
    // Si el usuario mapeó una variable raíz llamada "mensaje" (objeto), usamos ese objeto tal cual.
    // Si no, caemos al legacy { nombre, actividad, detalles } para no romper plantillas viejas.
    const mensajeParaN8N: Record<string, unknown> | string =
      (templateModel['mensaje'] && typeof templateModel['mensaje'] === 'object')
        ? (templateModel['mensaje'] as Record<string, unknown>)
        : {
            nombre: 'Equipo',
            actividad: asuntoEmail,
            detalles: detallesEmail,
          };

    const notificationPayload = {
      tipo,
      from: 'Notificaciones Sozu <notificaciones@sozu.com>',
      email: emails,
      telefono: telefonos || undefined,
      mensajeWA,
      asunto: asuntoEmail,
      // n8n inyecta este `mensaje` directamente como TemplateModel.mensaje en Postmark.
      // Debe ser el subobjeto plano (ej. { proyecto: "Monócolo" }) para que
      // {{mensaje.proyecto}} en la plantilla se resuelva correctamente.
      mensaje: mensajeParaN8N,
      templateId: config.postmark_template_id || 41353048,
      templateModel,
    };

    console.log(`Sending notification for ${tipo_evento} to ${filteredUsers.length} users`);

    console.log('Notification payload:', JSON.stringify(notificationPayload));
    const incomingAuthHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const evolutionWaToken = Deno.env.get('EVOLUTION_WA_COBRANZA_TOKEN');

    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY no configurada');
    }

    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': incomingAuthHeader || `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    };

    if (evolutionWaToken) {
      webhookHeaders['apikey'] = evolutionWaToken;
      console.log('EVOLUTION_WA_COBRANZA_TOKEN included in headers as apikey');
    } else {
      console.warn('EVOLUTION_WA_COBRANZA_TOKEN not configured - WhatsApp may fail with 401');
    }

    const notifResponse = await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(notificationPayload),
    });

    if (!notifResponse.ok) {
      const errText = await notifResponse.text();
      console.error('Error sending notification:', errText);

      // Log error
      await supabaseAdmin.from('notificaciones_log').insert({
        tipo_evento,
        canal: tipo,
        destinatarios_count: filteredUsers.length,
        id_proyecto: id_proyecto,
        nombre_desarrollo: nombreDesarrollo,
        payload: notificationPayload,
        resultado: 'error',
        error_detalle: errText,
      });

      return new Response(JSON.stringify({ error: 'Error enviando notificación', detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log success
    await supabaseAdmin.from('notificaciones_log').insert({
      tipo_evento,
      canal: tipo,
      destinatarios_count: filteredUsers.length,
      id_proyecto: id_proyecto,
      nombre_desarrollo: nombreDesarrollo,
      payload: notificationPayload,
      resultado: 'success',
    });

    return new Response(JSON.stringify({
      success: true,
      destinatarios: filteredUsers.length,
      canal: tipo,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in notificar-agentes:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
