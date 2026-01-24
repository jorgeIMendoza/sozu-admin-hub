import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { id_cuenta_cobranza, id_persona, xml_url, csf_url, ambiente } = await req.json()

    if (!id_cuenta_cobranza || !id_persona || !xml_url || !csf_url) {
      console.error('Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'id_cuenta_cobranza, id_persona, xml_url, and csf_url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing SAT notification for cuenta_cobranza: ${id_cuenta_cobranza}, persona: ${id_persona}`)

    // Get the N8N webhook base URL from secrets
    const n8nBaseUrl = Deno.env.get('N8N_WEBHOOK_BASE_URL')
    if (!n8nBaseUrl) {
      console.error('N8N_WEBHOOK_BASE_URL secret not configured')
      return new Response(
        JSON.stringify({ error: 'N8N webhook URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const webhookUrl = `${n8nBaseUrl}/extraerDatosXmlCsf`
    console.log(`Calling N8N webhook: ${webhookUrl}`)

    // Call the N8N webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id_cuenta_cobranza,
        id_persona,
        xml_url,
        csf_url,
        ambiente: ambiente || 'produccion',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`N8N webhook error: ${response.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: 'Failed to trigger SAT notification', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check content type to determine if it's a file or JSON
    const contentType = response.headers.get('content-type') || ''
    console.log(`Response content-type: ${contentType}`)
    
    // If it's an Excel file, return it as base64
    if (contentType.includes('application/vnd.ms-excel') || 
        contentType.includes('application/vnd.openxmlformats') ||
        contentType.includes('application/octet-stream')) {
      const fileBuffer = await response.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))
      
      console.log(`SAT notification file received, size: ${fileBuffer.byteLength} bytes`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          file: base64,
          contentType: contentType,
          filename: `notificacion_sat_${id_cuenta_cobranza}_${Date.now()}.xlsm`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Otherwise treat as JSON - return the extracted data
    const responseText = await response.text()
    console.log(`Raw N8N response (first 2000 chars): ${responseText.substring(0, 2000)}`)
    
    let result
    try {
      result = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse N8N response as JSON:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from N8N', rawResponse: responseText.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`SAT notification data extracted for cuenta_cobranza: ${id_cuenta_cobranza}`)
    console.log(`Response structure keys: ${JSON.stringify(Object.keys(result))}`)
    
    // Check if n8n returned an error message
    if (result.message && Object.keys(result).length === 1) {
      console.error('N8N returned only a message:', result.message)
      return new Response(
        JSON.stringify({ error: 'N8N processing error', message: result.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Handle both wrapped and unwrapped responses
    // n8n may return the data directly or wrapped in documentos_procesados (sometimes double-wrapped)
    let documentos = result.documentos_procesados || result
    
    // If n8n returns an array, take the first element
    if (Array.isArray(documentos)) {
      documentos = documentos[0]
    }
    
    // Handle double-nesting: if documentos has its own documentos_procesados, unwrap it
    if (documentos.documentos_procesados && !documentos.constancia_situacion_fiscal) {
      console.log('Detected double-nested documentos_procesados, unwrapping...')
      documentos = documentos.documentos_procesados
    }
    
    console.log(`Final documentos keys: ${JSON.stringify(Object.keys(documentos))}`)
    console.log(`Has CSF: ${!!documentos.constancia_situacion_fiscal}`)
    console.log(`Has CFDI: ${!!documentos.factura_cfdi}`)

    return new Response(
      JSON.stringify({ success: true, result: { documentos_procesados: documentos } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in trigger-sat-notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
