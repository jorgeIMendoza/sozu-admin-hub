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

    // Use the template ID from the aviso record, fallback to default
    const templateId = aviso.postmark_template_id || 36978552;

    // Helper: render {{var}} in any JSON structure
    const renderStr = (s: string, vars: Record<string, string>) =>
      s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? '');
    const renderJsonTemplate = (node: any, vars: Record<string, string>): any => {
      if (node === null || node === undefined) return node;
      if (typeof node === 'string') return renderStr(node, vars);
      if (Array.isArray(node)) return node.map((it) => renderJsonTemplate(it, vars));
      if (typeof node === 'object') {
        const out: Record<string, any> = {};
        for (const k of Object.keys(node)) out[k] = renderJsonTemplate(node[k], vars);
        return out;
      }
      return node;
    };

    // Get recipients from correos JSON field
    const { data: rolesData } = await supabaseAdmin
      .from('avisos_roles_destinatarios')
      .select('id_rol, correos')
      .eq('id_aviso', aviso_id);

    if (!rolesData || rolesData.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay roles destinatarios configurados' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract unique recipients from correos JSON
    const emailSet = new Set<string>();
    const recipients: { nombre: string; email: string }[] = [];
    
    for (const row of rolesData) {
      const correos = row.correos as any;
      const destinatarios = correos?.destinatarios || [];
      for (const dest of destinatarios) {
        if (dest.email && !emailSet.has(dest.email)) {
          emailSet.add(dest.email);
          recipients.push({ nombre: dest.nombre || '', email: dest.email });
        }
      }
    }

    // Create ejecucion record
    const { data: ejecucion, error: ejErr } = await supabaseAdmin
      .from('avisos_ejecuciones')
      .insert({
        id_aviso: aviso_id,
        tipo_trigger,
        ejecutado_por: ejecutado_por || null,
        total_destinatarios: recipients.length,
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

    if (recipients.length === 0) {
      await supabaseAdmin
        .from('avisos_ejecuciones')
        .update({ 
          estado: 'error', 
          total_enviados: 0, 
          total_errores: 0,
          detalle_error: 'No hay destinatarios configurados para este aviso. Edite el aviso y agregue al menos un destinatario.',
        })
        .eq('id', ejecucion.id);

      console.error(`Aviso ${aviso_id}: No hay destinatarios configurados`);
      return new Response(JSON.stringify({ error: 'No hay destinatarios configurados', ejecucion_id: ejecucion.id }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    const errorMessages: string[] = [];
    const BATCH_SIZE = 500;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const messages = batch.map(recipient => {
        const vars: Record<string, string> = {
          nombre: recipient.nombre || '',
          email: recipient.email || '',
          asunto: aviso.asunto || '',
          texto: aviso.mensaje_html || '',
        };
        const templateModel = (aviso as any).payload_postmark
          ? renderJsonTemplate((aviso as any).payload_postmark, vars)
          : { mensaje: { nombre: vars.nombre, texto: vars.texto, asunto: vars.asunto } };
        return {
          From: 'notificaciones@sozu.com',
          To: recipient.email,
          TemplateId: templateId,
          TemplateModel: templateModel,
          MessageStream: 'outbound',
        };
      });

      try {
        const res = await fetch('https://api.postmarkapp.com/email/batchWithTemplates', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({ Messages: messages }),
        });

        const results = await res.json();
        console.log('Postmark response status:', res.status, 'body:', JSON.stringify(results).substring(0, 500));

        const messageResults = Array.isArray(results) ? results : (results?.Messages || []);
        if (messageResults.length > 0) {
          messageResults.forEach((r: any) => {
            if (r.ErrorCode === 0) {
              totalEnviados++;
            } else {
              totalErrores++;
              // Translate common Postmark errors to Spanish
              let reason = r.Message || 'Error desconocido';
              if (r.ErrorCode === 406) {
                reason = 'Correo inactivo (rebote previo o queja de spam)';
              } else if (r.ErrorCode === 300) {
                reason = 'Correo inválido';
              } else if (r.ErrorCode === 405) {
                reason = 'No permitido enviar a este destinatario';
              }
              errorMessages.push(JSON.stringify({ email: r.To || '', codigo: r.ErrorCode, motivo: reason }));
              console.error('Postmark email error:', { to: r.To, errorCode: r.ErrorCode, message: r.Message });
            }
          });
        } else {
          console.error('Postmark unexpected response:', JSON.stringify(results).substring(0, 500));
          errorMessages.push('Respuesta inesperada de Postmark');
          totalErrores += batch.length;
        }
      } catch (err) {
        console.error('Postmark batch error:', err);
        errorMessages.push(`Error de red: ${err.message}`);
        totalErrores += batch.length;
      }
    }

    const detalleError = totalErrores > 0 
      ? errorMessages.join(' | ') 
      : null;

    await supabaseAdmin
      .from('avisos_ejecuciones')
      .update({
        estado: totalErrores > 0 ? (totalEnviados > 0 ? 'completado' : 'error') : 'completado',
        total_enviados: totalEnviados,
        total_errores: totalErrores,
        detalle_error: detalleError,
      })
      .eq('id', ejecucion.id);

    return new Response(JSON.stringify({
      ejecucion_id: ejecucion.id,
      total_destinatarios: recipients.length,
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
