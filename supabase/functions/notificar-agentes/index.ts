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
    const notificationPayload = {
      tipo,
      from: 'Notificaciones Sozu <notificaciones@sozu.com>',
      email: emails,
      telefono: telefonos || undefined,
      mensajeWA,
      asunto: asuntoEmail,
      mensaje: {
        nombre: 'Equipo',
        actividad: asuntoEmail,
        detalles: detallesEmail,
      },
      templateId: 41353048,
    };

    console.log(`Sending notification for ${tipo_evento} to ${filteredUsers.length} users`);

    const notifResponse = await fetch(`${supabaseUrl}/functions/v1/enviar-notificacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    if (!notifResponse.ok) {
      const errText = await notifResponse.text();
      console.error('Error sending notification:', errText);
      return new Response(JSON.stringify({ error: 'Error enviando notificación', detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
