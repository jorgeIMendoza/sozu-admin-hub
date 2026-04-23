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

function formatMexicoTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Parse cron expression and check if it matches current time (Mexico UTC-6)
function cronMatchesNow(cronExpr: string, mexicoTime: Date): { matches: boolean; reason?: string } {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return { matches: false, reason: 'expresión inválida (no tiene 5 campos)' };

  const minute = mexicoTime.getMinutes();
  const hour = mexicoTime.getHours();
  const dayOfMonth = mexicoTime.getDate();
  const month = mexicoTime.getMonth() + 1;
  const dayOfWeek = mexicoTime.getDay(); // 0=Sunday

  const values = [minute, hour, dayOfMonth, month, dayOfWeek];
  const fieldNames = ['minuto', 'hora', 'día del mes', 'mes', 'día de semana'];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(parts[i], values[i], i)) {
      return { matches: false, reason: `${fieldNames[i]} actual=${values[i]}, cron espera "${parts[i]}"` };
    }
  }
  return { matches: true };
}

function fieldMatches(field: string, value: number, _fieldIndex: number): boolean {
  if (field === '*') return true;

  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return value % step === 0;
  }

  if (field.includes('-') && !field.includes(',')) {
    const [min, max] = field.split('-').map(Number);
    return value >= min && value <= max;
  }

  const parts = field.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      if (value >= min && value <= max) return true;
    } else {
      if (parseInt(part) === value) return true;
    }
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const mexicoTime = getMexicoTime();
    const timeStr = formatMexicoTime(mexicoTime);
    console.log(`[${timeStr} Mexico UTC-6] Ejecutando cron de avisos...`);

    // Get active automatic avisos
    const { data: avisos, error } = await supabaseAdmin
      .from('avisos')
      .select('id, nombre, cron_expression')
      .eq('tipo_envio', 'automatico')
      .eq('activo', true)
      .not('cron_expression', 'is', null);

    if (error) {
      console.error(`[${timeStr}] Error fetching avisos:`, error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${timeStr}] Total avisos automáticos activos: ${avisos?.length || 0}`);

    const matched: number[] = [];

    for (const aviso of avisos || []) {
      if (!aviso.cron_expression) {
        console.log(`[${timeStr}] Aviso ${aviso.id} ("${aviso.nombre}"): sin cron_expression, saltando`);
        continue;
      }

      const result = cronMatchesNow(aviso.cron_expression, mexicoTime);

      if (result.matches) {
        console.log(`[${timeStr}] Aviso ${aviso.id} ("${aviso.nombre}"): cron="${aviso.cron_expression}" → COINCIDE - disparando`);
        matched.push(aviso.id);

        const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso-bulk`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ aviso_id: aviso.id, tipo_trigger: 'cron' }),
          });
          const body = await res.text();
          console.log(`[${timeStr}] Aviso ${aviso.id} disparado - status: ${res.status}, respuesta: ${body.substring(0, 300)}`);
        } catch (err) {
          console.error(`[${timeStr}] Error disparando aviso ${aviso.id}:`, err);
        }
      } else {
        console.log(`[${timeStr}] Aviso ${aviso.id} ("${aviso.nombre}"): cron="${aviso.cron_expression}" → no coincide (${result.reason})`);
      }
    }

    console.log(`[${timeStr}] Resumen: evaluados=${avisos?.length || 0}, disparados=${matched.length}, ids=[${matched.join(',')}]`);

    // Disparar también triggers basados en eventos (acuerdos de pago, etc.)
    let eventoSummary: any = null;
    try {
      const evUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evaluar-triggers-evento`;
      const evRes = await fetch(evUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ execution_origin: 'cron' }),
      });
      const evBody = await evRes.text();
      console.log(`[${timeStr}] evaluar-triggers-evento status=${evRes.status} body=${evBody.substring(0, 400)}`);
      try { eventoSummary = JSON.parse(evBody); } catch { eventoSummary = { raw: evBody }; }
    } catch (e) {
      console.error(`[${timeStr}] error invocando evaluar-triggers-evento:`, e);
      eventoSummary = { error: (e as Error).message };
    }

    return new Response(JSON.stringify({
      evaluated: avisos?.length || 0,
      triggered: matched.length,
      aviso_ids: matched,
      eventos: eventoSummary,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Cron error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
