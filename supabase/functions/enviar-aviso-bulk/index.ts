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

    const getSelectedProjectIds = async (idAviso: number): Promise<number[]> => {
      const { data } = await supabaseAdmin
        .from('avisos_proyectos')
        .select('id_proyecto')
        .eq('id_aviso', idAviso)
        .eq('activo', true);

      return (data || []).map((item: any) => item.id_proyecto).filter((id: unknown): id is number => typeof id === 'number');
    };

    const conceptLabelById: Record<number, string> = {
      2: 'enganche',
      5: 'parcialidad',
      4: 'especial',
      3: 'contraentrega',
    };

    const formatMonthName = (value: string | null | undefined) => {
      if (!value) return '';
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-MX', { month: 'long' });
    };

    const resolveTratamiento = (sexo: string | null | undefined) => {
      if (sexo === 'F') return 'Sra.';
      if (sexo === 'M') return 'Sr.';
      return '';
    };

    const filterRecipientsBySelectedProjects = async (
      rawRecipients: { nombre: string; email: string }[],
      selectedProjectIds: number[],
    ) => {
      if (rawRecipients.length === 0 || selectedProjectIds.length === 0) return rawRecipients;

      const recipientEmails = [...new Set(rawRecipients.map((recipient) => recipient.email).filter(Boolean))];
      const { data: usuariosCliente } = await supabaseAdmin
        .from('usuarios')
        .select('email, id_persona')
        .eq('rol_id', 23)
        .eq('activo', true)
        .in('email', recipientEmails)
        .not('id_persona', 'is', null);

      if (!usuariosCliente || usuariosCliente.length === 0) return rawRecipients;

      const personaByEmail = new Map<string, number>();
      const personaIds = [...new Set(
        usuariosCliente
          .filter((usuario: any) => usuario.email && usuario.id_persona)
          .map((usuario: any) => {
            personaByEmail.set(usuario.email, usuario.id_persona);
            return usuario.id_persona;
          })
      )];

      if (personaIds.length === 0) return rawRecipients;

      const { data: ofertas } = await supabaseAdmin
        .from('ofertas')
        .select('id, id_persona_lead')
        .in('id_persona_lead', personaIds);

      if (!ofertas || ofertas.length === 0) return rawRecipients.filter((recipient) => !personaByEmail.has(recipient.email));

      const personaByOferta = new Map<number, number>(ofertas.map((oferta: any) => [oferta.id, oferta.id_persona_lead]));
      const ofertaIds = ofertas.map((oferta: any) => oferta.id);

      const { data: cuentas } = await supabaseAdmin
        .from('cuentas_cobranza')
        .select('id_oferta, id_propiedad')
        .in('id_oferta', ofertaIds)
        .eq('activo', true)
        .not('id_propiedad', 'is', null);

      if (!cuentas || cuentas.length === 0) return rawRecipients.filter((recipient) => !personaByEmail.has(recipient.email));

      const propiedadIds = [...new Set(cuentas.map((cuenta: any) => cuenta.id_propiedad).filter(Boolean))];
      const { data: propiedades } = await supabaseAdmin
        .from('propiedades')
        .select('id, id_edificio_modelo')
        .in('id', propiedadIds);

      if (!propiedades || propiedades.length === 0) return rawRecipients.filter((recipient) => !personaByEmail.has(recipient.email));

      const edificioModeloByPropiedad = new Map<number, number>(
        propiedades
          .filter((propiedad: any) => propiedad.id && propiedad.id_edificio_modelo)
          .map((propiedad: any) => [propiedad.id, propiedad.id_edificio_modelo])
      );

      const edificioModeloIds = [...new Set(propiedades.map((propiedad: any) => propiedad.id_edificio_modelo).filter(Boolean))];
      const { data: edificiosModelos } = await supabaseAdmin
        .from('edificios_modelos')
        .select('id, id_edificio')
        .in('id', edificioModeloIds);

      if (!edificiosModelos || edificiosModelos.length === 0) return rawRecipients.filter((recipient) => !personaByEmail.has(recipient.email));

      const edificioByModelo = new Map<number, number>(edificiosModelos.map((modelo: any) => [modelo.id, modelo.id_edificio]));
      const edificioIds = [...new Set(edificiosModelos.map((modelo: any) => modelo.id_edificio).filter(Boolean))];
      const { data: edificios } = await supabaseAdmin
        .from('edificios')
        .select('id, id_proyecto')
        .in('id', edificioIds);

      if (!edificios || edificios.length === 0) return rawRecipients.filter((recipient) => !personaByEmail.has(recipient.email));

      const proyectoByEdificio = new Map<number, number>(
        edificios
          .filter((edificio: any) => edificio.id && edificio.id_proyecto)
          .map((edificio: any) => [edificio.id, edificio.id_proyecto])
      );

      const allowedEmails = new Set<string>();
      for (const cuenta of cuentas) {
        const personaId = personaByOferta.get(cuenta.id_oferta);
        const propiedadEdificioModeloId = edificioModeloByPropiedad.get(cuenta.id_propiedad);
        const edificioId = propiedadEdificioModeloId ? edificioByModelo.get(propiedadEdificioModeloId) : undefined;
        const proyectoId = edificioId ? proyectoByEdificio.get(edificioId) : undefined;
        if (!personaId || !proyectoId || !selectedProjectIds.includes(proyectoId)) continue;

        for (const [email, mappedPersonaId] of personaByEmail.entries()) {
          if (mappedPersonaId === personaId) allowedEmails.add(email);
        }
      }

      return rawRecipients.filter((recipient) => {
        if (!personaByEmail.has(recipient.email)) return true;
        return allowedEmails.has(recipient.email);
      });
    };

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

    // Si el aviso es de evento, delegamos a evaluar-triggers-evento para que aplique la
    // semántica de whitelist sobre el email del cliente real del acuerdo. Esto evita
    // duplicar lógica y garantiza que el envío manual respete el modo Personalizado y la
    // misma lógica de destinatarios que la corrida automática.
    if ((aviso as any).modo_trigger === 'evento') {
      try {
        const evalUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evaluar-triggers-evento?ignore_window=1`;
        const r = await fetch(evalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ execution_origin: 'manual_explicit', aviso_id }),
        });
        const txt = await r.text();
        let body: any = null;
        try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
        return new Response(JSON.stringify({
          delegated_to: 'evaluar-triggers-evento',
          status: r.status,
          ...body,
        }), {
          status: r.ok ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: `Error delegando a evaluar-triggers-evento: ${(err as Error).message}`,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Use the template ID from the aviso record, fallback to default
    const templateId = aviso.postmark_template_id || 36978552;
    const mensajesWhatsapp = Array.isArray((aviso as any).mensajes_whatsapp)
      ? ((aviso as any).mensajes_whatsapp as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const pickRandomWhatsappMessage = () => {
      if (mensajesWhatsapp.length === 0) return aviso.mensaje_html || '';
      const index = Math.floor(Math.random() * mensajesWhatsapp.length);
      return mensajesWhatsapp[index];
    };

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

    const selectedProjectIds = await getSelectedProjectIds(aviso_id);

    // Extract unique recipients from correos JSON
    const recipientSet = new Set<string>();
    const recipients: { nombre: string; email: string; telefono?: string }[] = [];
    
    for (const row of rolesData) {
      const correos = row.correos as any;
      const destinatarios = correos?.destinatarios || [];
      for (const dest of destinatarios) {
        const email = typeof dest.email === 'string' ? dest.email.trim() : '';
        const telefono = typeof dest.telefono === 'string' ? dest.telefono.trim() : '';
        const key = `${email}|${telefono}`;
        if (email && !recipientSet.has(key)) {
          recipientSet.add(key);
          recipients.push({ nombre: dest.nombre || '', email, telefono });
        }
      }
    }

    const filteredRecipients = await filterRecipientsBySelectedProjects(recipients, selectedProjectIds);

    // Create ejecucion record
    const { data: ejecucion, error: ejErr } = await supabaseAdmin
      .from('avisos_ejecuciones')
      .insert({
        id_aviso: aviso_id,
        tipo_trigger,
        ejecutado_por: ejecutado_por || null,
        total_destinatarios: filteredRecipients.length,
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

    if (filteredRecipients.length === 0) {
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
      return new Response(JSON.stringify({ error: 'No hay destinatarios configurados para los desarrollos seleccionados', ejecucion_id: ejecucion.id }), {
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

    const isPersonalizado = !!(aviso as any).personalizado;

    if (isPersonalizado) {
      let totalEnviados = 0;
      let totalErrores = 0;
      const errorMessages: string[] = [];
      const waToken = Deno.env.get('EVOLUTION_WA_COBRANZA_TOKEN') || '';
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-notificacion`;

      for (const recipient of filteredRecipients) {
        const vars: Record<string, string> = {
          nombre: recipient.nombre || '',
          tratamiento: '',
          email: recipient.email || '',
          telefono: recipient.telefono || '',
          asunto: aviso.asunto || '',
          texto: aviso.mensaje_html || '',
          monto: '',
          fecha_pago: '',
          mes: '',
          orden: '',
          departamento: '',
          producto: '',
          proyecto: '',
          cuenta_id: '',
          offset: '',
        };
        const asuntoPersonalizado = renderStr(aviso.asunto || '', vars);
        const htmlPersonalizado = renderStr(aviso.mensaje_html || '', vars);
        vars.asunto = asuntoPersonalizado;
        vars.texto = htmlPersonalizado;
        const templateModel = (aviso as any).payload_postmark
          ? renderJsonTemplate((aviso as any).payload_postmark, vars)
          : { mensaje: { nombre: vars.nombre, texto: vars.texto, asunto: vars.asunto } };
        const telefono = recipient.telefono?.trim() || null;
        const hasEmail = !!recipient.email;
        const hasTelefono = !!telefono;
        const tipo = hasEmail && hasTelefono ? 'ambos' : hasEmail ? 'email' : hasTelefono ? 'wa' : null;

        if (!tipo) {
          totalErrores++;
          errorMessages.push(JSON.stringify({ email: recipient.email || '', motivo: 'Sin destino válido' }));
          continue;
        }

        const payloadN8N = {
          tipo,
          from: 'Notificaciones Sozu <notificaciones@sozu.com>',
          templateId,
          asunto: asuntoPersonalizado,
          mensaje: (templateModel as any)?.mensaje ?? templateModel,
          mensajeWA: renderStr(pickRandomWhatsappMessage(), vars).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          email: hasEmail ? recipient.email : null,
          telefono: hasTelefono ? telefono : null,
          cc: null,
          origen: 'aviso_bulk_personalizado',
          aviso_id,
          nombre_usuario: recipient.nombre || '',
        };

        try {
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'apikey': waToken,
            },
            body: JSON.stringify(payloadN8N),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            totalErrores++;
            errorMessages.push(JSON.stringify({ email: recipient.email || '', motivo: `n8n ${res.status}: ${txt.slice(0, 200)}` }));
            continue;
          }

          totalEnviados++;
        } catch (err: any) {
          totalErrores++;
          errorMessages.push(JSON.stringify({ email: recipient.email || '', motivo: `Red: ${err.message}` }));
        }
      }

      await supabaseAdmin
        .from('avisos_ejecuciones')
        .update({
          estado: totalErrores > 0 ? (totalEnviados > 0 ? 'completado' : 'error') : 'completado',
          total_enviados: totalEnviados,
          total_errores: totalErrores,
          detalle_error: totalErrores > 0 ? errorMessages.join(' | ') : null,
        })
        .eq('id', ejecucion.id);

      return new Response(JSON.stringify({
        ejecucion_id: ejecucion.id,
        total_destinatarios: filteredRecipients.length,
        total_enviados: totalEnviados,
        total_errores: totalErrores,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send in batches of 500
    let totalEnviados = 0;
    let totalErrores = 0;
    const errorMessages: string[] = [];
    const BATCH_SIZE = 500;

    for (let i = 0; i < filteredRecipients.length; i += BATCH_SIZE) {
      const batch = filteredRecipients.slice(i, i + BATCH_SIZE);
      const messages = batch.map(recipient => {
        const vars: Record<string, string> = {
          nombre: recipient.nombre || '',
          tratamiento: '',
          email: recipient.email || '',
          asunto: aviso.asunto || '',
          texto: aviso.mensaje_html || '',
          monto: '',
          fecha_pago: '',
          mes: '',
          orden: '',
          departamento: '',
          producto: '',
          proyecto: '',
          cuenta_id: '',
          offset: '',
        };
        const templateModel = (aviso as any).payload_postmark
          ? renderJsonTemplate((aviso as any).payload_postmark, vars)
          : { mensaje: { nombre: vars.nombre, texto: vars.texto, asunto: vars.asunto } };
        const mensajeWA = renderStr(pickRandomWhatsappMessage(), vars).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          From: 'notificaciones@sozu.com',
          To: recipient.email,
          TemplateId: templateId,
          TemplateModel: templateModel,
          MessageStream: 'outbound',
          Metadata: { mensajeWA },
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
        total_destinatarios: filteredRecipients.length,
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
