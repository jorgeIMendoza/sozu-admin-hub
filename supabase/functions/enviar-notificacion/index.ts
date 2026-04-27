// Proxy seguro para notificaciones via n8n

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL');
    if (!n8nBaseUrl) {
      return new Response(
        JSON.stringify({ error: 'N8N_WEBHOOK_BASE_URL no está configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const baseClean = n8nBaseUrl.replace(/\/$/, '');
    const N8N_WEBHOOK_URL = `${baseClean}/manda_notificacion`;
    console.log('Using N8N webhook URL:', N8N_WEBHOOK_URL);

    // Inyectar configuración de WhatsApp (Evolution) en el payload
    const instanciaWA = Deno.env.get('INSTANCIA_EVOLUTION_WHATSAPP') || '';
    if (!instanciaWA) {
      console.warn('INSTANCIA_EVOLUTION_WHATSAPP no está configurado');
    }
    const enrichedBody = {
      ...body,
      URL_WA_base: body?.URL_WA_base ?? baseClean,
      instanciaWA: body?.instanciaWA ?? instanciaWA,
    };
    console.log('WA config -> URL_WA_base:', enrichedBody.URL_WA_base, '| instanciaWA:', enrichedBody.instanciaWA);

    const token = Deno.env.get('POSTMARK_SERVER_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token de notificación no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Forward the apikey header from the incoming request (EVOLUTION_WA_COBRANZA_TOKEN)
    const incomingApiKey = req.headers.get('apikey');

    const outgoingHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-postmark-server-token': token,
    };

    if (incomingApiKey) {
      outgoingHeaders['apikey'] = incomingApiKey;
      console.log('Forwarding apikey header to N8N');
    } else {
      console.warn('No apikey header received - WhatsApp notifications may fail');
    }

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: outgoingHeaders,
      body: JSON.stringify(enrichedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'Error del servicio de notificación', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.text();
    return new Response(result, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
