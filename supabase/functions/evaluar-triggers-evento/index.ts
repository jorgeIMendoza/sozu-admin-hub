import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getMexicoTime(): Date {
  const now = new Date();
  const mexicoOffset = -6 * 60;
  const utcOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (utcOffset + mexicoOffset) * 60000);
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Solo dispara DESDE hora_envio hasta hora_envio + toleranceMin minutos.
// Nunca antes de la hora configurada.
function withinSendWindow(horaEnvio: string, mexNow: Date, toleranceMin = 2): boolean {
  const [h, m] = horaEnvio.split(':').map(Number);
  const target = new Date(mexNow);
  target.setHours(h, m || 0, 0, 0);
  const diffMin = (mexNow.getTime() - target.getTime()) / 60000;
  return diffMin >= 0 && diffMin <= toleranceMin;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

// Recursively render any JSON-like structure, replacing {{var}} in strings.
function renderJsonTemplate(node: any, vars: Record<string, string>): any {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string') return renderTemplate(node, vars);
  if (Array.isArray(node)) return node.map((it) => renderJsonTemplate(it, vars));
  if (typeof node === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(node)) out[k] = renderJsonTemplate(node[k], vars);
    return out;
  }
  return node;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const summary: any = { evaluated: 0, triggers: 0, sent: 0, skipped: 0, errors: 0, details: [] as any[] };

  try {
    // Optional debug flags via query string:
    //   ?ignore_window=1   → bypass hora_envio window check
    //   ?dry_run=1         → run query path but skip sending emails/whatsapp
    const url = new URL(req.url);
    const ignoreWindow = url.searchParams.get('ignore_window') === '1';
    const dryRun = url.searchParams.get('dry_run') === '1';
    const overrideOffsetParam = url.searchParams.get('override_offset');
    const overrideOffset = overrideOffsetParam !== null ? Number(overrideOffsetParam) : null;

    const mexNow = getMexicoTime();
    const tag = `[${fmtTime(mexNow)} MX]`;
    console.log(`${tag} evaluar-triggers-evento iniciando (ignoreWindow=${ignoreWindow}, dryRun=${dryRun})`);

    // Load all active event triggers + their aviso
    const { data: triggers, error: tErr } = await supabaseAdmin
      .from('avisos_triggers_evento')
      .select(`
        id, id_aviso, id_fuente, offsets_dias, hora_envio, canal, filtros, activo,
        avisos:avisos!inner ( id, nombre, asunto, mensaje_html, postmark_template_id, activo, modo_trigger, payload_postmark ),
        fuente:aviso_triggers_fuentes!inner ( id, clave, activo )
      `)
      .eq('activo', true);

    if (tErr) {
      console.error(`${tag} error cargando triggers:`, tErr);
      return new Response(JSON.stringify({ error: tErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    summary.triggers = triggers?.length || 0;
    console.log(`${tag} triggers activos: ${summary.triggers}`);

    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');

    for (const trig of triggers || []) {
      const aviso: any = (trig as any).avisos;
      const fuente: any = (trig as any).fuente;

      if (!aviso?.activo || aviso?.modo_trigger !== 'evento' || !fuente?.activo) {
        summary.skipped++;
        continue;
      }

      if (!ignoreWindow && !withinSendWindow(trig.hora_envio as string, mexNow)) {
        console.log(`${tag} trigger ${trig.id} (aviso "${aviso.nombre}"): fuera de ventana hora_envio=${trig.hora_envio}`);
        summary.skipped++;
        continue;
      }

      // Cargar correos manuales configurados en avisos_roles_destinatarios para este aviso.
      // Estos correos siempre reciben copia cuando hay un envío disparado por evento.
      const { data: rolesDest } = await supabaseAdmin
        .from('avisos_roles_destinatarios')
        .select('correos')
        .eq('id_aviso', aviso.id);
      const manualEmails: { email: string; nombre: string }[] = [];
      for (const r of rolesDest || []) {
        const c: any = (r as any).correos;
        const lista = Array.isArray(c) ? c : (Array.isArray(c?.destinatarios) ? c.destinatarios : []);
        for (const d of lista) {
          const email = typeof d === 'string' ? d : d?.email;
          const nombre = typeof d === 'string' ? '' : (d?.nombre || '');
          if (email && typeof email === 'string' && email.includes('@')) {
            if (!manualEmails.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
              manualEmails.push({ email: email.trim(), nombre });
            }
          }
        }
      }
      if (manualEmails.length > 0) {
        console.log(`${tag} trigger ${trig.id}: ${manualEmails.length} correo(s) manual(es) recibirán copia`);
      }

      const offsets: number[] = (trig.offsets_dias as number[]) || [];
      const effectiveOffsets = overrideOffset !== null && !Number.isNaN(overrideOffset) ? [overrideOffset] : offsets;
      if (effectiveOffsets.length === 0) { summary.skipped++; continue; }

      for (const offset of effectiveOffsets) {
        // UI semantics: negative offset = send N days BEFORE the due date (reminders),
        // positive offset = send N days AFTER the due date (overdue notices).
        // Therefore fecha_objetivo = today - offset
        //   offset = -3 → fecha_pago = today + 3 (reminder 3 days before)
        //   offset = +5 → fecha_pago = today - 5 (overdue 5 days after)
        const target = new Date(mexNow);
        target.setDate(target.getDate() - offset);
        const fechaObjetivo = ymd(target);
        summary.evaluated++;

        // Resolve recipients depending on fuente
        const isProximo = fuente.clave === 'acuerdo_pago_proximo';
        const isVencido = fuente.clave === 'acuerdo_pago_vencido';

        if (!isProximo && !isVencido) {
          console.log(`${tag} fuente "${fuente.clave}" no soportada en V1`);
          continue;
        }

        // Both sources query the same table; semantic difference is the offset sign chosen by the user
        // Build query
        let q = supabaseAdmin
          .from('acuerdos_pago')
          .select(`
            id, fecha_pago, monto, orden, id_concepto, id_cuenta_cobranza, activo, pago_completado,
            cuentas_cobranza:cuentas_cobranza!fk_acpago_cuenta!inner (
              id,
              ofertas:ofertas!fk_ccob_oferta!inner (
                id,
                personas:personas!fk_ofertas_persona_lead!inner ( id, nombre_legal, email, telefono, clave_pais_telefono )
              )
            )
          `)
          .eq('activo', true)
          .eq('pago_completado', false)
          .eq('fecha_pago', fechaObjetivo);

        // Optional concepto filter
        const filtros: any = trig.filtros || {};
        if (Array.isArray(filtros.id_concepto) && filtros.id_concepto.length > 0) {
          q = q.in('id_concepto', filtros.id_concepto);
        }

        // Modo prueba/auditoría:
        //   filtros.email_override: redirige TODOS los envíos a ese correo (ignora email del cliente)
        //   filtros.bcc: lista de correos en copia oculta
        const emailOverride: string | null = typeof filtros.email_override === 'string' && filtros.email_override.includes('@')
          ? filtros.email_override.trim()
          : null;
        const bccList: string[] = Array.isArray(filtros.bcc)
          ? filtros.bcc.filter((e: any) => typeof e === 'string' && e.includes('@'))
          : (typeof filtros.bcc === 'string' && filtros.bcc.includes('@') ? [filtros.bcc] : []);

        const { data: rows, error: qErr } = await q;
        if (qErr) {
          console.error(`${tag} trigger ${trig.id} offset ${offset}: query error`, qErr);
          summary.details.push({ trigger_id: trig.id, offset, fecha_objetivo: fechaObjetivo, query_error: (qErr as any).message || String(qErr), code: (qErr as any).code || null });
          summary.errors++;
          continue;
        }

        console.log(`${tag} trigger ${trig.id} offset ${offset} fecha=${fechaObjetivo} → ${rows?.length || 0} acuerdos`);

        for (const ac of rows || []) {
          const cc: any = (ac as any).cuentas_cobranza;
          const persona: any = cc?.ofertas?.personas;
          if (!persona) continue;

          const claveEntidad = `acuerdo:${ac.id}:offset:${offset}`;
          const channel = trig.canal as string;

          // Resolver destinatario real considerando override
          const emailReal = emailOverride || persona.email || null;

          // Build template variables
          const vars: Record<string, string> = {
            nombre: persona.nombre_legal || '',
            email: persona.email || '',
            telefono: persona.telefono ? `${persona.clave_pais_telefono || ''}${persona.telefono}` : '',
            monto: fmtMoney(Number(ac.monto || 0)),
            fecha_pago: fmtDate(ac.fecha_pago as string),
            orden: String(ac.orden || ''),
            offset: String(offset),
            cuenta_id: String(cc.id),
            asunto: '',
            texto: '',
          };

          const renderedAsunto = renderTemplate(aviso.asunto || '', vars);
          const renderedHtml = renderTemplate(aviso.mensaje_html || '', vars);
          vars.asunto = renderedAsunto;
          vars.texto = renderedHtml;

          // Build TemplateModel: custom payload if defined, else classic
          const templateModel = aviso.payload_postmark
            ? renderJsonTemplate(aviso.payload_postmark, vars)
            : { mensaje: { nombre: persona.nombre_legal || '', texto: renderedHtml, asunto: renderedAsunto } };

          // Idempotent insert FIRST
          const { data: ins, error: insErr } = await supabaseAdmin
            .from('avisos_envios_evento')
            .insert({
              id_aviso: aviso.id,
              id_trigger: trig.id,
              clave_entidad: claveEntidad,
              fecha_objetivo: fechaObjetivo,
              email_destino: emailReal,
              telefono_destino: persona.telefono ? `${persona.clave_pais_telefono || ''}${persona.telefono}` : null,
              canal: channel,
              estado: 'enviando',
            })
            .select('id')
            .single();

          if (insErr) {
            // Unique violation = ya enviado, lo ignoramos silenciosamente
            if ((insErr as any).code === '23505') {
              console.log(`${tag} ${claveEntidad}: ya enviado previamente, omitiendo`);
            } else {
              console.error(`${tag} insert error ${claveEntidad}:`, insErr);
              summary.errors++;
            }
            continue;
          }

          let okEmail = true, okWa = true;
          let errMsg = '';

          if (dryRun) {
            await supabaseAdmin
              .from('avisos_envios_evento')
              .update({ estado: 'simulado', error: 'dry_run', payload_enviado: templateModel })
              .eq('id', ins.id);
            summary.details.push({ trigger_id: trig.id, clave_entidad: claveEntidad, estado: 'simulado', email: emailReal, telefono: persona.telefono, override: !!emailOverride, bcc: bccList });
            summary.sent++;
            continue;
          }

          // EMAIL
          if ((channel === 'email' || channel === 'ambos') && emailReal) {
            if (!POSTMARK_TOKEN) { okEmail = false; errMsg += 'POSTMARK_SERVER_TOKEN faltante; '; }
            else {
              try {
                const templateId = aviso.postmark_template_id || 36978552;
                const postmarkBody: any = {
                  From: 'notificaciones@sozu.com',
                  To: emailReal,
                  TemplateId: templateId,
                  TemplateModel: templateModel,
                  MessageStream: 'outbound',
                };
                if (bccList.length > 0) postmarkBody.Bcc = bccList.join(',');
                const res = await fetch('https://api.postmarkapp.com/email/withTemplate', {
                  method: 'POST',
                  headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': POSTMARK_TOKEN },
                  body: JSON.stringify(postmarkBody),
                });
                const body = await res.json();
                if (!res.ok || (body?.ErrorCode && body.ErrorCode !== 0)) {
                  okEmail = false;
                  errMsg += `email: ${body?.Message || res.status}; `;
                }
              } catch (e) { okEmail = false; errMsg += `email red: ${(e as Error).message}; `; }
            }
          }

          // WHATSAPP via enviar-notificacion (n8n proxy)
          if ((channel === 'whatsapp' || channel === 'ambos') && persona.telefono) {
            try {
              const waToken = Deno.env.get('EVOLUTION_WA_COBRANZA_TOKEN') || '';
              const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-notificacion`;
              const r = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'apikey': waToken,
                },
                body: JSON.stringify({
                  tipo: 'whatsapp',
                  telefono: `${persona.clave_pais_telefono || ''}${persona.telefono}`.replace(/\D/g, ''),
                  mensaje: renderedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                  origen: 'aviso_evento',
                  aviso_id: aviso.id,
                  trigger_id: trig.id,
                  clave_entidad: claveEntidad,
                }),
              });
              if (!r.ok) { okWa = false; errMsg += `wa: ${r.status}; `; }
            } catch (e) { okWa = false; errMsg += `wa red: ${(e as Error).message}; `; }
          }

          const finalEstado = (okEmail && okWa) ? 'enviado' : (okEmail || okWa ? 'parcial' : 'error');
          await supabaseAdmin
            .from('avisos_envios_evento')
            .update({ estado: finalEstado, error: errMsg || null, payload_enviado: templateModel })
            .eq('id', ins.id);

          if (finalEstado === 'enviado' || finalEstado === 'parcial') summary.sent++;
          else summary.errors++;

          summary.details.push({ trigger_id: trig.id, clave_entidad: claveEntidad, estado: finalEstado });
        }
      }
    }

    console.log(`[summary]`, JSON.stringify(summary));
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('evaluar-triggers-evento fatal:', err);
    return new Response(JSON.stringify({ error: (err as Error).message, summary }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});