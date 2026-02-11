import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse cron expression and check if it matches current time (Mexico UTC-6)
function cronMatchesNow(cronExpr: string): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const now = new Date();
  // Adjust to Mexico City time (UTC-6)
  const mexicoOffset = -6 * 60;
  const utcOffset = now.getTimezoneOffset();
  const mexicoTime = new Date(now.getTime() + (utcOffset + mexicoOffset) * 60000);

  const minute = mexicoTime.getMinutes();
  const hour = mexicoTime.getHours();
  const dayOfMonth = mexicoTime.getDate();
  const month = mexicoTime.getMonth() + 1;
  const dayOfWeek = mexicoTime.getDay(); // 0=Sunday

  const values = [minute, hour, dayOfMonth, month, dayOfWeek];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(parts[i], values[i], i)) return false;
  }
  return true;
}

function fieldMatches(field: string, value: number, fieldIndex: number): boolean {
  if (field === '*') return true;

  // Handle step values like */5
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return value % step === 0;
  }

  // Handle ranges like 1-5
  if (field.includes('-') && !field.includes(',')) {
    const [min, max] = field.split('-').map(Number);
    return value >= min && value <= max;
  }

  // Handle lists like 1,3,5
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
    // Get active automatic avisos
    const { data: avisos, error } = await supabaseAdmin
      .from('avisos')
      .select('id, cron_expression')
      .eq('tipo_envio', 'automatico')
      .eq('activo', true)
      .not('cron_expression', 'is', null);

    if (error) {
      console.error('Error fetching avisos:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const matched: number[] = [];

    for (const aviso of avisos || []) {
      if (aviso.cron_expression && cronMatchesNow(aviso.cron_expression)) {
        matched.push(aviso.id);

        // Call enviar-aviso-bulk
        const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso-bulk`;
        try {
          await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ aviso_id: aviso.id, tipo_trigger: 'cron' }),
          });
        } catch (err) {
          console.error(`Error triggering aviso ${aviso.id}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({
      evaluated: avisos?.length || 0,
      triggered: matched.length,
      aviso_ids: matched,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Cron error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
