const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract {{ variableName }} placeholders from Postmark template content (Mustachio syntax)
// Returns FULL paths (e.g. "mensaje.proyecto") so the UI can build a properly nested mapping.
function extractVariables(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  // Match {{ var }}, {{var}}, {{#each}}, {{/each}}, etc. We only want simple variable refs.
  const regex = /\{\{\s*([#\/\^]?)\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const prefix = m[1];
    const name = m[2];
    // Skip helpers/sections (#each, /each, ^if). Only collect plain vars.
    if (prefix) continue;
    if (!name || name === 'this') continue;
    // Keep the FULL dotted path (e.g. "mensaje.proyecto") so the UI can build nested JSON.
    found.add(name);
  }
  return Array.from(found);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
    if (!POSTMARK_TOKEN) {
      return new Response(JSON.stringify({ error: 'POSTMARK_SERVER_TOKEN no configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    let templateId: string | null = url.searchParams.get('templateId');

    if (!templateId && req.method === 'POST') {
      try {
        const body = await req.json();
        templateId = body?.templateId ? String(body.templateId) : null;
      } catch (_) { /* ignore */ }
    }

    if (!templateId) {
      return new Response(JSON.stringify({ error: 'templateId requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`https://api.postmarkapp.com/templates/${templateId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Server-Token': POSTMARK_TOKEN,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Error consultando Postmark', detail: text }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    const subject = data.Subject || '';
    const htmlBody = data.HtmlBody || '';
    const textBody = data.TextBody || '';

    const variables = Array.from(new Set([
      ...extractVariables(subject),
      ...extractVariables(htmlBody),
      ...extractVariables(textBody),
    ])).sort();

    return new Response(JSON.stringify({
      id: data.TemplateId,
      name: data.Name,
      alias: data.Alias,
      subject,
      variables,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});