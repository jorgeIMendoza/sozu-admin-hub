import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OfertaPdfData {
  offerId: number;
}

export interface OfertaPdfResponse {
  success: boolean;
  url_oferta: string;
  fileName: string;
  expiresIn: string;
  tipoOferta: 'propiedad' | 'producto';
  offerId: number;
}

export class OfertaPdfEdgeFunctionService {
  /**
   * Genera un PDF de oferta usando el Edge Function centralizado.
   * El PDF se genera en el servidor y se descarga automáticamente.
   */
  async generateOfertaPdf(data: OfertaPdfData): Promise<string | null> {
    try {
      console.log('Calling generar-oferta-pdf Edge Function with offerId:', data.offerId);
      
      const { data: response, error } = await supabase.functions.invoke('generar-oferta-pdf', {
        body: { offerId: data.offerId }
      });

      if (error) {
        console.error('Error calling Edge Function:', error);
        toast.error('Error al generar el PDF de la oferta');
        throw error;
      }

      if (!response?.success || !response?.url_oferta) {
        console.error('Invalid response from Edge Function:', response);
        toast.error(response?.error || 'Error al generar el PDF de la oferta');
        return null;
      }

      console.log('Oferta PDF generated successfully:', response.url_oferta);
      
      // Open the PDF in a new tab
      window.open(response.url_oferta, '_blank');
      
      return response.url_oferta;
    } catch (error) {
      console.error('Error generating oferta PDF:', error);
      throw error;
    }
  }

  /**
   * Genera el PDF y retorna solo la URL sin abrir en nueva pestaña.
   * Útil para integraciones con sistemas externos.
   */
  async getOfertaPdfUrl(data: OfertaPdfData): Promise<OfertaPdfResponse | null> {
    try {
      console.log('Getting oferta PDF URL for offerId:', data.offerId);
      
      const { data: response, error } = await supabase.functions.invoke('generar-oferta-pdf', {
        body: { offerId: data.offerId }
      });

      if (error) {
        console.error('Error calling Edge Function:', error);
        throw error;
      }

      if (!response?.success || !response?.url_oferta) {
        console.error('Invalid response from Edge Function:', response);
        return null;
      }

      return response as OfertaPdfResponse;
    } catch (error) {
      console.error('Error getting oferta PDF URL:', error);
      throw error;
    }
  }
}

// Export a singleton instance for convenience
export const ofertaPdfEdgeFunctionService = new OfertaPdfEdgeFunctionService();
