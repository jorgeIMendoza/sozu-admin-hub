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
  try {
    return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return s;
  }
}

const DEFAULT_TIPOS_PAGO = [2, 5, 4, 3];

// ──────────────────────────────────────────────────────────────────────────
// Cron matching (replicado de ejecutar-avisos-cron). Cuando un aviso en
// modo evento tiene cron_expression, lo usamos como "gate del día": sólo
// se evalúa si la expresión matchea la fecha/hora actual de México.
// ──────────────────────────────────────────────────────────────────────────
function cronFieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (field.includes('-') && !field.includes(',')) {
    const [min, max] = field.split('-').map(Number);
    return value >= min && value <= max;
  }
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      if (value >= min && value <= max) return true;
    } else if (parseInt(part, 10) === value) {
      return true;
    }
  }
  return false;
}

function cronMatchesDay(cronExpr: string, mexNow: Date): boolean {
  // Para barrido diario sólo nos importa día-mes, mes y día-semana.
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const dayOfMonth = mexNow.getDate();
  const month = mexNow.getMonth() + 1;
  const dayOfWeek = mexNow.getDay();
  return cronFieldMatches(parts[2], dayOfMonth)
    && cronFieldMatches(parts[3], month)
    && cronFieldMatches(parts[4], dayOfWeek);
}

function formatMonthName(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { month: 'long' });
}

function resolveTratamiento(sexo: string | null | undefined): string {
  if (sexo === 'F') return 'Sra.';
  if (sexo === 'M') return 'Sr.';
  return '';
}

function pickRandomWhatsappMessage(mensajesWhatsapp: unknown, fallbackHtml: string): string {
  const variants = Array.isArray(mensajesWhatsapp)
    ? mensajesWhatsapp.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (variants.length === 0) return fallbackHtml || '';
  const index = Math.floor(Math.random() * variants.length);
  return variants[index];
}

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

function telefonoConPlus(digits: string): string {
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `+${digits}`;
}

type ExecutionMetrics = {
  acuerdosEncontrados: number;
  acuerdosFiltrados: number;
  destinatarios: number;
  enviados: number;
  errores: number;
  omitidos: number;
  motivos: string[];
};

function createExecutionMetrics(): ExecutionMetrics {
  return {
    acuerdosEncontrados: 0,
    acuerdosFiltrados: 0,
    destinatarios: 0,
    enviados: 0,
    errores: 0,
    omitidos: 0,
    motivos: [],
  };
}

function addMotivo(metrics: ExecutionMetrics, motivo: string) {
  if (motivo && !metrics.motivos.includes(motivo)) {
    metrics.motivos.push(motivo);
  }
}

function buildExecutionDetail(metrics: ExecutionMetrics): string {
  const partes = [...metrics.motivos];
  partes.push(`Acuerdos encontrados: ${metrics.acuerdosEncontrados}`);
  partes.push(`Acuerdos en desarrollos habilitados: ${metrics.acuerdosFiltrados}`);
  partes.push(`Destinatarios evaluados: ${metrics.destinatarios}`);
  if (metrics.omitidos > 0) partes.push(`Omitidos por idempotencia: ${metrics.omitidos}`);
  partes.push(`Enviados: ${metrics.enviados}`);
  if (metrics.errores > 0) partes.push(`Errores: ${metrics.errores}`);
  return partes.join(' | ');
}

function resolveExecutionState(metrics: ExecutionMetrics): string {
  if (metrics.errores > 0 && metrics.enviados > 0) return 'parcial';
  if (metrics.errores > 0) return 'error';
  return 'completado';
}

async function getSelectedProjectIds(supabaseAdmin: any, avisoId: number): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from('avisos_proyectos')
    .select('id_proyecto')
    .eq('id_aviso', avisoId)
    .eq('activo', true);

  return (data || []).map((item: any) => item.id_proyecto).filter((id: unknown): id is number => typeof id === 'number');
}

type ExecutionOrigin = 'cron' | 'manual_explicit';

function resolveExecutionOrigin(value: unknown): ExecutionOrigin {
  if (typeof value !== 'string') return 'cron';
  return value === 'manual_explicit' ? 'manual_explicit' : 'cron';
}

function buildManualEntityKey(baseKey: string, executionOrigin: ExecutionOrigin, executionId: number | null): string {
  if (executionOrigin === 'manual_explicit') {
    return `${baseKey}:exec:${executionId ?? 'sin-ejecucion'}`;
  }
  return baseKey;
}

async function getSuccessfulManualRecipients(
  supabaseAdmin: any,
  avisoId: number,
  triggerId: number,
  fechaObjetivo: string,
  emails: string[],
): Promise<Set<string>> {
  const uniqueEmails = [...new Set(emails.map((email) => email.trim()).filter(Boolean))];
  if (uniqueEmails.length === 0) return new Set();

  const { data, error } = await supabaseAdmin
    .from('avisos_envios_evento')
    .select('email_destino')
    .eq('id_aviso', avisoId)
    .eq('id_trigger', triggerId)
    .eq('fecha_objetivo', fechaObjetivo)
    .in('email_destino', uniqueEmails)
    .in('estado', ['enviado', 'parcial']);

  if (error) {
    console.error(`Error consultando envíos manuales exitosos previos:`, error);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row: any) => (typeof row.email_destino === 'string' ? row.email_destino.trim() : ''))
      .filter(Boolean),
  );
}

async function getSuccessfulEntityKeys(
  supabaseAdmin: any,
  avisoId: number,
  triggerId: number,
  fechaObjetivo: string,
  entityKeys: string[],
): Promise<Set<string>> {
  const uniqueKeys = [...new Set(entityKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) return new Set();

  const { data, error } = await supabaseAdmin
    .from('avisos_envios_evento')
    .select('clave_entidad')
    .eq('id_aviso', avisoId)
    .eq('id_trigger', triggerId)
    .eq('fecha_objetivo', fechaObjetivo)
    .in('clave_entidad', uniqueKeys)
    .in('estado', ['enviado', 'parcial']);

  if (error) {
    console.error(`Error consultando entidades exitosas previas:`, error);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row: any) => (typeof row.clave_entidad === 'string' ? row.clave_entidad.trim() : ''))
      .filter(Boolean),
  );
}

async function createExecutionLog(supabaseAdmin: any, avisoId: number, executionOrigin: ExecutionOrigin) {
  const { data, error } = await supabaseAdmin
    .from('avisos_ejecuciones')
    .insert({
      id_aviso: avisoId,
      tipo_trigger: 'evento',
      fecha_ejecucion: new Date().toISOString(),
      total_destinatarios: 0,
      total_enviados: 0,
      total_errores: 0,
      estado: 'completado',
      detalle_error: null,
      ejecutado_por: executionOrigin === 'manual_explicit' ? 'manual:evento' : 'cron:evento',
    })
    .select('id')
    .single();

  if (error) {
    console.error('No se pudo crear el registro de avisos_ejecuciones:', error);
    return null;
  }

  return data?.id ?? null;
}

async function ensureExecutionLog(
  supabaseAdmin: any,
  executionId: number | null,
  avisoId: number,
  executionOrigin: ExecutionOrigin,
) {
  if (executionId) return executionId;
  return await createExecutionLog(supabaseAdmin, avisoId, executionOrigin);
}

async function finalizeExecutionLog(supabaseAdmin: any, executionId: number | null, metrics: ExecutionMetrics) {
  if (!executionId) return;

  await supabaseAdmin
    .from('avisos_ejecuciones')
    .update({
      total_destinatarios: metrics.destinatarios,
      total_enviados: metrics.enviados,
      total_errores: metrics.errores,
      estado: resolveExecutionState(metrics),
      detalle_error: buildExecutionDetail(metrics),
    })
    .eq('id', executionId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const summary: any = { evaluated: 0, triggers: 0, sent: 0, skipped: 0, errors: 0, details: [] as any[] };

  try {
    const url = new URL(req.url);
    const ignoreWindow = url.searchParams.get('ignore_window') === '1';
    const dryRun = url.searchParams.get('dry_run') === '1';
    const overrideOffsetParam = url.searchParams.get('override_offset');
    const overrideOffset = overrideOffsetParam !== null ? Number(overrideOffsetParam) : null;
    const requestBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const executionOrigin = resolveExecutionOrigin(
      (requestBody as Record<string, unknown>)?.execution_origin
      ?? ((requestBody as Record<string, unknown>)?.tipo_trigger === 'manual' ? 'manual_explicit' : 'cron')
    );

    const mexNow = getMexicoTime();
    const tag = `[${fmtTime(mexNow)} MX]`;
    console.log(`${tag} evaluar-triggers-evento iniciando (ignoreWindow=${ignoreWindow}, dryRun=${dryRun}, executionOrigin=${executionOrigin})`);

    const { data: triggers, error: tErr } = await supabaseAdmin
      .from('avisos_triggers_evento')
      .select(`
        id, id_aviso, id_fuente, offsets_dias, hora_envio, canal, filtros, activo,
          avisos:avisos!inner ( id, nombre, asunto, mensaje_html, mensajes_whatsapp, postmark_template_id, activo, modo_trigger, payload_postmark, tipos_pago_notificables, personalizado, cron_expression ),
        fuente:aviso_triggers_fuentes!inner ( id, clave, activo )
      `)
      .eq('activo', true);

    if (tErr) {
      console.error(`${tag} error cargando triggers:`, tErr);
      return new Response(JSON.stringify({ error: tErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    summary.triggers = triggers?.length || 0;
    console.log(`${tag} triggers activos: ${summary.triggers}`);

    for (const trig of triggers || []) {
      const aviso: any = (trig as any).avisos;
      const fuente: any = (trig as any).fuente;

      if (!aviso?.activo || aviso?.modo_trigger !== 'evento' || !fuente?.activo) {
        summary.skipped++;
        continue;
      }

      const selectedProjectIds = await getSelectedProjectIds(supabaseAdmin, aviso.id);
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
      // NUEVA SEMÁNTICA: la lista manual opera como WHITELIST sobre el email del cliente real del acuerdo.
      // Se usa nombre/telefono del manual como override cuando coinciden; si la lista está vacía,
      // se notifica a todos los clientes reales que cumplan la condición del trigger.
      const manualOverridesByEmail = new Map<string, { nombre: string; telefono: string }>();
      const manualEmailsSet = new Set<string>();
      for (const m of manualEmails) {
        const key = m.email.toLowerCase();
        manualEmailsSet.add(key);
        if (!manualOverridesByEmail.has(key)) {
          manualOverridesByEmail.set(key, { nombre: m.nombre || '', telefono: m.telefono || '' });
        }
      }
      const hasManualWhitelist = manualEmailsSet.size > 0;
      if (hasManualWhitelist) {
        const conTel = manualEmails.filter((m) => m.telefono).length;
        console.log(`${tag} trigger ${trig.id}: ${manualEmailsSet.size} correo(s) manual(es) cargados (${conTel} con teléfono) → operan como whitelist sobre el email del cliente del acuerdo`);
      }

      const offsets: number[] = (trig.offsets_dias as number[]) || [];
      const effectiveOffsets = overrideOffset !== null && !Number.isNaN(overrideOffset) ? [overrideOffset] : offsets;
      if (effectiveOffsets.length === 0) {
        summary.skipped++;
        continue;
      }

      for (const offset of effectiveOffsets) {
          let executionId: number | null = null;
        const metrics = createExecutionMetrics();

        const target = new Date(mexNow);
        target.setDate(target.getDate() - offset);
        const fechaObjetivo = ymd(target);
        summary.evaluated++;

        const isProximo = fuente.clave === 'acuerdo_pago_proximo';
        const isVencido = fuente.clave === 'acuerdo_pago_vencido';
        const isAcumulado = fuente.clave === 'acuerdos_vencidos_acumulados';

        if (!ignoreWindow && !withinSendWindow(trig.hora_envio as string, mexNow)) {
          console.log(`${tag} trigger ${trig.id} (aviso "${aviso.nombre}"): fuera de ventana hora_envio=${trig.hora_envio}`);
          addMotivo(metrics, `Fuera de ventana de envío (${trig.hora_envio})`);
          summary.skipped++;
          continue;
        }

        // Si el aviso tiene cron_expression, en modo evento la usamos como
        // "gate de día" (ej. "0 9 30 * *" sólo dispara el día 30 a las 9:00).
        if (aviso.cron_expression && typeof aviso.cron_expression === 'string') {
          if (!cronMatchesDay(aviso.cron_expression, mexNow)) {
            console.log(`${tag} trigger ${trig.id} (aviso "${aviso.nombre}"): cron_expression "${aviso.cron_expression}" no matchea hoy → omitido`);
            addMotivo(metrics, `Cron del aviso no aplica hoy (${aviso.cron_expression})`);
            summary.skipped++;
            continue;
          }
        }

        // Trigger entra en ventana → SIEMPRE crear log persistente
        // para poder verificar después que sí se ejecutó, aunque
        // termine sin destinatarios o sin envíos.
        executionId = await ensureExecutionLog(supabaseAdmin, executionId, aviso.id, executionOrigin);
        console.log(`${tag} trigger ${trig.id} (aviso "${aviso.nombre}") IN-WINDOW → execution_log_id=${executionId} fecha_objetivo=${fechaObjetivo} offset=${offset}`);

        if (selectedProjectIds.length === 0) {
          console.log(`${tag} trigger ${trig.id} (aviso "${aviso.nombre}"): sin desarrollos habilitados`);
          addMotivo(metrics, 'Sin desarrollos habilitados');
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
          summary.skipped++;
          continue;
        }

        if (!isProximo && !isVencido && !isAcumulado) {
          console.log(`${tag} fuente "${fuente.clave}" no soportada en V1`);
          addMotivo(metrics, `Fuente no soportada: ${fuente.clave}`);
          metrics.errores++;
          executionId = await ensureExecutionLog(supabaseAdmin, executionId, aviso.id, executionOrigin);
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
          summary.errors++;
          continue;
        }

        let q = supabaseAdmin
          .from('acuerdos_pago')
          .select(`
            id, fecha_pago, monto, orden, id_concepto, id_cuenta_cobranza, activo, pago_completado,
            cuentas_cobranza:cuentas_cobranza!fk_acpago_cuenta!inner (
              id,
              id_propiedad,
              ofertas:ofertas!fk_ccob_oferta!inner (
                id,
                id_producto,
                personas:personas!fk_ofertas_persona_lead!inner ( id, nombre_legal, email, telefono, clave_pais_telefono, sexo )
              )
            )
          `)
          .eq('activo', true)
          .eq('pago_completado', false)
          [isAcumulado ? 'lte' : 'eq']('fecha_pago', fechaObjetivo);

        const filtros: any = trig.filtros || {};
        const tiposPagoConfigurados = Array.isArray(aviso.tipos_pago_notificables) && aviso.tipos_pago_notificables.length > 0
          ? aviso.tipos_pago_notificables
          : DEFAULT_TIPOS_PAGO;
        q = q.in('id_concepto', tiposPagoConfigurados);

        const emailOverride: string | null = typeof filtros.email_override === 'string' && filtros.email_override.includes('@')
          ? filtros.email_override.trim()
          : null;
        const bccList: string[] = Array.isArray(filtros.bcc)
          ? filtros.bcc.filter((e: any) => typeof e === 'string' && e.includes('@'))
          : (typeof filtros.bcc === 'string' && filtros.bcc.includes('@') ? [filtros.bcc] : []);

        const { data: rows, error: qErr } = await q;
        if (qErr) {
          console.error(`${tag} trigger ${trig.id} offset ${offset}: query error`, qErr);
          addMotivo(metrics, `Error consultando acuerdos: ${(qErr as any).message || String(qErr)}`);
          metrics.errores++;
          summary.details.push({ trigger_id: trig.id, offset, fecha_objetivo: fechaObjetivo, query_error: (qErr as any).message || String(qErr), code: (qErr as any).code || null });
          summary.errors++;
          executionId = await ensureExecutionLog(supabaseAdmin, executionId, aviso.id, executionOrigin);
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
          continue;
        }

        metrics.acuerdosEncontrados = rows?.length || 0;
        console.log(`${tag} trigger ${trig.id} offset ${offset} fecha=${fechaObjetivo} → ${metrics.acuerdosEncontrados} acuerdos`);

        const acuerdosFiltrados = (rows || []).filter((ac: any) => {
          const idPropiedad = ac?.cuentas_cobranza?.id_propiedad;
          return !!idPropiedad;
        });

        const propiedadIds = [...new Set(acuerdosFiltrados.map((ac: any) => ac.cuentas_cobranza.id_propiedad))];
        if (propiedadIds.length === 0) {
          addMotivo(metrics, 'Sin propiedades relacionadas para filtrar desarrollos');
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
          continue;
        }

        const { data: propiedadesRelacionadas } = await supabaseAdmin
          .from('propiedades')
          .select('id, id_edificio_modelo, numero_propiedad')
          .in('id', propiedadIds);

        const edificioModeloByPropiedad = new Map<number, number>(
          (propiedadesRelacionadas || [])
            .filter((propiedad: any) => propiedad.id && propiedad.id_edificio_modelo)
            .map((propiedad: any) => [propiedad.id, propiedad.id_edificio_modelo])
        );
        const numeroPropiedadById = new Map<number, string>(
          (propiedadesRelacionadas || [])
            .filter((propiedad: any) => propiedad.id)
            .map((propiedad: any) => [propiedad.id, propiedad.numero_propiedad || ''])
        );

        const edificioModeloIds = [...new Set((propiedadesRelacionadas || []).map((propiedad: any) => propiedad.id_edificio_modelo).filter(Boolean))];
        const { data: edificiosModelos } = edificioModeloIds.length > 0
          ? await supabaseAdmin.from('edificios_modelos').select('id, id_edificio').in('id', edificioModeloIds)
          : { data: [] as any[] };

        const edificioByModelo = new Map<number, number>(((edificiosModelos as any[]) || []).map((modelo: any) => [modelo.id, modelo.id_edificio]));
        const edificioIds = [...new Set(((edificiosModelos as any[]) || []).map((modelo: any) => modelo.id_edificio).filter(Boolean))];
        const { data: edificios } = edificioIds.length > 0
          ? await supabaseAdmin.from('edificios').select('id, id_proyecto').in('id', edificioIds)
          : { data: [] as any[] };

        const proyectoByEdificio = new Map<number, number>(((edificios as any[]) || []).map((edificio: any) => [edificio.id, edificio.id_proyecto]));
        const proyectoIds = [...new Set(((edificios as any[]) || []).map((edificio: any) => edificio.id_proyecto).filter(Boolean))];
        const { data: proyectos } = proyectoIds.length > 0
          ? await supabaseAdmin.from('proyectos').select('id, nombre').in('id', proyectoIds)
          : { data: [] as any[] };
        const rowsFilteredByProject = (rows || []).filter((ac: any) => {
          const idPropiedad = ac?.cuentas_cobranza?.id_propiedad;
          const idEdificioModelo = idPropiedad ? edificioModeloByPropiedad.get(idPropiedad) : undefined;
          const idEdificio = idEdificioModelo ? edificioByModelo.get(idEdificioModelo) : undefined;
          const idProyecto = idEdificio ? proyectoByEdificio.get(idEdificio) : undefined;
          return !!idProyecto && selectedProjectIds.includes(idProyecto);
        });

        metrics.acuerdosFiltrados = rowsFilteredByProject.length;

        const proyectoNombreById = new Map<number, string>(((proyectos as any[]) || []).map((proyecto: any) => [proyecto.id, proyecto.nombre || '']));
        const productoIds = [...new Set(rowsFilteredByProject.map((ac: any) => ac?.cuentas_cobranza?.ofertas?.id_producto).filter(Boolean))];
        const { data: productos } = productoIds.length > 0
          ? await supabaseAdmin.from('productos_servicios').select('id, nombre').in('id', productoIds)
          : { data: [] as any[] };
        const productoNombreById = new Map<number, string>(((productos as any[]) || []).map((producto: any) => [producto.id, producto.nombre || '']));

        if (rowsFilteredByProject.length === 0) {
          console.log(`${tag} trigger ${trig.id} offset ${offset}: sin acuerdos en desarrollos habilitados`);
          addMotivo(metrics, 'Sin acuerdos elegibles en los desarrollos habilitados');
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
          continue;
        }

        // Calcular el "número real" de la parcialidad/concepto: rank dentro
        // del mismo (cuenta_cobranza, concepto), no el campo `orden` global
        // que mezcla apartado, enganche, parcialidades, etc.
        const cuentaConceptoPairs = [...new Set(
          rowsFilteredByProject.map((ac: any) => `${ac.id_cuenta_cobranza}|${ac.id_concepto}`)
        )];
        const cuentaIdsForRank = [...new Set(rowsFilteredByProject.map((ac: any) => ac.id_cuenta_cobranza))];
        const conceptoIdsForRank = [...new Set(rowsFilteredByProject.map((ac: any) => ac.id_concepto))];
        const { data: hermanos } = cuentaIdsForRank.length > 0 && conceptoIdsForRank.length > 0
          ? await supabaseAdmin
              .from('acuerdos_pago')
              .select('id, id_cuenta_cobranza, id_concepto, orden, fecha_pago')
              .in('id_cuenta_cobranza', cuentaIdsForRank)
              .in('id_concepto', conceptoIdsForRank)
              .eq('activo', true)
              .order('fecha_pago', { ascending: true })
              .order('orden', { ascending: true })
          : { data: [] as any[] };
        const ordenLocalById = new Map<number, number>();
        const counterByPair = new Map<string, number>();
        for (const h of (hermanos as any[]) || []) {
          const key = `${h.id_cuenta_cobranza}|${h.id_concepto}`;
          if (!cuentaConceptoPairs.includes(key)) continue;
          const next = (counterByPair.get(key) || 0) + 1;
          counterByPair.set(key, next);
          ordenLocalById.set(h.id, next);
        }

        const isPersonalizado = !!aviso.personalizado;

        // En modo acumulado agrupamos por email del cliente: un solo envío
        // por persona con la lista completa de adeudos. Construimos un
        // arreglo de "acuerdos representativos" (uno por grupo), llevando
        // adjunta la lista completa en __grupoAcuerdos.
        type GrupoAcumulado = {
          totalMonto: number;
          cantidad: number;
          fechaMasAntigua: string;
          items: Array<{
            fecha: string;
            mes: string;
            monto: number;
            departamento: string;
            proyecto: string;
            producto: string;
            concepto_id: number;
          }>;
        };
        let acuerdosParaProcesar: any[] = rowsFilteredByProject;
        if (isAcumulado) {
          const gruposPorEmail = new Map<string, { rep: any; grupo: GrupoAcumulado }>();
          for (const ac of rowsFilteredByProject) {
            const ccG: any = (ac as any).cuentas_cobranza;
            const personaG: any = ccG?.ofertas?.personas;
            const emailG = (emailOverride || personaG?.email || '').toString().trim().toLowerCase();
            if (!emailG) continue;
            const idPropG = ccG?.id_propiedad;
            const idEdModG = idPropG ? edificioModeloByPropiedad.get(idPropG) : undefined;
            const idEdG = idEdModG ? edificioByModelo.get(idEdModG) : undefined;
            const idProyG = idEdG ? proyectoByEdificio.get(idEdG) : undefined;
            const item = {
              fecha: ac.fecha_pago as string,
              mes: formatMonthName(ac.fecha_pago as string),
              monto: Number(ac.monto || 0),
              departamento: idPropG ? (numeroPropiedadById.get(idPropG) || '') : '',
              proyecto: idProyG ? (proyectoNombreById.get(idProyG) || '') : '',
              producto: ccG?.ofertas?.id_producto ? (productoNombreById.get(ccG.ofertas.id_producto) || '') : '',
              concepto_id: ac.id_concepto as number,
            };
            if (!gruposPorEmail.has(emailG)) {
              gruposPorEmail.set(emailG, {
                rep: ac,
                grupo: {
                  totalMonto: 0,
                  cantidad: 0,
                  fechaMasAntigua: item.fecha,
                  items: [],
                },
              });
            }
            const g = gruposPorEmail.get(emailG)!;
            g.grupo.items.push(item);
            g.grupo.totalMonto += item.monto;
            g.grupo.cantidad += 1;
            if (item.fecha < g.grupo.fechaMasAntigua) g.grupo.fechaMasAntigua = item.fecha;
          }
          // Ordenar items por fecha asc dentro de cada grupo
          for (const g of gruposPorEmail.values()) {
            g.grupo.items.sort((a, b) => a.fecha.localeCompare(b.fecha));
            (g.rep as any).__grupoAcumulado = g.grupo;
          }
          acuerdosParaProcesar = [...gruposPorEmail.values()].map((g) => g.rep);
          console.log(`${tag} trigger ${trig.id} ACUMULADO: ${rowsFilteredByProject.length} acuerdos → ${acuerdosParaProcesar.length} clientes`);
        }

        for (const ac of acuerdosParaProcesar) {
          const cc: any = (ac as any).cuentas_cobranza;
          const persona: any = cc?.ofertas?.personas;
          if (!persona) continue;

          const idPropiedad = cc?.id_propiedad;
          const idEdificioModelo = idPropiedad ? edificioModeloByPropiedad.get(idPropiedad) : undefined;
          const idEdificio = idEdificioModelo ? edificioByModelo.get(idEdificioModelo) : undefined;
          const idProyecto = idEdificio ? proyectoByEdificio.get(idEdificio) : undefined;
          const numeroDepartamento = idPropiedad ? (numeroPropiedadById.get(idPropiedad) || '') : '';
          const nombreProyecto = idProyecto ? (proyectoNombreById.get(idProyecto) || '') : '';
          const nombreProducto = cc?.ofertas?.id_producto ? (productoNombreById.get(cc.ofertas.id_producto) || '') : '';
          const channel = trig.canal as string;
          const emailReal = emailOverride || persona.email || null;

          // Whitelist: si hay lista manual cargada, exigir que el email del cliente real esté en ella.
          const emailRealLower = (emailReal || '').toLowerCase();
          if (hasManualWhitelist) {
            if (!emailRealLower || !manualEmailsSet.has(emailRealLower)) {
              console.log(`${tag} acuerdo ${ac.id}: cliente "${persona.email || '(sin email)'}" fuera de whitelist manual, omitiendo`);
              addMotivo(metrics, 'Cliente del acuerdo no está en la lista manual (whitelist)');
              continue;
            }
          }

          // Override de nombre/telefono cuando el email del cliente coincide con el manual.
          const manualOverride = emailRealLower ? manualOverridesByEmail.get(emailRealLower) : undefined;
          const nombreFinal = manualOverride?.nombre || persona.nombre_legal || '';
          const telefonoFinal = manualOverride?.telefono
            ? manualOverride.telefono
            : (persona.telefono ? `${persona.clave_pais_telefono || ''}${persona.telefono}` : '');

          const vars: Record<string, string> = {
            nombre: nombreFinal,
            tratamiento: resolveTratamiento(persona.sexo),
            email: persona.email || '',
            telefono: telefonoFinal,
            monto: fmtMoney(Number(ac.monto || 0)),
            fecha_pago: fmtDate(ac.fecha_pago as string),
            mes: formatMonthName(ac.fecha_pago as string),
            orden: String(ordenLocalById.get(ac.id) ?? ac.orden ?? ''),
            orden_global: String(ac.orden || ''),
            departamento: numeroDepartamento,
            producto: nombreProducto,
            proyecto: nombreProyecto,
            offset: String(offset),
            cuenta_id: String(cc.id),
            asunto: '',
            texto: '',
          };

          const renderedAsunto = renderTemplate(aviso.asunto || '', vars);
          const renderedHtml = renderTemplate(aviso.mensaje_html || '', vars);
          vars.asunto = renderedAsunto;
          vars.texto = renderedHtml;

          // Variables específicas del modo acumulado: tabla con todos los
          // adeudos del cliente, total, cantidad, fecha más antigua.
          if (isAcumulado && (ac as any).__grupoAcumulado) {
            const g: GrupoAcumulado = (ac as any).__grupoAcumulado;
            const filasHtml = g.items.map((it) => `
              <tr>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${fmtDate(it.fecha)}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.proyecto}${it.departamento ? ` · Depto ${it.departamento}` : ''}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmtMoney(it.monto)}</td>
              </tr>`).join('');
            const tablaHtml = `
              <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
                <thead>
                  <tr style="background:#f5f5f5;">
                    <th style="padding:8px 10px;text-align:left;">Fecha</th>
                    <th style="padding:8px 10px;text-align:left;">Concepto</th>
                    <th style="padding:8px 10px;text-align:right;">Monto</th>
                  </tr>
                </thead>
                <tbody>${filasHtml}</tbody>
              </table>`;
            const filasTexto = g.items
              .map((it) => `• ${fmtDate(it.fecha)} — ${it.proyecto}${it.departamento ? ` Depto ${it.departamento}` : ''} — ${fmtMoney(it.monto)}`)
              .join('\n');
            vars.lista_adeudos = tablaHtml;
            vars.lista_adeudos_texto = filasTexto;
            vars.total_adeudo = fmtMoney(g.totalMonto);
            vars.cantidad_acuerdos = String(g.cantidad);
            vars.fecha_mas_antigua = fmtDate(g.fechaMasAntigua);
            // Re-render con variables nuevas disponibles
            vars.asunto = renderTemplate(aviso.asunto || '', vars);
            vars.texto = renderTemplate(aviso.mensaje_html || '', vars);
          }

          if (!emailReal) {
            console.log(`${tag} acuerdo ${ac.id}: cliente sin email, omitiendo`);
            addMotivo(metrics, 'Cliente sin email');
            continue;
          }

          const destinatarios = [{
            email: emailReal,
            nombre: nombreFinal,
            telefono: telefonoFinal,
            tipo: 'cliente' as const,
            claveEntidad: isAcumulado
              ? `acumulado:cliente:${(emailReal || '').toLowerCase()}:fecha:${fechaObjetivo}`
              : `acuerdo:${ac.id}:offset:${offset}`,
          }];

          for (const dest of destinatarios) {
            executionId = await ensureExecutionLog(supabaseAdmin, executionId, aviso.id, executionOrigin);
            metrics.destinatarios++;

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
                metrics.omitidos++;
                addMotivo(metrics, 'Ya enviado previamente; ejecución omitida');
              } else {
                console.error(`${tag} insert error ${dest.claveEntidad}:`, insErr);
                metrics.errores++;
                summary.errors++;
                addMotivo(metrics, `Error registrando destinatario: ${(insErr as any).message || 'desconocido'}`);
              }
              continue;
            }

            let okEmail = true;
            let okWa = true;
            let errMsg = '';

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
              metrics.enviados++;
              addMotivo(metrics, 'Simulación ejecutada');
              continue;
            }

            const telDigits = normalizarTelefonoWA(dest.telefono || '');
            const telWA = telefonoConPlus(telDigits);
            const mensajeWaTpl = pickRandomWhatsappMessage(aviso.mensajes_whatsapp, aviso.mensaje_html || '');
            const textoPlano = renderTemplate(mensajeWaTpl, destVars).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

            let tipoN8N: 'wa' | 'email' | 'ambos' | null = null;
            if (channel === 'ambos') {
              if (dest.email && telWA) tipoN8N = 'ambos';
              else if (dest.email) tipoN8N = 'email';
              else if (telWA) tipoN8N = 'wa';
            } else if (channel === 'whatsapp') {
              if (telWA) tipoN8N = 'wa';
            } else if (channel === 'email') {
              if (dest.email) tipoN8N = 'email';
            }

            if (!tipoN8N) {
              okEmail = false;
              okWa = false;
              errMsg += `sin destino válido (canal=${channel}, email=${!!dest.email}, tel=${!!telWA}); `;
            } else {
              try {
                const waToken = Deno.env.get('EVOLUTION_WA_COBRANZA_TOKEN') || '';
                const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-notificacion`;
                const templateId = aviso.postmark_template_id || 36978552;

                const payloadN8N: Record<string, unknown> = {
                  tipo: tipoN8N,
                  from: 'Notificaciones Sozu <notificaciones@sozu.com>',
                  templateId,
                  mensaje: destTemplateModel?.mensaje ?? destTemplateModel,
                  mensajeWA: textoPlano,
                  asunto: destAsunto,
                  email: dest.email || null,
                  telefono: telWA || null,
                  cc: bccList.length > 0 ? bccList.join(',') : null,
                  origen: 'aviso_evento',
                  aviso_id: aviso.id,
                  trigger_id: trig.id,
                  clave_entidad: dest.claveEntidad,
                  destinatario_tipo: dest.tipo,
                  nombre_usuario: dest.nombre || persona.nombre_legal || '',
                };

                const r = await fetch(fnUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'apikey': waToken,
                  },
                  body: JSON.stringify(payloadN8N),
                });
                if (!r.ok) {
                  const txt = await r.text().catch(() => '');
                  if (tipoN8N === 'email') okEmail = false;
                  else if (tipoN8N === 'wa') okWa = false;
                  else {
                    okEmail = false;
                    okWa = false;
                  }
                  errMsg += `n8n ${tipoN8N}: ${r.status} ${txt.slice(0, 200)}; `;
                }
                await supabaseAdmin
                  .from('avisos_envios_evento')
                  .update({ payload_enviado: payloadN8N as any })
                  .eq('id', ins.id);
              } catch (e) {
                okEmail = false;
                okWa = false;
                errMsg += `n8n red: ${(e as Error).message}; `;
              }
            }

            const finalEstado = (okEmail && okWa) ? 'enviado' : (okEmail || okWa ? 'parcial' : 'error');
            await supabaseAdmin
              .from('avisos_envios_evento')
              .update({ estado: finalEstado, error: errMsg || null })
              .eq('id', ins.id);

            if (finalEstado === 'enviado' || finalEstado === 'parcial') {
              summary.sent++;
              metrics.enviados++;
            } else {
              summary.errors++;
              metrics.errores++;
              addMotivo(metrics, errMsg || 'Error enviando notificación');
            }

            summary.details.push({ trigger_id: trig.id, clave_entidad: dest.claveEntidad, estado: finalEstado, tipo: dest.tipo });
          }
        }

        if (metrics.destinatarios === 0 && metrics.enviados === 0 && metrics.errores === 0 && metrics.omitidos === 0) {
          addMotivo(metrics, 'Sin destinatarios válidos para notificar');
        }

        if (executionId) {
          await finalizeExecutionLog(supabaseAdmin, executionId, metrics);
        }
      }
    }

    console.log(`[summary]`, JSON.stringify(summary));
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('evaluar-triggers-evento fatal:', err);
    return new Response(JSON.stringify({ error: (err as Error).message, summary }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
