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

// Normaliza un teléfono al formato que espera la API de WhatsApp (Evolution):
//   - Quita todo lo que no sea dígito (espacios, guiones, paréntesis, '+')
//   - Si quedan 10 dígitos, asume México móvil → antepone '521'
//   - Si empieza con '52' y la posición 2 no es '1' y total es 12 dígitos, antepone el '1' (52 + 1 + 10)
//   - En otros casos, deja los dígitos tal cual
// El workflow de n8n requiere el formato "+<digitos>" (ej. +5217221514185).
function normalizarTelefonoWA(raw: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `521${digits}`;
  if (digits.length === 12 && digits.startsWith('52') && digits[2] !== '1') {
    return `521${digits.slice(2)}`;
  }
  return digits;
}

// El workflow de n8n exige formato internacional con '+' al inicio
// (regex: /^\+\d{11,15}$/). Esta función agrega el '+' a un número ya normalizado.
function telefonoConPlus(digits: string): string {
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `+${digits}`;
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

      // Cargar destinatarios manuales configurados en la UI (avisos_roles_destinatarios.correos).
      // Los correos manuales REEMPLAZAN al cliente real: si hay al menos un manual configurado,
      // el envío se hace ÚNICAMENTE a esos correos manuales (modo prueba/auditoría).
      // Si no hay manuales, se envía al cliente real.
      const { data: rolesDest } = await supabaseAdmin
        .from('avisos_roles_destinatarios')
        .select('correos')
        .eq('id_aviso', aviso.id);

      const manualEmails: { email: string; nombre: string; telefono: string }[] = [];
      for (const rd of rolesDest || []) {
        const correos: any = (rd as any).correos;
        const lista: any[] = Array.isArray(correos?.destinatarios) ? correos.destinatarios : [];
        for (const it of lista) {
          const em = typeof it?.email === 'string' ? it.email.trim() : '';
          if (em.includes('@')) {
            const tel = typeof it?.telefono === 'string' ? it.telefono.trim() : '';
            manualEmails.push({ email: em, nombre: it?.nombre || '', telefono: tel });
          }
        }
      }
      if (manualEmails.length > 0) {
        const conTel = manualEmails.filter(m => m.telefono).length;
        console.log(`${tag} trigger ${trig.id}: ${manualEmails.length} destinatario(s) manual(es) (${conTel} con teléfono) → REEMPLAZAN al cliente real`);
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

          // Destinatarios por acuerdo:
          //   1) Cliente real (o email_override si está en filtros) — siempre que tenga email
          //   2) Cada correo manual configurado en la UI (adicionales / copia)
          // Cada destinatario tiene su propia clave de idempotencia para no duplicar envíos.
          type Dest = { email: string | null; nombre: string; telefono: string; tipo: 'cliente' | 'manual'; claveEntidad: string };
          const destinatarios: Dest[] = [];
          if (manualEmails.length > 0) {
            // Modo manual: SOLO a los correos configurados, NO al cliente real.
            for (const m of manualEmails) {
              destinatarios.push({
                email: m.email,
                nombre: m.nombre || persona.nombre_legal || '',
                telefono: m.telefono || '',
                tipo: 'manual',
                claveEntidad: `acuerdo:${ac.id}:offset:${offset}:manual:${m.email}`,
              });
            }
          } else if (emailReal) {
            destinatarios.push({
              email: emailReal,
              nombre: persona.nombre_legal || '',
              telefono: persona.telefono ? `${persona.clave_pais_telefono || ''}${persona.telefono}` : '',
              tipo: 'cliente',
              claveEntidad: `acuerdo:${ac.id}:offset:${offset}`,
            });
          }

          for (const dest of destinatarios) {
            // Idempotent insert por destinatario
            const { data: ins, error: insErr } = await supabaseAdmin
              .from('avisos_envios_evento')
              .insert({
                id_aviso: aviso.id,
                id_trigger: trig.id,
                clave_entidad: dest.claveEntidad,
                fecha_objetivo: fechaObjetivo,
                email_destino: dest.email,
                telefono_destino: dest.telefono ? normalizarTelefonoWA(dest.telefono) : null,
                canal: channel,
                estado: 'enviando',
              })
              .select('id')
              .single();

            if (insErr) {
              if ((insErr as any).code === '23505') {
                console.log(`${tag} ${dest.claveEntidad}: ya enviado previamente, omitiendo`);
              } else {
                console.error(`${tag} insert error ${dest.claveEntidad}:`, insErr);
                summary.errors++;
              }
              continue;
            }

            let okEmail = true, okWa = true;
            let errMsg = '';

            // Re-render templateModel para este destinatario (cambia "nombre")
            const destVars: Record<string, string> = { ...vars, nombre: dest.nombre || vars.nombre };
            const destAsunto = renderTemplate(aviso.asunto || '', destVars);
            const destHtml = renderTemplate(aviso.mensaje_html || '', destVars);
            destVars.asunto = destAsunto;
            destVars.texto = destHtml;
            const destTemplateModel = aviso.payload_postmark
              ? renderJsonTemplate(aviso.payload_postmark, destVars)
              : { mensaje: { nombre: dest.nombre || persona.nombre_legal || '', texto: destHtml, asunto: destAsunto } };

            if (dryRun) {
              await supabaseAdmin
                .from('avisos_envios_evento')
                .update({ estado: 'simulado', error: 'dry_run', payload_enviado: destTemplateModel })
                .eq('id', ins.id);
              summary.details.push({ trigger_id: trig.id, clave_entidad: dest.claveEntidad, estado: 'simulado', email: dest.email, tipo: dest.tipo });
              summary.sent++;
              continue;
            }

            // EMAIL
            if ((channel === 'email' || channel === 'ambos') && dest.email) {
              if (!POSTMARK_TOKEN) { okEmail = false; errMsg += 'POSTMARK_SERVER_TOKEN faltante; '; }
              else {
                try {
                  const templateId = aviso.postmark_template_id || 36978552;
                  const postmarkBody: any = {
                    From: 'notificaciones@sozu.com',
                    To: dest.email,
                    TemplateId: templateId,
                    TemplateModel: destTemplateModel,
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

            // WHATSAPP via enviar-notificacion — para cliente real Y manuales que tengan teléfono.
            // El cuerpo del WA es el "Contenido del mensaje" (mensaje_html) sin etiquetas, con placeholders renderizados.
            const telWA = normalizarTelefonoWA(dest.telefono || '');
            if ((channel === 'whatsapp' || channel === 'ambos') && telWA) {
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
                    telefono: telWA,
                    mensaje: destHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                    origen: 'aviso_evento',
                    aviso_id: aviso.id,
                    trigger_id: trig.id,
                    clave_entidad: dest.claveEntidad,
                    destinatario_tipo: dest.tipo,
                  }),
                });
                if (!r.ok) { okWa = false; errMsg += `wa: ${r.status}; `; }
              } catch (e) { okWa = false; errMsg += `wa red: ${(e as Error).message}; `; }
            }

            const finalEstado = (okEmail && okWa) ? 'enviado' : (okEmail || okWa ? 'parcial' : 'error');
            await supabaseAdmin
              .from('avisos_envios_evento')
              .update({ estado: finalEstado, error: errMsg || null, payload_enviado: destTemplateModel })
              .eq('id', ins.id);

            if (finalEstado === 'enviado' || finalEstado === 'parcial') summary.sent++;
            else summary.errors++;

            summary.details.push({ trigger_id: trig.id, clave_entidad: dest.claveEntidad, estado: finalEstado, tipo: dest.tipo });
          }
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