import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { aviso_id, ejecutado_por, tipo_trigger = 'manual' } = await req.json();

    if (!aviso_id) {
      return new Response(JSON.stringify({ error: 'aviso_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get aviso
    const { data: aviso, error: avisoErr } = await supabaseAdmin
      .from('avisos')
      .select('*')
      .eq('id', aviso_id)
      .single();

    if (avisoErr || !aviso) {
      return new Response(JSON.stringify({ error: 'Aviso no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get target role IDs
    const { data: rolesData } = await supabaseAdmin
      .from('avisos_roles_destinatarios')
      .select('rol_id')
      .eq('aviso_id', aviso_id);

    const rolIds = rolesData?.map(r => r.rol_id) || [];

    if (rolIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay roles destinatarios configurados' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get emails from usuarios table
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('email')
      .in('rol_id', rolIds)
      .eq('activo', true)
      .not('email', 'is', null);

    const emails = usuarios?.map(u => u.email).filter(Boolean) || [];

    // Create ejecucion record
    const { data: ejecucion, error: ejErr } = await supabaseAdmin
      .from('avisos_ejecuciones')
      .insert({
        aviso_id,
        tipo_trigger,
        ejecutado_por: ejecutado_por || null,
        total_destinatarios: emails.length,
        estado: 'enviando',
      })
      .select('id')
      .single();

    if (ejErr) {
      console.error('Error creating ejecucion:', ejErr);
      return new Response(JSON.stringify({ error: 'Error al registrar ejecución' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (emails.length === 0) {
      await supabaseAdmin
        .from('avisos_ejecuciones')
        .update({ estado: 'completado', total_enviados: 0, total_errores: 0 })
        .eq('id', ejecucion.id);

      return new Response(JSON.stringify({ message: 'No hay destinatarios', ejecucion_id: ejecucion.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
    if (!POSTMARK_TOKEN) {
      await supabaseAdmin
        .from('avisos_ejecuciones')
        .update({ estado: 'error', detalle_error: 'POSTMARK_SERVER_TOKEN no configurado' })
        .eq('id', ejecucion.id);

      return new Response(JSON.stringify({ error: 'Token de Postmark no configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send in batches of 500
    let totalEnviados = 0;
    let totalErrores = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const messages = batch.map(email => ({
        From: 'notificaciones@sozu.mx',
        To: email,
        Subject: aviso.asunto,
        HtmlBody: aviso.mensaje_html,
        MessageStream: 'outbound',
      }));

      try {
        const res = await fetch('https://api.postmarkapp.com/email/batch', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify(messages),
        });

        const results = await res.json();

        if (Array.isArray(results)) {
          results.forEach((r: any) => {
            if (r.ErrorCode === 0) totalEnviados++;
            else totalErrores++;
          });
        } else {
          totalErrores += batch.length;
        }
      } catch (err) {
        console.error('Postmark batch error:', err);
        totalErrores += batch.length;
      }
    }

    await supabaseAdmin
      .from('avisos_ejecuciones')
      .update({
        estado: totalErrores > 0 ? (totalEnviados > 0 ? 'completado' : 'error') : 'completado',
        total_enviados: totalEnviados,
        total_errores: totalErrores,
        detalle_error: totalErrores > 0 ? `${totalErrores} emails fallaron` : null,
      })
      .eq('id', ejecucion.id);

    return new Response(JSON.stringify({
      ejecucion_id: ejecucion.id,
      total_destinatarios: emails.length,
      total_enviados: totalEnviados,
      total_errores: totalErrores,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
