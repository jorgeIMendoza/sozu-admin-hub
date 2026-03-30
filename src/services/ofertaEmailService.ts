import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isValidRFC } from "@/utils/fiscalDataValidation";

interface SendOfferEmailParams {
  offerId: number;
  propertyNumber?: string;
  recipientEmail?: string;
  recipientName?: string;
  /** Tipo de oferta: 'propiedad' o 'producto' */
  tipo?: 'propiedad' | 'producto';
}

/**
 * Verifica si la oferta de propiedad muestra la sección de datos bancarios.
 * Replica la lógica de ofertaPdfNativeService.ts (líneas 791-798).
 */
async function shouldShowBankingForProperty(offerId: number): Promise<boolean> {
  try {
    const { data: oferta } = await supabase
      .from('ofertas')
      .select('id_esquema_pago_seleccionado, id_propiedad, id_persona_lead')
      .eq('id', offerId)
      .single();

    if (!oferta) return false;

    // Condición 1: debe tener esquema de pago seleccionado
    if (!oferta.id_esquema_pago_seleccionado) {
      console.log(`[ofertaEmail] Oferta ${offerId} sin esquema de pago, no muestra datos bancarios`);
      return false;
    }

    // Condición 2: el lead debe tener RFC válido
    if (oferta.id_persona_lead) {
      const { data: persona } = await supabase
        .from('personas')
        .select('rfc')
        .eq('id', oferta.id_persona_lead)
        .single();

      if (!isValidRFC(persona?.rfc)) {
        console.log(`[ofertaEmail] Oferta ${offerId}: lead sin RFC válido, no muestra datos bancarios`);
        return false;
      }
    } else {
      console.log(`[ofertaEmail] Oferta ${offerId} sin lead, no muestra datos bancarios`);
      return false;
    }

    // Condición 3: debe tener CLABE o sección efectivo habilitada con cuenta del dueño
    if (oferta.id_propiedad) {
      const { data: propiedad } = await (supabase as any)
        .from('propiedades')
        .select('clabe_stp_tmp_apartado, id_edificio_modelo')
        .eq('id', oferta.id_propiedad)
        .single();

      if (!propiedad) return false;

      const hasClabe = !!propiedad.clabe_stp_tmp_apartado;

      if (hasClabe) return true;

      // Si no tiene CLABE, buscar el proyecto a través de edificios_modelos → edificios → proyectos
      if (propiedad.id_edificio_modelo) {
        const { data: edModelo } = await (supabase as any)
          .from('edificios_modelos')
          .select('id_edificio')
          .eq('id', propiedad.id_edificio_modelo)
          .single();

        if (edModelo?.id_edificio) {
          const { data: edificio } = await (supabase as any)
            .from('edificios')
            .select('id_proyecto')
            .eq('id', edModelo.id_edificio)
            .single();

          if (edificio?.id_proyecto) {
            const { data: proyecto } = await (supabase as any)
              .from('proyectos')
              .select('mostrar_seccion_efectivo_en_oferta')
              .eq('id', edificio.id_proyecto)
              .single();

            if (proyecto?.mostrar_seccion_efectivo_en_oferta) {
              // Verificar si hay cuenta bancaria del dueño (ownerStpBankAccount)
              const { data: duenos } = await (supabase as any)
                .from('duenos_proyectos')
                .select('id_persona')
                .eq('id_proyecto', edificio.id_proyecto)
                .eq('activo', true)
                .eq('id_tipo_dueno', 1)
                .limit(1);

              if (duenos && duenos.length > 0) {
                const { data: cuentas } = await (supabase as any)
                  .from('cuentas_bancarias')
                  .select('clabe_stp')
                  .eq('id_persona', duenos[0].id_persona)
                  .eq('activo', true)
                  .not('clabe_stp', 'is', null)
                  .limit(1);

                if (cuentas && cuentas.length > 0 && cuentas[0].clabe_stp) {
                  return true;
                }
              }
            }
          }
        }
      }

      console.log(`[ofertaEmail] Oferta ${offerId}: sin CLABE ni sección efectivo, no muestra datos bancarios`);
      return false;
    }

    return false;
  } catch (err) {
    console.error(`[ofertaEmail] Error verificando datos bancarios para oferta ${offerId}:`, err);
    return false;
  }
}

/**
 * Verifica si la oferta de producto muestra la sección de datos bancarios.
 * Replica la lógica de ofertaProductoPdfNativeService.ts (líneas 491-495).
 */
async function shouldShowBankingForProduct(offerId: number): Promise<boolean> {
  try {
    const { data: oferta } = await (supabase as any)
      .from('ofertas')
      .select('id_esquema_pago_seleccionado, clabe_stp_tmp_producto')
      .eq('id', offerId)
      .single();

    if (!oferta) return false;

    if (!oferta.id_esquema_pago_seleccionado) {
      console.log(`[ofertaEmail] Oferta producto ${offerId} sin esquema de pago, no muestra datos bancarios`);
      return false;
    }

    const hasClabe = !!oferta.clabe_stp_tmp_producto;
    if (hasClabe) return true;

    // Sin CLABE, verificar si hay cuenta de efectivo del dueño del producto
    // (ownerStpBankAccount en el PDF de producto)
    // Simplificación: si no tiene CLABE de producto, no muestra banking
    console.log(`[ofertaEmail] Oferta producto ${offerId}: sin CLABE de producto, no muestra datos bancarios`);
    return false;
  } catch (err) {
    console.error(`[ofertaEmail] Error verificando datos bancarios para oferta producto ${offerId}:`, err);
    return false;
  }
}

/**
 * Envía la oferta por correo electrónico al prospecto de forma fire-and-forget.
 * No bloquea la descarga del PDF ni lanza errores.
 * RESTRICCIÓN: Solo envía si la oferta muestra la sección de datos bancarios.
 */
export async function sendOfferEmailAfterDownload(params: SendOfferEmailParams): Promise<boolean> {
  try {
    let { offerId, propertyNumber, recipientEmail, recipientName, tipo } = params;

    // Validar si la oferta muestra datos bancarios
    const isProduct = tipo === 'producto';
    const showBanking = isProduct
      ? await shouldShowBankingForProduct(offerId)
      : await shouldShowBankingForProperty(offerId);

    if (!showBanking) {
      console.log(`[ofertaEmail] Oferta ${offerId} (${tipo || 'propiedad'}) no muestra datos bancarios, NO se envía por correo automáticamente`);
      return false;
    }

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
