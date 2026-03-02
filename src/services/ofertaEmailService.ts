import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SendOfferEmailParams {
  offerId: number;
  propertyNumber?: string;
  recipientEmail?: string;
  recipientName?: string;
}

/**
 * Envía la oferta por correo electrónico al prospecto de forma fire-and-forget.
 * No bloquea la descarga del PDF ni lanza errores.
 */
export async function sendOfferEmailAfterDownload(params: SendOfferEmailParams): Promise<void> {
  try {
    let { offerId, propertyNumber, recipientEmail, recipientName } = params;

    // Si no tenemos email, consultar de la BD
    if (!recipientEmail) {
      const { data: oferta } = await supabase
        .from('ofertas')
        .select('id_persona_lead')
        .eq('id', offerId)
        .single();

      if (!oferta?.id_persona_lead) {
        console.log(`[ofertaEmail] Oferta ${offerId} sin id_persona_lead, no se envía email`);
        return;
      }

      const { data: persona } = await supabase
        .from('personas')
        .select('email, nombre_legal')
        .eq('id', oferta.id_persona_lead)
        .single();

      if (!persona?.email) {
        toast({
          title: "Sin correo del prospecto",
          description: "La oferta se descargó pero no se pudo enviar por correo porque el prospecto no tiene email registrado.",
          duration: 5000,
        });
        return;
      }

      recipientEmail = persona.email;
      recipientName = recipientName || persona.nombre_legal || '';
    }

    // Llamar al edge function
    const { error } = await supabase.functions.invoke('enviar-oferta-email', {
      body: {
        offerIds: [offerId],
        recipientEmail,
        recipientName: recipientName || '',
        propertyNumber: propertyNumber || '',
      },
    });

    if (error) {
      console.error('[ofertaEmail] Error al enviar email:', error);
      toast({
        title: "Email no enviado",
        description: "La oferta se descargó pero no se pudo enviar por correo.",
        duration: 4000,
      });
      return;
    }

    toast({
      title: "Oferta enviada por correo",
      description: `Se envió la oferta a ${recipientEmail}`,
      duration: 4000,
    });
  } catch (err) {
    console.error('[ofertaEmail] Error inesperado:', err);
    // Fire-and-forget: no lanzar error
  }
}
