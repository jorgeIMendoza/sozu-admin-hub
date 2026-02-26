import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offerIds, recipientEmail, recipientName, propertyNumber, hideBanking, preGeneratedAttachments } = await req.json();

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'recipientEmail requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN');
    if (!POSTMARK_TOKEN) {
      return new Response(JSON.stringify({ error: 'POSTMARK_SERVER_TOKEN no configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const attachments: { Name: string; Content: string; ContentType: string }[] = [];
    const pdfResults: { offerId: number; fileName: string; tipo: string }[] = [];

    // If pre-generated attachments are provided (client-side generated PDFs), use them directly
    if (preGeneratedAttachments && Array.isArray(preGeneratedAttachments) && preGeneratedAttachments.length > 0) {
      console.log(`Using ${preGeneratedAttachments.length} pre-generated attachment(s)`);
      for (const att of preGeneratedAttachments) {
        if (att.base64 && att.filename) {
          attachments.push({
            Name: att.filename,
            Content: att.base64,
            ContentType: 'application/pdf',
          });
          pdfResults.push({ offerId: att.offerId || 0, fileName: att.filename, tipo: att.tipo || 'propiedad' });
          console.log(`Pre-generated PDF: ${att.filename} (base64 length: ${att.base64.length})`);
        }
      }
    } else if (offerIds && Array.isArray(offerIds) && offerIds.length > 0) {
      // Fallback: generate PDFs server-side via generar-oferta-pdf edge function
      console.log(`Generating ${offerIds.length} PDF(s) server-side`);
      for (const offerId of offerIds) {
        try {
          const genUrl = `${supabaseUrl}/functions/v1/generar-oferta-pdf`;
          const res = await fetch(genUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ offerId, includeBase64: true, hideBanking: !!hideBanking }),
          });

          const result = await res.json();
          if (result.success && result.pdfBase64) {
            const fileName = result.fileName || `Oferta_${offerId}.pdf`;
            const tipo = result.tipoOferta || 'propiedad';

            pdfResults.push({ offerId, fileName, tipo });
            attachments.push({
              Name: fileName,
              Content: result.pdfBase64,
              ContentType: 'application/pdf',
            });

            console.log(`PDF generated for offer ${offerId}: ${fileName} (base64 length: ${result.pdfBase64.length})`);
          } else {
            console.error(`Error generating PDF for offer ${offerId}:`, result);
          }
        } catch (err) {
          console.error(`Error calling generar-oferta-pdf for ${offerId}:`, err);
        }
      }
    } else {
      return new Response(JSON.stringify({ error: 'offerIds (array) o preGeneratedAttachments requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (attachments.length === 0) {
      return new Response(JSON.stringify({ error: 'No se pudieron generar los PDFs' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build descriptions for the email body
    const mainOffer = pdfResults.find(p => p.tipo === 'propiedad');
    const productOffers = pdfResults.filter(p => p.tipo === 'producto');

    let detallesHtml = '';
    if (mainOffer) {
      detallesHtml += `<tr><td class='label'>Oferta de propiedad:</td><td class='value'>${mainOffer.fileName}</td></tr>`;
    }
    if (productOffers.length > 0) {
      detallesHtml += `<tr><td class='label'>Ofertas de productos:</td><td class='value'>${productOffers.map(p => p.fileName).join(', ')}</td></tr>`;
    }
    detallesHtml += `<tr><td class='label'>Propiedad:</td><td class='value'>${propertyNumber || 'N/A'}</td></tr>`;
    detallesHtml += `<tr><td class='label'>Archivos adjuntos:</td><td class='value'>${attachments.length} PDF(s)</td></tr>`;

    // Send email via Postmark with attachments
    const emailRes = await fetch('https://api.postmarkapp.com/email/withTemplate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': POSTMARK_TOKEN,
      },
      body: JSON.stringify({
        From: 'Notificaciones Sozu <notificaciones@sozu.com>',
        To: recipientEmail,
        TemplateId: 41353048,
        TemplateModel: {
          mensaje: {
            nombre: recipientName || '',
            actividad: 'Oferta comercial',
            asunto: `Tu oferta comercial para la propiedad ${propertyNumber || ''}`,
            detalles: detallesHtml,
          },
        },
        Attachments: attachments,
        MessageStream: 'outbound',
      }),
    });

    const emailResult = await emailRes.json();
    console.log('Email sent:', emailRes.status, JSON.stringify(emailResult).substring(0, 300));

    if (emailResult.ErrorCode && emailResult.ErrorCode !== 0) {
      return new Response(JSON.stringify({ 
        error: `Error al enviar email: ${emailResult.Message}`,
        errorCode: emailResult.ErrorCode 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Oferta enviada a ${recipientEmail}`,
      pdfsGenerated: pdfResults.length,
      attachmentsSent: attachments.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error in enviar-oferta-email:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});